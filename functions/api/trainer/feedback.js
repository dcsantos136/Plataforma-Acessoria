import { reply, requireUser, sameOrigin, parseJson } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const result = await env.DB.prepare("SELECT f.id,f.body,f.effort,f.created_at,f.coach_seen_at,w.title,w.workout_date,u.name AS athlete_name FROM workout_feedback f JOIN workouts w ON w.id=f.workout_id JOIN users u ON u.id=f.athlete_id WHERE w.trainer_id=? ORDER BY CASE WHEN f.coach_seen_at IS NULL THEN 0 ELSE 1 END,f.created_at DESC LIMIT 100").bind(user.user_id).all();
  return reply({ feedback: result.results||[] });
}
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const d = await parseJson(request), id=String(d?.id||"");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error:"Feedback inválido." },400);
  await env.DB.prepare("UPDATE workout_feedback SET coach_seen_at=? WHERE id=? AND workout_id IN (SELECT id FROM workouts WHERE trainer_id=?)").bind(new Date().toISOString(),id,user.user_id).run();
  return reply({ ok:true });
}
