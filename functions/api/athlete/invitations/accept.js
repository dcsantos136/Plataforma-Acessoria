import { reply,parseJson,requireUser,sameOrigin,sha256 } from "../../../_lib/auth.js";

export async function onRequestPost({request,env}) {
  if (!await sameOrigin(request,env)) return reply({error:"Origem não autorizada."},403);
  const {user,error}=await requireUser(request,env,"atleta"); if(error) return error;
  const data=await parseJson(request),token=String(data?.token || "");
  if (token.length<32 || token.length>128 || data?.shareProfile!==true) return reply({error:"Confirme o convite e o compartilhamento do perfil com o treinador."},400);
  const hash=await sha256(token),now=new Date().toISOString();
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE athlete_invitations SET status='accepted',athlete_id=?,accepted_at=? WHERE token_hash=? AND email_normalized=? AND status='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='atleta')").bind(user.user_id,now,hash,user.email.toLowerCase(),now,user.user_id),
    env.DB.prepare("INSERT INTO trainer_athletes (trainer_id,athlete_id,status) SELECT trainer_id,?,'active' FROM athlete_invitations WHERE token_hash=? AND athlete_id=? AND status='accepted' AND changes()=1 ON CONFLICT(trainer_id,athlete_id) DO UPDATE SET status='active'").bind(user.user_id,hash,user.user_id),
    env.DB.prepare("UPDATE athlete_profiles SET health_data_consent_at=? WHERE user_id=? AND changes()=1").bind(now,user.user_id),
  ]);
  if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return reply({error:"Este convite não é válido, expirou ou já foi aceito."},409);
  return reply({ok:true});
}
