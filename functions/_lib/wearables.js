import { sha256 } from "./auth.js";

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const optionalNumber = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

async function encryptionKey(env) {
  if (!env.WEARABLES_ENCRYPTION_KEY) throw new Error("A chave de criptografia das integrações ainda não foi configurada.");
  const raw = fromBase64(env.WEARABLES_ENCRYPTION_KEY.trim());
  if (raw.length !== 32) throw new Error("A chave de criptografia das integrações precisa ter 32 bytes em Base64.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  const payload = new Uint8Array(iv.length + encrypted.length);
  payload.set(iv); payload.set(encrypted, iv.length);
  return toBase64(payload);
}

export async function openToken(env, ciphertext) {
  const payload = fromBase64(ciphertext);
  const key = await encryptionKey(env);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: payload.slice(0, 12) }, key, payload.slice(12)));
}

export async function consumeWearableState(env, state, provider) {
  if (!state || state.length > 256) return null;
  return env.DB.prepare("DELETE FROM wearable_oauth_states WHERE state_hash=? AND provider=? AND created_at>? RETURNING user_id")
    .bind(await sha256(state), provider, new Date(Date.now() - 10 * 60 * 1000).toISOString()).first();
}

async function saveTokens(env, userId, provider, current, token) {
  const access = await sealToken(env, token.access_token);
  const refresh = await sealToken(env, token.refresh_token || await openToken(env, current.refresh_token_enc));
  await env.DB.prepare("UPDATE wearable_connections SET access_token_enc=?,refresh_token_enc=?,token_expires_at=?,scope=? WHERE user_id=? AND provider=?")
    .bind(access, refresh, Number(token.expires_at), String(token.scope || current.scope || ""), userId, provider).run();
  return { ...current, access_token_enc: access, refresh_token_enc: refresh, token_expires_at: Number(token.expires_at) };
}

export async function getStravaAccessToken(env, userId) {
  let connection = await env.DB.prepare("SELECT * FROM wearable_connections WHERE user_id=? AND provider='strava'").bind(userId).first();
  if (!connection) throw new Error("Conecte sua conta Strava primeiro.");
  if (Number(connection.token_expires_at) > Math.floor(Date.now() / 1000) + 60) return { connection, accessToken: await openToken(env, connection.access_token_enc) };

  const refreshToken = await openToken(env, connection.refresh_token_enc);
  const body = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken });
  const response = await fetch("https://www.strava.com/api/v3/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Não foi possível renovar a autorização do Strava. Reconecte a integração.");
  const token = await response.json();
  connection = await saveTokens(env, userId, "strava", connection, token);
  return { connection, accessToken: token.access_token };
}

export async function syncStrava(env, userId) {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) throw new Error("A integração Strava ainda não foi configurada.");
  const { connection, accessToken } = await getStravaAccessToken(env, userId);
  const after = Math.floor(Date.now() / 1000) - 90 * 86400;
  const activities = [];
  for (let page = 1; page <= 5; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("after", String(after)); url.searchParams.set("per_page", "100"); url.searchParams.set("page", String(page));
    const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
    if (!response.ok) throw new Error(response.status === 401 ? "A autorização do Strava expirou. Reconecte a integração." : "O Strava não conseguiu entregar as atividades agora.");
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("A resposta do Strava veio em um formato inesperado.");
    activities.push(...batch);
    if (batch.length < 100) break;
  }

  const statements = activities.map(activity => env.DB.prepare("INSERT INTO device_activities (id,user_id,provider,provider_activity_id,title,sport_type,started_at,duration_seconds,distance_meters,average_heart_rate,max_heart_rate,calories) VALUES (?,?, 'strava',?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider,provider_activity_id) DO UPDATE SET title=excluded.title,sport_type=excluded.sport_type,started_at=excluded.started_at,duration_seconds=excluded.duration_seconds,distance_meters=excluded.distance_meters,average_heart_rate=excluded.average_heart_rate,max_heart_rate=excluded.max_heart_rate,calories=excluded.calories,imported_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .bind(crypto.randomUUID(), userId, String(activity.id), String(activity.name || "Atividade"), String(activity.sport_type || activity.type || "Workout").slice(0, 80), String(activity.start_date_local || activity.start_date || new Date().toISOString()), optionalNumber(activity.moving_time) === null ? null : Math.round(Number(activity.moving_time)), optionalNumber(activity.distance), optionalNumber(activity.average_heartrate), optionalNumber(activity.max_heartrate), optionalNumber(activity.calories)));
  if (statements.length) await env.DB.batch(statements);
  const syncedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE wearable_connections SET last_sync_at=? WHERE user_id=? AND provider='strava'").bind(syncedAt, userId).run();
  return { synced: activities.length, lastSyncAt: syncedAt };
}

