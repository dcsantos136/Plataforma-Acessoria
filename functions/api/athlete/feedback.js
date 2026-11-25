import { reply, requireUser, sameOrigin, parseJson, rateLimit } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;
  const result = await env.DB.prepare("SELECT w.id AS workout_id,w.workout_date,w.title,w.modality,f.id AS feedback_id,f.body,f.effort,f.created_at FROM workouts w LEFT JOIN workout_feedback f ON f.workout_id=w.id AND f.athlete_id=w.athlete_id WHERE w.athlete_id=? AND w.status='completed' ORDER BY w.workout_date DESC,w.created_at DESC LIMIT 100").bind(user.user_id).all();
  return reply({ feedback: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;
  if (!await rateLimit(env, request, "athlete-feedback", 20)) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);

  const data = await parseJson(request);
  const workoutId = String(data?.workoutId || "");
  const body = String(data?.body || "").trim().slice(0, 1200);
  const effort = data?.effort === "" || data?.effort == null ? null : Number(data.effort);
  if (!/^[0-9a-f-]{36}$/i.test(workoutId) || body.length < 3) return reply({ error: "Escreva um comentário de pelo menos 3 caracteres." }, 400);
  if (effort !== null && (!Number.isInteger(effort) || effort < 1 || effort > 10)) return reply({ error: "O esforço deve ficar entre 1 e 10." }, 400);

  const workout = await env.DB.prepare("SELECT id FROM workouts WHERE id=? AND athlete_id=? AND status='completed'").bind(workoutId, user.user_id).first();
  if (!workout) return reply({ error: "Só é possível enviar feedback de um treino concluído." }, 404);
  const existing = await env.DB.prepare("SELECT id FROM workout_feedback WHERE workout_id=? AND athlete_id=? LIMIT 1").bind(workoutId, user.user_id).first();
  if (existing) return reply({ error: "Você já enviou um feedback para este treino." }, 409);

  await env.DB.prepare("INSERT INTO workout_feedback (id,workout_id,athlete_id,body,effort) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), workoutId, user.user_id, body, effort).run();
  return reply({ ok: true }, 201);
}
