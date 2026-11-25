import { reply, parseJson, rateLimit, passwordHash, safeEqual, createSession, sameOrigin } from "../../_lib/auth.js";
export async function onRequestPost({ request, env }) {
  if (!await sameOrigin(request, env)) return reply({ error: "Origem não autorizada." }, 403);
  if (!await rateLimit(env, request, "login", 10)) return reply({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, { "retry-after": "900" });
  const d = await parseJson(request), email = String(d?.email || "").trim().toLowerCase(), password = String(d?.password || "");
  if (email.length > 254 || !password || new TextEncoder().encode(password).length > 128) return reply({ error: "E-mail ou senha incorretos." }, 401);
  const user = await env.DB.prepare("SELECT id,name,email,role,password_salt,password_hash,password_algorithm FROM users WHERE email_normalized=?").bind(email).first();
  let valid = false;
  try {
    if (user && user.password_algorithm !== "OAUTH-ONLY") {
      const salt = Uint8Array.from(atob(user.password_salt), c => c.charCodeAt(0));
      valid = safeEqual(await passwordHash(password, salt), user.password_hash);
    } else {
      await passwordHash(password, crypto.getRandomValues(new Uint8Array(16)));
    }
  } catch {}
  if (!valid || !user) return reply({ error: "E-mail ou senha incorretos." }, 401);
  const cookie = await createSession(env, user.id, request);
  return reply({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, 200, { "set-cookie": cookie });
}
