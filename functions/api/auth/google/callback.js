import { beginOAuth, exchangeCode, successRedirect, errorRedirect } from "../../../_lib/oauth.js";
import { consumeOAuthState, verifyOidcToken, finishOAuth, oauthStateMatches } from "../../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return errorRedirect(request, env, "google-error");
  try {
    const stateValue = url.searchParams.get("state"); if (!oauthStateMatches(request, stateValue)) return errorRedirect(request, env, "invalid-state");
    const state = await consumeOAuthState(env, stateValue, "google");
    if (!state || state.intent === "signup" && !state.terms_accepted_at) return errorRedirect(request, env, "invalid-state");
    const tokens = await exchangeCode("google", url.searchParams.get("code"), state, env, request);
    const identity = await verifyOidcToken(tokens.id_token, "google", env.GOOGLE_CLIENT_ID, state.nonce);
    const result = await finishOAuth(env, request, "google", identity, state);
    return successRedirect(request, env, result.setCookie, result.user);
  } catch {
    return errorRedirect(request, env, "google-error");
  }
}

