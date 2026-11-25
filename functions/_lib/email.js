const escapeHtml = value => String(value || "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

export function emailIsConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.APP_BASE_URL);
}

export async function sendAthleteInvitation(env, { to, trainerName, inviteUrl, expiresAt, invitationId }) {
  if (!emailIsConfigured(env)) throw new Error("O envio de e-mails ainda não está configurado. Adicione RESEND_API_KEY e EMAIL_FROM no Cloudflare.");
  const safeTrainer = escapeHtml(trainerName), safeUrl = escapeHtml(inviteUrl);
  const until = new Date(expiresAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const text = `${trainerName} convidou você para acompanhar seus treinos na Vetra.\n\nConclua seu cadastro e preencha seu perfil neste link: ${inviteUrl}\n\nO convite vence em ${until}. Se você não esperava este e-mail, pode ignorá-lo.\n\nVetra — Treino com direção`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fa;font-family:Arial,sans-serif;color:#26384b"><div style="max-width:560px;margin:30px auto;padding:28px;background:#fff;border:1px solid #e6ebf1;border-radius:14px"><p style="margin:0 0 18px;color:#2674e8;font-weight:bold;letter-spacing:2px">VETRA</p><h1 style="font-size:22px;margin:0 0 12px">Seu treinador convidou você</h1><p style="font-size:15px;line-height:1.6">${safeTrainer} convidou você para acompanhar seus treinos na Vetra. Conclua seu cadastro e preencha seu perfil para que seu treinador possa orientar sua rotina.</p><p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#2674e8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold">Concluir cadastro</a></p><p style="font-size:13px;color:#68788b;line-height:1.6">Este convite vence em ${escapeHtml(until)}. Se você não esperava este e-mail, pode ignorá-lo.</p><hr style="border:0;border-top:1px solid #edf0f4;margin:24px 0"><p style="margin:0;font-size:12px;color:#8491a0">Vetra — Treino com direção</p></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json", "idempotency-key": "athlete-invite-" + invitationId }, body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: safeTrainer + " convidou você para a Vetra", text, html }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 403 ? "O remetente ainda não foi verificado no serviço de e-mail." : "Não foi possível enviar o convite por e-mail. Confira a configuração do serviço de e-mail.");
  return result.id || null;
}
