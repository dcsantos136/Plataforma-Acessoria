import { reply, parseJson, requireUser, sameOrigin } from "../../_lib/auth.js";

async function ensureMembership(env, user) {
  const memberships = await env.DB.prepare("SELECT assessment_id FROM assessment_trainers WHERE trainer_id=? AND status='active' ORDER BY created_at").bind(user.user_id).all();
  if (memberships.results?.length) return;

  const profile = await env.DB.prepare("SELECT organization FROM coach_profiles WHERE user_id=?").bind(user.user_id).first();
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO assessments (id,name,owner_user_id) VALUES (?,?,?)")
    .bind(id, String(profile?.organization || "").trim() || (user.name + " Assessoria"), user.user_id).run();
  await env.DB.prepare("INSERT INTO assessment_trainers (assessment_id,trainer_id,member_role,status,created_by) VALUES (?,?,'owner','active',?)")
    .bind(id, user.user_id, user.user_id).run();
}

async function getAssessment(env, user, id) {
  await ensureMembership(env, user);
  const memberships = await env.DB.prepare("SELECT a.id,a.name,a.specialty,a.description,a.owner_user_id,at.member_role,at.status FROM assessment_trainers at JOIN assessments a ON a.id=at.assessment_id WHERE at.trainer_id=? AND at.status='active' ORDER BY CASE WHEN at.member_role='owner' THEN 0 ELSE 1 END,at.created_at")
    .bind(user.user_id).all();
  const available = memberships.results || [];
  const selected = id ? available.find(item => item.id === id) : available[0];
  if (!selected) return { error: reply({ error: "Assessoria não encontrada ou sem acesso." }, 403) };

  const trainers = await env.DB.prepare("SELECT at.trainer_id AS id,u.name,u.email,at.member_role,at.status FROM assessment_trainers at JOIN users u ON u.id=at.trainer_id WHERE at.assessment_id=? ORDER BY CASE WHEN at.member_role='owner' THEN 0 ELSE 1 END,u.name COLLATE NOCASE")
    .bind(selected.id).all();
  const roster = trainers.results || [];
  const ids = roster.filter(item => item.status === "active").map(item => item.id);
  let athletes = { results: [] };
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    athletes = await env.DB.prepare(`SELECT ta.trainer_id,u.id,u.name,u.email,ta.status,(SELECT COUNT(*) FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.status='completed') AS completed,(SELECT w.workout_date FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.workout_date>=date('now') ORDER BY w.workout_date LIMIT 1) AS next_workout FROM trainer_athletes ta JOIN users u ON u.id=ta.athlete_id WHERE ta.trainer_id IN (${marks}) ORDER BY u.name COLLATE NOCASE`)
      .bind(...ids).all();
  }
  const athletesByTrainer = new Map();
  for (const athlete of athletes.results || []) {
    if (!athletesByTrainer.has(athlete.trainer_id)) athletesByTrainer.set(athlete.trainer_id, []);
    athletesByTrainer.get(athlete.trainer_id).push(athlete);
  }
  const activeIds = roster.filter(item => item.status === "active").map(item => item.id);
  const [activeTrainers, activeAthletes, workouts, feedback] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM assessment_trainers WHERE assessment_id=? AND status='active'").bind(selected.id).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM trainer_athletes WHERE status='active' AND trainer_id IN (${activeIds.length ? activeIds.map(() => "?").join(",") : "NULL"})`).bind(...activeIds).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM workouts WHERE status IN ('planned','released') AND workout_date>=date('now') AND trainer_id IN (${activeIds.length ? activeIds.map(() => "?").join(",") : "NULL"})`).bind(...activeIds).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM workout_feedback f JOIN workouts w ON w.id=f.workout_id WHERE f.coach_seen_at IS NULL AND w.trainer_id IN (${activeIds.length ? activeIds.map(() => "?").join(",") : "NULL"})`).bind(...activeIds).first(),
  ]);

  return {
    assessment: { id: selected.id, name: selected.name, specialty: selected.specialty || "", description: selected.description || "" },
    assessments: available.map(item => ({ id: item.id, name: item.name })),
    isOwner: selected.owner_user_id === user.user_id,
    stats: { trainers: Number(activeTrainers?.n || 0), athletes: Number(activeAthletes?.n || 0), workouts: Number(workouts?.n || 0), pendingFeedback: Number(feedback?.n || 0) },
    trainers: roster.map(trainer => ({ ...trainer, athletes: athletesByTrainer.get(trainer.id) || [] })),
  };
}

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)");
  if (error) return error;
  const result = await getAssessment(env, user, new URL(request.url).searchParams.get("assessmentId"));
  if (result.error) return result.error;
  return reply(result);
}

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)");
  if (error) return error;
  const data = await parseJson(request);
  const assessmentId = String(data?.assessmentId || "");
  const email = String(data?.email || "").trim().toLowerCase();
  const owner = await env.DB.prepare("SELECT a.id FROM assessments a JOIN assessment_trainers at ON at.assessment_id=a.id WHERE a.id=? AND a.owner_user_id=? AND at.trainer_id=? AND at.status='active' AND at.member_role='owner'")
    .bind(assessmentId, user.user_id, user.user_id).first();
  if (!owner) return reply({ error: "Somente o responsável pode adicionar treinadores." }, 403);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Informe o e-mail válido de um treinador cadastrado." }, 400);
  const trainer = await env.DB.prepare("SELECT id,name,role FROM users WHERE email_normalized=?").bind(email).first();
  if (!trainer || trainer.role !== "treinador(a)") return reply({ error: "Não encontramos uma conta de treinador com esse e-mail." }, 404);
  if (trainer.id === user.user_id) return reply({ error: "Você já é o responsável por esta assessoria." }, 409);
  const currentTeam = await env.DB.prepare("SELECT a.id,a.name FROM assessment_trainers at JOIN assessments a ON a.id=at.assessment_id WHERE at.trainer_id=? AND at.status='active' LIMIT 1").bind(trainer.id).first();
  if (currentTeam?.id === assessmentId) return reply({ error: "Este treinador já faz parte da assessoria." }, 409);
  if (currentTeam) return reply({ error: "Este treinador já está vinculado a outra assessoria ativa. Ele precisa encerrar esse vínculo antes de entrar em uma nova equipe." }, 409);
  try {
    await env.DB.prepare("INSERT INTO assessment_trainers (assessment_id,trainer_id,member_role,status,created_by) VALUES (?,?,'trainer','active',?) ON CONFLICT(assessment_id,trainer_id) DO UPDATE SET status='active'")
      .bind(assessmentId, trainer.id, user.user_id).run();
    return reply({ trainer: { id: trainer.id, name: trainer.name, email: email } }, 201);
  } catch {
    return reply({ error: "O treinador já está vinculado a outra assessoria ativa." }, 409);
  }
}

export async function onRequestPatch({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)");
  if (error) return error;
  const data = await parseJson(request);
  const assessmentId = String(data?.assessmentId || "");
  const owner = await env.DB.prepare("SELECT id FROM assessments WHERE id=? AND owner_user_id=?").bind(assessmentId, user.user_id).first();
  if (!owner) return reply({ error: "Somente o responsável pode administrar esta assessoria." }, 403);

  if (data?.action === "update-assessment") {
    const name = String(data?.name || "").trim().slice(0, 120);
    const specialty = String(data?.specialty || "").trim().slice(0, 120);
    const description = String(data?.description || "").trim().slice(0, 2000);
    if (name.length < 2) return reply({ error: "Informe o nome da assessoria." }, 400);
    await env.DB.prepare("UPDATE assessments SET name=?,specialty=?,description=? WHERE id=? AND owner_user_id=?")
      .bind(name, specialty, description, assessmentId, user.user_id).run();
    return reply({ ok: true });
  }

  if (data?.action === "set-trainer-status") {
    const trainerId = String(data?.trainerId || ""), status = String(data?.status || "");
    if (!["active", "inactive"].includes(status)) return reply({ error: "Status inválido." }, 400);
    if (trainerId === user.user_id) return reply({ error: "O responsável não pode remover o próprio acesso." }, 400);
    let result;
    try { result = await env.DB.prepare("UPDATE assessment_trainers SET status=? WHERE assessment_id=? AND trainer_id=? AND member_role='trainer'").bind(status, assessmentId, trainerId).run(); }
    catch { return reply({ error: "Este treinador já está vinculado a outra assessoria ativa." }, 409); }
    if (!result.meta?.changes) return reply({ error: "Treinador não encontrado nesta assessoria." }, 404);
    return reply({ ok: true });
  }
  return reply({ error: "Ação inválida." }, 400);
}
