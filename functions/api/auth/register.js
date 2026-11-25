import { reply, parseJson, rateLimit, passwordHash, safeEqual, randomToken, createSession, sameOrigin } from "../../_lib/auth.js";
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
  const salt = crypto.getRandomValues(new Uint8Array(16));
  try {
    const id = crypto.randomUUID(), hash = await passwordHash(password, salt);
    await env.DB.prepare("INSERT INTO users (id,name,email,email_normalized,role,password_salt,password_hash,password_algorithm,terms_accepted_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, name, email, normalized, role, btoa(String.fromCharCode(...salt)), hash, "PBKDF2-SHA256-600000", new Date().toISOString()).run();
    const cookie = await createSession(env, id, request);
    return reply({ user: { id, name, email, role } }, 201, { "set-cookie": cookie });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) return reply({ error: "Não foi possível criar a conta com esses dados. Verifique se o e-mail já está cadastrado." }, 409);
    return reply({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500);
  }
}

