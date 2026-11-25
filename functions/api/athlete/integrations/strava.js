import { baseUrl, randomToken, reply, requireUser, sha256 } from "../../../_lib/auth.js";

const stateCookieName = request => new URL(request.url).protocol === "https:" ? "__Host-vetra_strava_state" : "vetra_strava_state";
const setStateCookie = (request, state) => stateCookieName(request) + "=" + encodeURIComponent(state) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" + (new URL(request.url).protocol === "https:" ? "; Secure" : "");
const clearStateCookie = request => stateCookieName(request) + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (new URL(request.url).protocol === "https:" ? "; Secure" : "");
const getCookie = (request, name) => { const item = (request.headers.get("Cookie") || "").split(";").map(value => value.trim()).find(value => value.startsWith(name + "=")); return item ? decodeURIComponent(item.slice(name.length + 1)) : ""; };

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET || !env.WEARABLES_ENCRYPTION_KEY) return reply({ error: "A integração Strava ainda não foi configurada." }, 503);

  const state = randomToken(32);
  await env.DB.prepare("DELETE FROM wearable_oauth_states WHERE created_at<=?").bind(new Date(Date.now() - 10 * 60 * 1000).toISOString()).run();
  await env.DB.prepare("INSERT INTO wearable_oauth_states (state_hash,user_id,provider) VALUES (?,?,'strava')").bind(await sha256(state), user.user_id).run();
  const redirectUri = baseUrl(request, env) + "/api/athlete/integrations/strava/callback";
  const authorization = new URL("https://www.strava.com/oauth/authorize");
  authorization.search = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: "code", redirect_uri: redirectUri, approval_prompt: "auto", scope: "read,activity:read_all", state }).toString();
  return new Response(null, { status: 302, headers: { location: authorization.toString(), "set-cookie": setStateCookie(request, state), "cache-control": "no-store" } });
}
