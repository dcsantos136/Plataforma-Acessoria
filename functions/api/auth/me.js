import { reply, getSession } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  return reply({ user: session ? { id: session.user_id, name: session.name, email: session.email, role: session.role } : null });
}
