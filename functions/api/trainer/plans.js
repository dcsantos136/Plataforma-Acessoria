import { reply, parseJson, requireUser, sameOrigin } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const rows = await env.DB.prepare("SELECT p.id,p.title,p.notes,p.start_date,p.end_date,p.status,u.name AS athlete_name,(SELECT COUNT(*) FROM workouts w WHERE w.plan_id=p.id) AS workout_count FROM training_plans p JOIN users u ON u.id=p.athlete_id WHERE p.trainer_id=? ORDER BY p.start_date DESC").bind(user.user_id).all();
  return reply({ plans: rows.results||[] });
}
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({error:"Origem não autorizada."},403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const d=await parseJson(request), athleteId=String(d?.athleteId||""), title=String(d?.title||"").trim().slice(0,120), start=String(d?.startDate||"");
  if (!/^[0-9a-f-]{36}$/i.test(athleteId)||title.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(start)) return reply({error:"Preencha atleta, título e início do ciclo."},400);
  const linked=await env.DB.prepare("SELECT 1 FROM trainer_athletes WHERE trainer_id=? AND athlete_id=? AND status='active'").bind(user.user_id,athleteId).first();
  if(!linked)return reply({error:"Atleta não pertence à sua equipe."},403);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO training_plans (id,trainer_id,athlete_id,title,notes,start_date,end_date,status) VALUES (?,?,?,?,?,?,?,'draft')").bind(id,user.user_id,athleteId,title,String(d?.notes||"").slice(0,2000),start,/^\d{4}-\d{2}-\d{2}$/.test(String(d?.endDate||""))?String(d.endDate):null).run();
  return reply({plan:{id,title,startDate:start,status:"draft"}},201);
}
