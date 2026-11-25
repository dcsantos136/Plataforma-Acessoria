import { reply, cookieToken, sessionCookieName, sha256, clearSessionCookie, sameOrigin } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const token = cookieToken(request, sessionCookieName(request));
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return reply({ ok: true }, 200, { "set-cookie": clearSessionCookie(request) });
}
