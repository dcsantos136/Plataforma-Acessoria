import { reply, parseJson, rateLimit, passwordHash, PASSWORD_HASH_ALGORITHM, createSession, sameOrigin, sha256 } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  if (!await rateLimit(env, request, "register", 8)) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, { "retry-after": "900" });
  const d = await parseJson(request);
  if (!d) return reply({ error: "Dados inválidos." }, 400);
  const name = String(d.name || "").trim(), email = String(d.email || "").trim(), normalized = email.toLowerCase(), password = String(d.password || ""), role = String(d.role || "");
  if (name.length < 2 || name.length > 120) return reply({ error: "Informe seu nome completo." }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Informe um e-mail válido." }, 400);
  if (new TextEncoder().encode(password).length < 8 || new TextEncoder().encode(password).length > 128) return reply({ error: "A senha deve ter entre 8 e 128 bytes." }, 400);
  if (!["treinador(a)", "atleta"].includes(role)) return reply({ error: "Escolha um perfil válido." }, 400);
  if (d.termsAccepted !== true) return reply({ error: "Aceite os termos para continuar." }, 400);
  const invitationToken=String(d.invitationToken || "");
  if (invitationToken) {
    if (invitationToken.length<32 || invitationToken.length>128 || role!=="atleta" || d.shareProfile!==true) return reply({error:"Convite ou consentimento inválido."},400);
    const invite=await env.DB.prepare("SELECT 1 AS valid FROM athlete_invitations WHERE token_hash=? AND email_normalized=? AND status='pending' AND expires_at>?").bind(await sha256(invitationToken),normalized,new Date().toISOString()).first();
    if (!invite) return reply({error:"Este convite não é válido ou expirou."},404);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  let stage = "password-hash";
  try {
    const id = crypto.randomUUID(), hash = await passwordHash(password, salt);
    stage = "insert-user";
    await env.DB.prepare("INSERT INTO users (id,name,email,email_normalized,role,password_salt,password_hash,password_algorithm,terms_accepted_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, name, email, normalized, role, btoa(String.fromCharCode(...salt)), hash, PASSWORD_HASH_ALGORITHM, new Date().toISOString()).run();
    stage = "create-session";
    const cookie = await createSession(env, id, request);
    return reply({ user: { id, name, email, role } }, 201, { "set-cookie": cookie });
  } catch (error) {
    const detail = String(error?.message || "").slice(0, 240);
    const safeDetail = [name, email, normalized, password, invitationToken].filter(Boolean).reduce((value, secret) => value.split(secret).join("[redacted]"), detail);
    console.error("auth.register.failed", { stage, errorName: String(error?.name || "Error"), errorCode: String(error?.code || ""), detail: safeDetail });
    if (String(error?.message || "").toLowerCase().includes("unique")) return reply({ error: "Não foi possível criar a conta com esses dados. Verifique se o e-mail já está cadastrado." }, 409);
    return reply({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
  }
}

