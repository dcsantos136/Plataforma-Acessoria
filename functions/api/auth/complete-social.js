import { reply, parseJson, sameOrigin, rateLimit, cookieToken, pendingOAuthCookieName, clearPendingOAuthCookie, sha256, randomToken, createSession, setSessionCookie } from "../../_lib/auth.js";

function userResponse(user, status, cookies) {
  const response = reply({ user }, status, { "cache-control": "no-store" });
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  if (!await rateLimit(env, request, "oauth-complete", 8)) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, { "retry-after": "900" });
  const data = await parseJson(request), token = cookieToken(request, pendingOAuthCookieName(request));
  const role = String(data?.role || ""), accepted = data?.termsAccepted === true;
  if (!token || token.length > 128) return reply({ error: "Seu cadastro expirou. Entre com Google novamente." }, 401, { "set-cookie": clearPendingOAuthCookie(request) });
  if (!['treinador(a)', 'atleta'].includes(role)) return reply({ error: "Escolha se você é atleta ou treinador(a)." }, 400);
  if (!accepted) return reply({ error: "Aceite os termos para continuar." }, 400);

  const tokenHash = await sha256(token), now = new Date().toISOString();
  const pending = await env.DB.prepare("SELECT provider,provider_subject,email,email_normalized,name FROM pending_oauth_registrations WHERE token_hash=? AND expires_at>? AND created_at>? LIMIT 1")
    .bind(tokenHash, now, new Date(Date.now() - 10 * 60 * 1000).toISOString()).first();
  if (!pending) return reply({ error: "Seu cadastro expirou. Entre com Google novamente." }, 401, { "set-cookie": clearPendingOAuthCookie(request) });

  const linked = await env.DB.prepare("SELECT u.id,u.name,u.email,u.role FROM oauth_accounts o JOIN users u ON u.id=o.user_id WHERE o.provider=? AND o.provider_subject=?")
    .bind(pending.provider, pending.provider_subject).first();
  const existing = linked || await env.DB.prepare("SELECT id,name,email,role FROM users WHERE email_normalized=?").bind(pending.email_normalized).first();
  if (existing) {
    const statements = [];
    if (!linked) statements.push(env.DB.prepare("INSERT OR IGNORE INTO oauth_accounts (provider,provider_subject,user_id,email,email_verified) VALUES (?,?,?,?,1)").bind(pending.provider, pending.provider_subject, existing.id, pending.email_normalized));
    statements.push(env.DB.prepare("DELETE FROM pending_oauth_registrations WHERE token_hash=?").bind(tokenHash));
    await env.DB.batch(statements);
    const sessionCookie = await createSession(env, existing.id, request);
    return userResponse(existing, 200, [sessionCookie, clearPendingOAuthCookie(request)]);
  }

  const id = crypto.randomUUID(), sessionToken = randomToken(), salt = crypto.getRandomValues(new Uint8Array(16));
  const name = String(pending.name || pending.email.split("@")[0]).trim().slice(0, 120) || pending.email.split("@")[0];
  const termsAcceptedAt = now, expires = new Date(Date.now() + 7 * 86400000).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,name,email,email_normalized,role,password_salt,password_hash,password_algorithm,terms_accepted_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id, name, pending.email, pending.email_normalized, role, btoa(String.fromCharCode(...salt)), randomToken(32), "OAUTH-ONLY", termsAcceptedAt),
      env.DB.prepare("INSERT INTO oauth_accounts (provider,provider_subject,user_id,email,email_verified) VALUES (?,?,?,?,1)")
        .bind(pending.provider, pending.provider_subject, id, pending.email_normalized),
      env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)")
        .bind(await sha256(sessionToken), id, expires),
      env.DB.prepare("DELETE FROM pending_oauth_registrations WHERE token_hash=?").bind(tokenHash)
    ]);
  } catch (error) {
    const raced = await env.DB.prepare("SELECT id,name,email,role FROM users WHERE email_normalized=?").bind(pending.email_normalized).first();
    if (!raced) return reply({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 409);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO oauth_accounts (provider,provider_subject,user_id,email,email_verified) VALUES (?,?,?,?,1)").bind(pending.provider, pending.provider_subject, raced.id, pending.email_normalized),
      env.DB.prepare("DELETE FROM pending_oauth_registrations WHERE token_hash=?").bind(tokenHash)
    ]);
    const sessionCookie = await createSession(env, raced.id, request);
    return userResponse(raced, 200, [sessionCookie, clearPendingOAuthCookie(request)]);
  }

  return userResponse({ id, name, email: pending.email, role }, 201, [setSessionCookie(request, sessionToken), clearPendingOAuthCookie(request)]);
}
