import { reply, randomToken, sha256, rateLimit, baseUrl, setOAuthStateCookie, clearOAuthStateCookie } from "./auth.js";
const enc = new TextEncoder();
const b64u = (bytes) => { let s=""; for (const b of bytes) s+=String.fromCharCode(b); return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,""); };
export async function beginOAuth(request, env, provider) {
  const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.APPLE_CLIENT_ID;
  const ready = provider === "google" ? clientId && env.GOOGLE_CLIENT_SECRET : clientId && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY;
  if (!ready) return Response.redirect(new URL("/?auth=provider-unavailable#" + (new URL(request.url).searchParams.get("screen") || "signup"), baseUrl(request, env)).toString(), 303);
  if (!await rateLimit(env, request, "oauth-" + provider, 20)) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);
  const query = new URL(request.url).searchParams, intent = query.get("intent") === "signup" ? "signup" : "login";
  const role = ["treinador(a)", "atleta"].includes(query.get("role")) ? query.get("role") : "treinador(a)";
  const accepted = query.get("termsAccepted") === "1";
  if (intent === "signup" && !accepted) return Response.redirect(new URL("/?auth=terms-required#signup", baseUrl(request, env)).toString(), 303);
  const state = randomToken(), nonce = randomToken(), verifier = provider === "google" ? randomToken(48) : null;
  await env.DB.prepare("INSERT INTO oauth_states (state_hash,provider,nonce,code_verifier,role,intent,terms_accepted_at) VALUES (?,?,?,?,?,?,?)")
    .bind(await sha256(state), provider, nonce, verifier, role, intent, accepted ? new Date().toISOString() : null).run();
  const callback = new URL("/api/auth/" + provider + "/callback", baseUrl(request, env)).toString();
  const authUrl = provider === "google" ? new URL("https://accounts.google.com/o/oauth2/v2/auth") : new URL("https://appleid.apple.com/auth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callback);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", provider === "google" ? "openid email profile" : "name email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  if (provider === "google") {
    authUrl.searchParams.set("code_challenge", b64u(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("prompt", "select_account");
  } else {
    authUrl.searchParams.set("response_mode", "form_post");
  }
  return new Response(null, { status: 302, headers: { location: authUrl.toString(), "set-cookie": setOAuthStateCookie(request, state), "cache-control": "no-store" } });
}
export async function exchangeCode(provider, code, state, env, request) {
  const clientId = provider === "google" ? env.GOOGLE_CLIENT_ID : env.APPLE_CLIENT_ID;
  const callback = new URL("/api/auth/" + provider + "/callback", baseUrl(request, env)).toString();
  const body = new URLSearchParams({ client_id: clientId, client_secret: provider === "google" ? env.GOOGLE_CLIENT_SECRET : await appleClientSecret(env), code, grant_type: "authorization_code", redirect_uri: callback });
  if (provider === "google") body.set("code_verifier", state.code_verifier);
  const response = await fetch(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("O provedor recusou a autenticação.");
  return response.json();
}
async function appleClientSecret(env) {
  const strip = String(env.APPLE_PRIVATE_KEY).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(strip), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(enc.encode(JSON.stringify({ alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" })));
  const payload = b64u(enc.encode(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: env.APPLE_CLIENT_ID })));
  const input = header + "." + payload;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input)));
  return input + "." + b64u(signature);
}
export function successRedirect(request, env, cookie, user) {
  const url = new URL("/", baseUrl(request, env));
  url.searchParams.set("auth", "success");
  url.hash = user.role === "treinador(a)" ? "dashboard" : "dashboard";
  const headers = new Headers({ location: url.toString(), "cache-control": "no-store" }); headers.append("set-cookie", cookie); headers.append("set-cookie", clearOAuthStateCookie(request)); return new Response(null, { status: 303, headers });
}
export function errorRedirect(request, env, code) {
  const url = new URL("/", baseUrl(request, env)); url.searchParams.set("auth", code); url.hash = "login";
  const headers = new Headers({ location: url.toString(), "cache-control": "no-store" }); headers.append("set-cookie", clearOAuthStateCookie(request)); return new Response(null, { status: 303, headers });
}


