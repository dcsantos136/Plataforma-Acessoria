import { reply, parseJson, requireUser, sameOrigin } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const rows = await env.DB.prepare("SELECT u.id,u.name,u.email,ta.status,ta.created_at,(SELECT COUNT(*) FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.status='completed') AS completed,(SELECT w.workout_date FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.workout_date>=date('now') ORDER BY w.workout_date LIMIT 1) AS next_workout FROM trainer_athletes ta JOIN users u ON u.id=ta.athlete_id WHERE ta.trainer_id=? ORDER BY u.name COLLATE NOCASE").bind(user.user_id).all();
  return reply({ athletes: rows.results||[] });
}
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const d = await parseJson(request), email = String(d?.email||"").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Informe o e-mail válido de um atleta cadastrado." }, 400);
  const athlete = await env.DB.prepare("SELECT id,name,role FROM users WHERE email_normalized=?").bind(email).first();
  if (!athlete || athlete.role !== "atleta") return reply({ error: "Não encontramos uma conta de atleta com esse e-mail. Peça para a pessoa criar a conta primeiro." }, 404);
  try {
    await env.DB.prepare("INSERT INTO trainer_athletes (trainer_id,athlete_id,status) VALUES (?,?,'active')").bind(user.user_id,athlete.id).run();
    return reply({ athlete: { id: athlete.id, name: athlete.name, email } }, 201);
  } catch { return reply({ error: "Esse atleta já está vinculado à sua equipe." }, 409); }
}
