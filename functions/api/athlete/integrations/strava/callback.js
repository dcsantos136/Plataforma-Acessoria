import { baseUrl, cookieToken, reply, requireUser, sha256 } from "../../../../_lib/auth.js";
import { sealToken, syncStrava } from "../../../../_lib/wearables.js";

const stateCookieName = request => new URL(request.url).protocol === "https:" ? "__Host-vetra_strava_state" : "vetra_strava_state";
const clearStateCookie = request => stateCookieName(request) + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (new URL(request.url).protocol === "https:" ? "; Secure" : "");
const redirect = (request, env, status) => new Response(null, { status: 303, headers: { location: baseUrl(request, env) + "/?integration=" + encodeURIComponent(status) + "#integrations", "set-cookie": clearStateCookie(request), "cache-control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return redirect(request, env, "session_expired");
  if (url.searchParams.get("error")) return redirect(request, env, "cancelled");

  const state = String(url.searchParams.get("state") || "");
  if (!state || cookieToken(request, stateCookieName(request)) !== state) return redirect(request, env, "invalid_state");
  const stateRow = await env.DB.prepare("DELETE FROM wearable_oauth_states WHERE state_hash=? AND user_id=? AND provider='strava' AND created_at>? RETURNING state_hash")
    .bind(await sha256(state), user.user_id, new Date(Date.now() - 10 * 60 * 1000).toISOString()).first();
  if (!stateRow) return redirect(request, env, "invalid_state");

  const code = String(url.searchParams.get("code") || "");
  if (!code || code.length > 2048) return redirect(request, env, "failed");
  const redirectUri = baseUrl(request, env) + "/api/athlete/integrations/strava/callback";
  const tokenResponse = await fetch("https://www.strava.com/api/v3/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: redirectUri }) });
  if (!tokenResponse.ok) return redirect(request, env, "failed");
  const token = await tokenResponse.json();
  const accountId = String(token.athlete?.id || "");
  if (!token.access_token || !token.refresh_token || !accountId || !Number.isFinite(Number(token.expires_at))) return redirect(request, env, "failed");

  const otherOwner = await env.DB.prepare("SELECT user_id FROM wearable_connections WHERE provider='strava' AND provider_account_id=? AND user_id<>?").bind(accountId, user.user_id).first();
  if (otherOwner) return redirect(request, env, "account_in_use");
  const access = await sealToken(env, token.access_token), refresh = await sealToken(env, token.refresh_token);
  const displayName = [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(" ").slice(0, 120) || "Conta Strava";
  await env.DB.prepare("INSERT INTO wearable_connections (user_id,provider,provider_account_id,display_name,access_token_enc,refresh_token_enc,token_expires_at,scope) VALUES (?, 'strava',?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET provider_account_id=excluded.provider_account_id,display_name=excluded.display_name,access_token_enc=excluded.access_token_enc,refresh_token_enc=excluded.refresh_token_enc,token_expires_at=excluded.token_expires_at,scope=excluded.scope,connected_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(user.user_id, accountId, displayName, access, refresh, Number(token.expires_at), String(token.scope || "")).run();
  try { await syncStrava(env, user.user_id); } catch { /* A later manual sync can recover without losing the connection. */ }
  return redirect(request, env, "strava_connected");
}
