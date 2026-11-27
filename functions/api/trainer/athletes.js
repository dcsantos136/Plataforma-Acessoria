import { baseUrl, randomToken, reply, parseJson, requireUser, sameOrigin, sha256, rateLimit } from "../../_lib/auth.js";
import { emailIsConfigured, sendAthleteInvitation } from "../../_lib/email.js";

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  const [rows, invitations] = await Promise.all([
    env.DB.prepare("SELECT u.id,u.name,u.email,ta.status,ta.created_at,(SELECT COUNT(*) FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.status='completed') AS completed,(SELECT w.workout_date FROM workouts w WHERE w.trainer_id=ta.trainer_id AND w.athlete_id=ta.athlete_id AND w.workout_date>=date('now') ORDER BY w.workout_date LIMIT 1) AS next_workout,CASE WHEN ap.health_data_consent_at IS NOT NULL THEN 1 ELSE 0 END AS profile_shared,CASE WHEN ap.health_data_consent_at IS NOT NULL THEN ap.birth_date END AS birth_date,CASE WHEN ap.health_data_consent_at IS NOT NULL THEN ap.weight_kg END AS weight_kg,CASE WHEN ap.health_data_consent_at IS NOT NULL THEN ap.height_cm END AS height_cm,CASE WHEN ap.health_data_consent_at IS NOT NULL THEN ap.health_notes ELSE '' END AS health_notes,ap.profile_completed_at FROM trainer_athletes ta JOIN users u ON u.id=ta.athlete_id LEFT JOIN athlete_profiles ap ON ap.user_id=u.id WHERE ta.trainer_id=? ORDER BY u.name COLLATE NOCASE").bind(user.user_id).all(),
    env.DB.prepare("SELECT id,email,created_at,expires_at FROM athlete_invitations WHERE trainer_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC").bind(user.user_id,new Date().toISOString()).all(),
  ]);
  return reply({ athletes: rows.results || [], invitations: invitations.results || [], emailConfigured: emailIsConfigured(env) });
}

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  const { user, error } = await requireUser(request, env, "treinador(a)"); if (error) return error;
  if (!await rateLimit(env,request,"athlete-invite",10)) return reply({error:"Muitos convites em pouco tempo. Tente novamente mais tarde."},429,{"retry-after":"900"});
  if (!emailIsConfigured(env)) return reply({ error: "Configure o envio de e-mail no Cloudflare antes de enviar convites (RESEND_API_KEY e EMAIL_FROM)." }, 503);
  const d = await parseJson(request), email = String(d?.email || "").trim(), normalized = email.toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Informe um e-mail válido." }, 400);
  const athlete = await env.DB.prepare("SELECT id,name,role FROM users WHERE email_normalized=?").bind(normalized).first();
  if (athlete && athlete.role !== "atleta") return reply({ error: "Esse e-mail já pertence a uma conta de treinador." }, 409);
  if (athlete) {
    const active = await env.DB.prepare("SELECT 1 AS found FROM trainer_athletes WHERE trainer_id=? AND athlete_id=? AND status='active'").bind(user.user_id,athlete.id).first();
    if (active) return reply({ error: "Esse atleta já faz parte da sua equipe." }, 409);
  }
  const trainer = await env.DB.prepare("SELECT name FROM users WHERE id=?").bind(user.user_id).first();
  const id = crypto.randomUUID(), token = randomToken(32), expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare("UPDATE athlete_invitations SET status='revoked' WHERE trainer_id=? AND email_normalized=? AND status='pending'").bind(user.user_id,normalized).run();
  await env.DB.prepare("INSERT INTO athlete_invitations (id,trainer_id,athlete_id,email,email_normalized,token_hash,expires_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id,user.user_id,athlete?.id || null,email,normalized,await sha256(token),expiresAt).run();
  const inviteUrl = baseUrl(request,env) + "/app.html#convite=" + encodeURIComponent(token);
  try {
    await sendAthleteInvitation(env,{to:email,trainerName:trainer?.name || "Seu treinador",inviteUrl,expiresAt,invitationId:id});
  } catch (err) {
    await env.DB.prepare("UPDATE athlete_invitations SET status='revoked' WHERE id=? AND status='pending'").bind(id).run();
    return reply({ error: err.message || "Não foi possível enviar o convite." },502);
  }
  return reply({ invitation:{id,email,expiresAt},sent:true },201);
}
