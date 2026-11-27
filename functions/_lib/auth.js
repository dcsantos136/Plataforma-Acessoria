const enc = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers } });
const b64u = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, ""); };
const fromB64u = (s) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
export const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export const sha256 = async (s) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
export const reply = json;
export const parseJson = async (request) => { try { return await request.json(); } catch { return null; } };
export const cookieToken = (request, key) => { const found = (request.headers.get("Cookie") || "").split(";").map(s => s.trim()).find(s => s.startsWith(key + "=")); return found ? decodeURIComponent(found.slice(key.length + 1)) : ""; };
const isHttps = (request) => new URL(request.url).protocol === "https:";
export const setSessionCookie = (request, token) => (isHttps(request) ? "__Host-vetra_session" : "vetra_session") + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800" + (isHttps(request) ? "; Secure" : "");
export const clearSessionCookie = (request) => (isHttps(request) ? "__Host-vetra_session" : "vetra_session") + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (isHttps(request) ? "; Secure" : "");
export const sessionCookieName = (request) => isHttps(request) ? "__Host-vetra_session" : "vetra_session";
export const oauthCookieName = (request) => isHttps(request) ? "__Host-vetra_oauth" : "vetra_oauth";
export const pendingOAuthCookieName = (request) => isHttps(request) ? "__Host-vetra_pending_oauth" : "vetra_pending_oauth";
export const setPendingOAuthCookie = (request, token) => pendingOAuthCookieName(request) + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" + (isHttps(request) ? "; Secure" : "");
export const clearPendingOAuthCookie = (request) => pendingOAuthCookieName(request) + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (isHttps(request) ? "; Secure" : "");
export const setOAuthStateCookie = (request, state) => oauthCookieName(request) + "=" + encodeURIComponent(state) + "; Path=/; HttpOnly; SameSite=" + (isHttps(request) ? "None; Secure" : "Lax") + "; Max-Age=600";
export const clearOAuthStateCookie = (request) => oauthCookieName(request) + "=; Path=/; HttpOnly; SameSite=" + (isHttps(request) ? "None; Secure" : "Lax") + "; Max-Age=0";
export const oauthStateMatches = (request, state) => Boolean(state && cookieToken(request, oauthCookieName(request)) === state);
export async function createSession(env, userId, request) {
  const token = randomToken();
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(token), userId, expires).run();
  return setSessionCookie(request, token);
}
export async function getSession(request, env) {
  const token = cookieToken(request, sessionCookieName(request));
  if (!token || token.length > 128) return null;
  const session = await env.DB.prepare("SELECT s.token_hash,s.user_id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?").bind(await sha256(token), new Date().toISOString()).first();
  return session || null;
}
export async function requireUser(request, env, role) {
  const session = await getSession(request, env);
  if (!session) return { error: json({ error: "Sessão expirada. Entre novamente." }, 401) };
  if (role && session.role !== role) return { error: json({ error: "Acesso não autorizado." }, 403) };
  return { user: session };
}
export async function sameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  let expected;
  try { expected = new URL(env.APP_BASE_URL || request.url).origin; } catch { return false; }
  return origin === expected;
}
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 }, key, 256)));
}
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b)); let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
export async function rateLimit(env, request, action, max = 10, windowSeconds = 900) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(action + ":" + ip);
  const sql = "INSERT INTO auth_rate_limits (key_hash,window_start,attempts) VALUES (?,unixepoch(),1) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN window_start < unixepoch()-? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start < unixepoch()-? THEN unixepoch() ELSE window_start END RETURNING attempts";
  const row = await env.DB.prepare(sql).bind(key, windowSeconds, windowSeconds).first();
  return Number(row?.attempts || 0) <= max;
}
export const baseUrl = (request, env) => {
  const configured = env.APP_BASE_URL;
  if (!configured) return new URL(request.url).origin;
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_BASE_URL precisa usar HTTPS.");
  return url.origin;
};
export function redirectToApp(request, env, fragment = "login", message = "") {
  const url = new URL("/app.html", baseUrl(request, env));
  url.searchParams.set("auth", message || "success");
  url.hash = fragment;
  return Response.redirect(url.toString(), 303);
}
export async function consumeOAuthState(env, state, provider) {
  if (!state || state.length > 256) return null;
  const sql = "DELETE FROM oauth_states WHERE state_hash=? AND provider=? AND created_at > ? RETURNING provider,nonce,code_verifier,role,intent,terms_accepted_at";
  return env.DB.prepare(sql).bind(await sha256(state), provider, new Date(Date.now() - 10 * 60 * 1000).toISOString()).first();
}
export async function verifyOidcToken(token, provider, expectedClientId, expectedNonce) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token de identidade inválido.");
  const header = JSON.parse(new TextDecoder().decode(fromB64u(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Assinatura de identidade inválida.");
  const config = provider === "google" ? { issuer: "https://accounts.google.com", keys: "https://www.googleapis.com/oauth2/v3/certs" } : { issuer: "https://appleid.apple.com", keys: "https://appleid.apple.com/auth/keys" };
  const jwksResponse = await fetch(config.keys, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!jwksResponse.ok) throw new Error("Não foi possível validar a identidade.");
  const jwks = await jwksResponse.json();
  const jwk = jwks.keys?.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("Chave de assinatura desconhecida.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== config.issuer || !audience.includes(expectedClientId) || Number(claims.exp) <= now || Number(claims.iat) > now + 120 || claims.nonce !== expectedNonce) throw new Error("Não foi possível validar a identidade.");
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!claims.sub || !claims.email || !verified) throw new Error("O provedor não confirmou o e-mail.");
  return { sub: claims.sub, email: String(claims.email).trim(), name: String(claims.name || "").trim().slice(0, 120) };
}
export async function finishOAuth(env, request, provider, identity, state) {
  const email = identity.email.toLowerCase();
  const account = await env.DB.prepare("SELECT user_id FROM oauth_accounts WHERE provider=? AND provider_subject=?").bind(provider, identity.sub).first();
  let user = account ? await env.DB.prepare("SELECT id,name,email,role FROM users WHERE id=?").bind(account.user_id).first() : null;
  if (!user) {
    user = await env.DB.prepare("SELECT id,name,email,role FROM users WHERE email_normalized=?").bind(email).first();
    if (!user && state.intent !== "signup") {
      const token = randomToken(), name = identity.name || identity.email.split("@")[0];
      await env.DB.prepare("INSERT INTO pending_oauth_registrations (token_hash,provider,provider_subject,email,email_normalized,name,expires_at) VALUES (?,?,?,?,?,?,?)")
        .bind(await sha256(token), provider, identity.sub, identity.email, email, name, new Date(Date.now() + 10 * 60 * 1000).toISOString()).run();
      return { needsRole: true, pendingCookie: setPendingOAuthCookie(request, token) };
    }
    if (!user) {
      if (!state.terms_accepted_at) throw new Error("Aceite os termos antes de criar sua conta.");
      const id = crypto.randomUUID(), salt = crypto.getRandomValues(new Uint8Array(16));
      const name = identity.name || identity.email.split("@")[0];
      await env.DB.prepare("INSERT INTO users (id,name,email,email_normalized,role,password_salt,password_hash,password_algorithm,terms_accepted_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(id, name, identity.email, email, state.role, b64u(salt), randomToken(32), "OAUTH-ONLY", state.terms_accepted_at).run();
      user = { id, name, email: identity.email, role: state.role };
    }
    await env.DB.prepare("INSERT OR IGNORE INTO oauth_accounts (provider,provider_subject,user_id,email,email_verified) VALUES (?,?,?,?,1)").bind(provider, identity.sub, user.id, email).run();
  }
  return { user, setCookie: await createSession(env, user.id, request) };
}
