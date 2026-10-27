// GuipaHub — renova o acesso ao Drive sem ida ao Google (ver 24-drive-sem-piscar.sql)
//
// POST { guardar: "<refresh token>" } → guarda o refresh token de quem chamou
// POST {}                              → devolve { access_token, expires_in } novo
//
// Só atende sessão do GuipaHub aberta pelo Google com e-mail @guipabrasil.com
// (mesma regra do entrou_pelo_google() no banco). O segredo do cliente Google
// vive só aqui, no segredo GOOGLE_CLIENT_SECRET da função.

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGENS = ["https://guipahub.onrender.com", "http://localhost:5173"];
const DOMINIO = "@guipabrasil.com";

function cabecalhos(origem: string) {
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// O JWT já foi validado pelo getUser; aqui só se lê o `amr` de dentro dele.
function lerPayload(jwt: string) {
  try {
    let b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return JSON.parse(atob(b));
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get("origin") || "");
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...h, "Content-Type": "application/json" } });

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (error || !user) return resp(401, { erro: "sessao" });
  const peloGoogle =
    user.app_metadata?.provider === "google" &&
    (lerPayload(jwt).amr || []).some((a: { method?: string }) => a.method === "oauth");
  if (!peloGoogle || !String(user.email || "").toLowerCase().endsWith(DOMINIO)) {
    return resp(403, { erro: "fora" });
  }

  const corpo = await req.json().catch(() => ({}));

  if (typeof corpo.guardar === "string" && corpo.guardar) {
    const { error: e } = await admin
      .from("drive_tokens")
      .upsert({ user_id: user.id, refresh_token: corpo.guardar, atualizado_em: new Date().toISOString() });
    return e ? resp(500, { erro: "gravar" }) : resp(200, { ok: true });
  }

  const { data: linha } = await admin
    .from("drive_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!linha) return resp(404, { erro: "sem_token" });

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const segredo = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !segredo) return resp(503, { erro: "sem_segredo" });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: segredo,
      refresh_token: linha.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const g = await r.json().catch(() => ({}));
  if (!r.ok || !g.access_token) {
    // Acesso retirado na conta Google, ou token velho: esquece, e o app
    // volta a pedir pelo caminho do Google uma vez.
    if (g.error === "invalid_grant") await admin.from("drive_tokens").delete().eq("user_id", user.id);
    return resp(404, { erro: g.error || "google" });
  }
  return resp(200, { access_token: g.access_token, expires_in: g.expires_in || 3600 });
});
