import { reply, requireUser, sameOrigin, parseJson } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "upcoming";
  const today = new Date().toISOString().slice(0, 10);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("start") || "")
    ? url.searchParams.get("start")
    : today;

  let rows;
  if (view === "history") {
    rows = await env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.duration_minutes,w.distance_km,w.status,u.name AS trainer_name FROM workouts w JOIN users u ON u.id=w.trainer_id WHERE w.athlete_id=? AND w.status IN ('completed','missed') ORDER BY w.workout_date DESC,w.created_at DESC LIMIT 100").bind(user.user_id).all();
  } else if (view === "calendar") {
    rows = await env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.duration_minutes,w.distance_km,w.status,u.name AS trainer_name FROM workouts w JOIN users u ON u.id=w.trainer_id WHERE w.athlete_id=? AND w.workout_date>=? AND w.workout_date<date(?,'+7 day') AND w.status IN ('released','completed','missed') ORDER BY w.workout_date,w.created_at").bind(user.user_id, start, start).all();
  } else {
    rows = await env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.duration_minutes,w.distance_km,w.status,u.name AS trainer_name FROM workouts w JOIN users u ON u.id=w.trainer_id WHERE w.athlete_id=? AND w.status='released' AND w.workout_date>=? ORDER BY w.workout_date,w.created_at LIMIT 100").bind(user.user_id, today).all();
  }

  return reply({ workouts: rows.results || [], view, start });
}

export async function onRequestPatch({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;

  const data = await parseJson(request);
  const id = String(data?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || data?.action !== "complete") {
    return reply({ error: "Não foi possível identificar o treino." }, 400);
  }

  const duration = data.durationMinutes === "" || data.durationMinutes == null ? null : Number(data.durationMinutes);
  const distance = data.distanceKm === "" || data.distanceKm == null ? null : Number(data.distanceKm);
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) {
    return reply({ error: "Informe uma duração entre 1 e 1.440 minutos." }, 400);
  }
  if (distance !== null && (!Number.isFinite(distance) || distance <= 0 || distance > 1000)) {
    return reply({ error: "Informe uma distância maior que zero e até 1.000 km." }, 400);
  }

  const result = await env.DB.prepare("UPDATE workouts SET status='completed',duration_minutes=COALESCE(?,duration_minutes),distance_km=COALESCE(?,distance_km) WHERE id=? AND athlete_id=? AND status='released'")
    .bind(duration, distance, id, user.user_id).run();
  if (!result.meta?.changes) return reply({ error: "Treino não encontrado ou já concluído." }, 404);
  return reply({ ok: true });
}
