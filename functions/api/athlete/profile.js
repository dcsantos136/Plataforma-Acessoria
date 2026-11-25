import { reply,parseJson,requireUser,sameOrigin } from "../../_lib/auth.js";

export async function onRequestGet({request,env}) {
  const {user,error}=await requireUser(request,env,"atleta"); if(error) return error;
  const row=await env.DB.prepare("SELECT birth_date,weight_kg,height_cm,health_notes,health_data_consent_at,profile_completed_at FROM athlete_profiles WHERE user_id=?").bind(user.user_id).first();
  return reply({profile:row || {birth_date:null,weight_kg:null,height_cm:null,health_notes:"",health_data_consent_at:null,profile_completed_at:null},complete:Boolean(row?.profile_completed_at)});
}

export async function onRequestPatch({request,env}) {
  if (!await sameOrigin(request,env)) return reply({error:"Origem não autorizada."},403);
  const {user,error}=await requireUser(request,env,"atleta"); if(error) return error;
  const data=await parseJson(request);
  const birthDate=String(data?.birthDate || ""),weight=Number(data?.weightKg),height=Number(data?.heightCm),notes=String(data?.healthNotes || "").trim(),share=data?.shareProfile===true;
  let dateRoundTrip="";
  try { dateRoundTrip=new Date(birthDate+"T00:00:00Z").toISOString().slice(0,10); } catch {}
  const dateOk=/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && dateRoundTrip===birthDate && birthDate<=new Date().toISOString().slice(0,10) && birthDate>=new Date(Date.now()-120*365.25*86400000).toISOString().slice(0,10);
  if (!dateOk) return reply({error:"Informe uma data de nascimento válida."},400);
  if (!Number.isFinite(weight) || weight<20 || weight>350) return reply({error:"Informe um peso entre 20 e 350 kg."},400);
  if (!Number.isFinite(height) || height<100 || height>250) return reply({error:"Informe uma altura entre 100 e 250 cm."},400);
  if (notes.length>1200) return reply({error:"As observações podem ter até 1.200 caracteres."},400);
  const current=await env.DB.prepare("SELECT profile_completed_at FROM athlete_profiles WHERE user_id=?").bind(user.user_id).first();
  if (!current?.profile_completed_at && !share) return reply({error:"Para concluir o perfil, confirme que seu treinador pode consultar estes dados para orientar seus treinos."},400);
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE athlete_profiles SET birth_date=?,weight_kg=?,height_cm=?,health_notes=?,health_data_consent_at=?,profile_completed_at=COALESCE(profile_completed_at,?) WHERE user_id=?")
    .bind(birthDate,weight,height,share?notes:"",share?now:null,now,user.user_id).run();
  return reply({ok:true,complete:true,shared:share});
}
