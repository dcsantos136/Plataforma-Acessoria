import { exchangeCode } from "../../../_lib/oauth.js";
import { consumeOAuthState, verifyOidcToken, finishOAuth, oauthStateMatches } from "../../../_lib/auth.js";
import { successRedirect, errorRedirect } from "../../../_lib/oauth.js";
export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData(), stateValue = String(form.get("state") || ""); if (!oauthStateMatches(request, stateValue)) return errorRedirect(request, env, "invalid-state");
    const state = await consumeOAuthState(env, stateValue, "apple");
    if (!state || state.intent === "signup" && !state.terms_accepted_at) return errorRedirect(request, env, "invalid-state");
    const code = String(form.get("code") || "");
    const tokens = await exchangeCode("apple", code, state, env, request);
    const identity = await verifyOidcToken(tokens.id_token, "apple", env.APPLE_CLIENT_ID, state.nonce);
    const userJson = form.get("user");
    if (userJson) {
      try {
        const profile = JSON.parse(String(userJson));
        identity.name = [profile.name?.firstName, profile.name?.lastName].filter(Boolean).join(" ").slice(0, 120) || identity.name;
      } catch {}
    }
    const result = await finishOAuth(env, request, "apple", identity, state);
    return successRedirect(request, env, result.setCookie, result.user);
  } catch {
    return errorRedirect(request, env, "apple-error");
  }
}

