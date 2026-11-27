import { reply, requireUser, sameOrigin, parseJson } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const result = await env.DB.prepare("SELECT f.id,f.body,f.effort,f.created_at,f.coach_seen_at,w.title,w.workout_date,u.name AS athlete_name,r.body AS coach_reply,r.updated_at AS coach_reply_at FROM workout_feedback f JOIN workouts w ON w.id=f.workout_id JOIN users u ON u.id=f.athlete_id LEFT JOIN workout_coach_replies r ON r.feedback_id=f.id AND r.trainer_id=w.trainer_id WHERE w.trainer_id=? ORDER BY CASE WHEN f.coach_seen_at IS NULL THEN 0 ELSE 1 END,f.created_at DESC LIMIT 100").bind(user.user_id).all();
  return reply({ feedback: result.results||[] });
}
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const d = await parseJson(request), id=String(d?.id||"");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error:"Feedback inválido." },400);
  if (d?.action === "reply") {
    const body=String(d?.body||"").trim();
    if (body.length<3 || body.length>1200) return reply({error:"A resposta deve ter entre 3 e 1.200 caracteres."},400);
    const feedback=await env.DB.prepare("SELECT f.id FROM workout_feedback f JOIN workouts w ON w.id=f.workout_id WHERE f.id=? AND w.trainer_id=?").bind(id,user.user_id).first();
    if(!feedback)return reply({error:"Feedback não encontrado na sua equipe."},404);
    const now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO workout_coach_replies (feedback_id,trainer_id,body,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(feedback_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at WHERE workout_coach_replies.trainer_id=excluded.trainer_id").bind(id,user.user_id,body,now,now).run();
    await env.DB.prepare("UPDATE workout_feedback SET coach_seen_at=COALESCE(coach_seen_at,?) WHERE id=? AND workout_id IN (SELECT id FROM workouts WHERE trainer_id=?)").bind(now,id,user.user_id).run();
    return reply({ok:true});
  }
  await env.DB.prepare("UPDATE workout_feedback SET coach_seen_at=? WHERE id=? AND workout_id IN (SELECT id FROM workouts WHERE trainer_id=?)").bind(new Date().toISOString(),id,user.user_id).run();
  return reply({ ok:true });
}
