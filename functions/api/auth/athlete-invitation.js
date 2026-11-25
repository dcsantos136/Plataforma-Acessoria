import { reply, parseJson, rateLimit, sameOrigin, sha256 } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request,env)) return reply({error:"Origem não autorizada."},403);
  if (!await rateLimit(env,request,"athlete-invitation-lookup",12)) return reply({error:"Muitas tentativas. Aguarde alguns minutos."},429,{"retry-after":"900"});
  const data=await parseJson(request),token=String(data?.token || "");
  if (token.length<32 || token.length>128) return reply({error:"Este convite não é válido ou expirou."},400);
  const invite=await env.DB.prepare("SELECT i.email,i.expires_at,u.name AS trainer_name,existing.role AS existing_role FROM athlete_invitations i JOIN users u ON u.id=i.trainer_id LEFT JOIN users existing ON existing.email_normalized=i.email_normalized WHERE i.token_hash=? AND i.status='pending' AND i.expires_at>?").bind(await sha256(token),new Date().toISOString()).first();
  if (!invite) return reply({error:"Este convite não é válido ou expirou."},404);
  if (invite.existing_role && invite.existing_role!=="atleta") return reply({error:"Este convite não pode ser usado com o tipo de conta atual."},409);
  return reply({email:invite.email,trainerName:invite.trainer_name,hasAccount:Boolean(invite.existing_role),expiresAt:invite.expires_at});
}
