import { reply, parseJson, requireUser, sameOrigin } from "../../_lib/auth.js";
import { getStravaAccessToken, syncStrava } from "../../_lib/wearables.js";

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;
  const [connection, count, activities] = await Promise.all([
    env.DB.prepare("SELECT provider,provider_account_id,display_name,scope,connected_at,last_sync_at FROM wearable_connections WHERE user_id=? AND provider='strava'").bind(user.user_id).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM device_activities WHERE user_id=? AND provider='strava'").bind(user.user_id).first(),
    env.DB.prepare("SELECT id,provider_activity_id,title,sport_type,started_at,duration_seconds,distance_meters,average_heart_rate,max_heart_rate,calories,linked_workout_id FROM device_activities WHERE user_id=? AND provider='strava' ORDER BY started_at DESC LIMIT 30").bind(user.user_id).all(),
  ]);
  return reply({ stravaConfigured: Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.WEARABLES_ENCRYPTION_KEY), connection: connection ? { provider: "strava", accountId: connection.provider_account_id, displayName: connection.display_name, scope: connection.scope, connectedAt: connection.connected_at, lastSyncAt: connection.last_sync_at, activitiesCount: Number(count?.n || 0) } : null, activities: activities.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;
  const data = await parseJson(request);
  if (data?.provider !== "strava") return reply({ error: "Integração não reconhecida." }, 400);

  if (data.action === "sync") {
    try { return reply(await syncStrava(env, user.user_id)); }
    catch (err) { return reply({ error: err.message || "Não foi possível sincronizar as atividades." }, 502); }
  }

  if (data.action === "link-activity") {
    const activityId = String(data?.activityId || ""), workoutId = String(data?.workoutId || "");
    if (!/^[0-9a-f-]{36}$/i.test(activityId) || !/^[0-9a-f-]{36}$/i.test(workoutId)) return reply({ error: "Selecione uma atividade e um treino válidos." }, 400);
    const activity = await env.DB.prepare("SELECT started_at,duration_seconds,distance_meters,linked_workout_id FROM device_activities WHERE id=? AND user_id=? AND provider='strava'").bind(activityId,user.user_id).first();
    const workout = await env.DB.prepare("SELECT id,workout_date,status FROM workouts WHERE id=? AND athlete_id=? AND status IN ('released','completed')").bind(workoutId,user.user_id).first();
    if (!activity || !workout) return reply({ error: "Atividade ou treino não encontrado." }, 404);
    if (activity.linked_workout_id) return reply({ error: "Esta atividade já está associada a um treino." }, 409);
    if (String(activity.started_at).slice(0,10) !== workout.workout_date) return reply({ error: "A atividade e o treino precisam ser do mesmo dia." }, 400);
    const duration = activity.duration_seconds!=null && Number.isFinite(Number(activity.duration_seconds)) ? Math.max(1,Math.round(Number(activity.duration_seconds)/60)) : null;
    const distance = activity.distance_meters!=null && Number.isFinite(Number(activity.distance_meters)) && Number(activity.distance_meters)>0 ? Number(activity.distance_meters)/1000 : null;
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE device_activities SET linked_workout_id=? WHERE id=? AND user_id=? AND linked_workout_id IS NULL").bind(workoutId,activityId,user.user_id),
      env.DB.prepare("UPDATE workouts SET status='completed',duration_minutes=COALESCE(?,duration_minutes),distance_km=COALESCE(?,distance_km) WHERE id=? AND athlete_id=? AND status IN ('released','completed') AND EXISTS (SELECT 1 FROM device_activities WHERE id=? AND user_id=? AND linked_workout_id=?)").bind(duration,distance,workoutId,user.user_id,activityId,user.user_id,workoutId),
    ]);
    if (!result[0]?.meta?.changes || !result[1]?.meta?.changes) return reply({ error: "Esta atividade já foi associada a outro treino." }, 409);
    return reply({ ok: true });
  }

  if (data.action === "disconnect") {
    const { connection, accessToken } = await getStravaAccessToken(env, user.user_id).then(value => ({ connection: value.connection, accessToken: value.accessToken })).catch(() => ({ connection: null, accessToken: null }));
    if (!connection) return reply({ error: "Nenhuma conta Strava está conectada." }, 404);
    const response = await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ access_token: accessToken }) });
    if (!response.ok && response.status !== 401) return reply({ error: "O Strava não confirmou a revogação. Tente novamente." }, 502);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM device_activities WHERE user_id=? AND provider='strava'").bind(user.user_id),
      env.DB.prepare("DELETE FROM wearable_connections WHERE user_id=? AND provider='strava'").bind(user.user_id),
    ]);
    return reply({ ok: true });
  }
  return reply({ error: "Ação inválida." }, 400);
}
