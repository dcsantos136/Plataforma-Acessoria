import { reply, parseJson, requireUser, sameOrigin } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const url = new URL(request.url), start = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("start")||"") ? url.searchParams.get("start") : new Date().toISOString().slice(0,10);
  const rows = await env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.duration_minutes,w.distance_km,w.status,w.athlete_id,u.name AS athlete_name FROM workouts w JOIN users u ON u.id=w.athlete_id WHERE w.trainer_id=? AND w.workout_date>=? AND w.workout_date<date(?,'+7 day') ORDER BY w.workout_date,u.name").bind(user.user_id,start,start).all();
  return reply({ workouts: rows.results||[], start });
}
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const d = await parseJson(request);
  const athleteId = String(d?.athleteId||""), date = String(d?.date||""), modality = String(d?.modality||"Corrida").slice(0,40), title = String(d?.title||"").trim().slice(0,120), prescription = String(d?.prescription||"").trim().slice(0,2000);
  if (!/^[0-9a-f-]{36}$/i.test(athleteId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || title.length < 2) return reply({ error: "Preencha atleta, data e nome do treino." }, 400);
  const linked = await env.DB.prepare("SELECT 1 FROM trainer_athletes WHERE trainer_id=? AND athlete_id=? AND status='active'").bind(user.user_id,athleteId).first();
  if (!linked) return reply({ error: "Atleta não pertence à sua equipe." }, 403);
  const duration = Number.isInteger(Number(d.duration)) && Number(d.duration)>0 ? Math.min(Number(d.duration),1440) : null;
  const distance = Number.isFinite(Number(d.distance)) && Number(d.distance)>0 ? Math.min(Number(d.distance),1000) : null;
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO workouts (id,trainer_id,athlete_id,workout_date,modality,title,prescription,duration_minutes,distance_km,status) VALUES (?,?,?,?,?,?,?,?,?,'planned')")
    .bind(id,user.user_id,athleteId,date,modality,title,prescription,duration,distance).run();
  return reply({ workout: { id, date, modality, title, status:"planned" } }, 201);
}
import { reply, requireUser, sameOrigin, parseJson } from "../../_lib/auth.js";
export async function onRequestPatch({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error:"Origem não autorizada." },403);
  const { user, error }=await requireUser(request,env,"treinador(a)"); if(error)return error;
  const d=await parseJson(request),id=String(d?.id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||d?.action!=="release")return reply({error:"Ação inválida."},400);
  const result=await env.DB.prepare("UPDATE workouts SET status='released' WHERE id=? AND trainer_id=? AND status='planned'").bind(id,user.user_id).run();
  if(!result.meta?.changes)return reply({error:"Treino não encontrado ou já liberado."},404);
  return reply({ok:true});
}
