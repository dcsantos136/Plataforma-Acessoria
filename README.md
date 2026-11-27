# Vetra — assessoria esportiva

MVP para treinadores gerenciarem atletas e organizarem treinos.

## Banco e perfis

A identidade fica em uma tabela central users, que inclui e-mail, senha derivada, papel e consentimento. O papel é treinador(a) ou atleta. Dados específicos ficam em coach_profiles e athlete_profiles; o vínculo da equipe fica em trainer_athletes. Essa estrutura evita duplicar credenciais e mantém separadas as informações próprias de cada tipo de usuário.

As migrações migrations/0002_auth_and_trainer.sql e migrations/0003_role_profiles.sql criam sessões, vínculos, ciclos, treinos, feedbacks e perfis. A tabela base users vem da migração api/migrations/0001_create_users.sql.

## Recursos do treinador

- Visão geral com atletas, próximos treinos, sessões concluídas e distância registrada.
- Painel do treinador priorizado por próximas ações: feedbacks para responder, treinos liberados sem registro e rascunhos da semana para revisar.
- Respostas do treinador ficam registradas junto ao feedback e aparecem para o atleta na área Feedbacks.
- Convite de atleta por e-mail, com link de uso único válido por sete dias.
- Perfil compartilhado do atleta com data de nascimento, peso, altura e observações de saúde, disponível ao treinador somente após autorização do atleta.
- Criação de ciclos e prescrição de sessões.
- Agenda semanal, liberação de treino, acompanhamento de feedback e indicadores.

O painel apresenta dados reais do D1 e estados vazios quando a equipe ainda não tem registros.

## Recursos do atleta

- Painel pessoal com próximos treinos, sessões recentes, duração e distância dos últimos sete dias.
- Lista de treinos liberados e histórico de sessões concluídas ou não realizadas.
- Agenda semanal com os treinos liberados pelo treinador.
- Registro de conclusão com duração e distância realizadas.
- Envio de feedback e percepção de esforço para treinos concluídos.
- Área de evolução e configurações da conta.
- Conclusão do perfil do atleta convidado, com controles para revisar ou retirar o compartilhamento de dados pessoais e observações de saúde.
- Conexão com Strava, sincronização manual de resumos de atividade e associação de sessão ao treino prescrito no mesmo dia.

As APIs do atleta validam o papel da sessão e consultam ou alteram somente os treinos vinculados à própria conta. Dados vindos do relógio ficam isolados por atleta; a Vetra importa resumos, não rotas GPS.

### Relógios e aplicativos

A primeira integração usa o Strava como ponte. Relógios e aplicativos que o atleta já sincroniza com o Strava podem fornecer atividades à Vetra, conforme o suporte e a configuração de cada serviço. O atleta conecta a própria conta, inicia a sincronização e pode revogar o acesso pela Vetra. A integração importa atividades dos últimos 90 dias, com data local, modalidade, duração, distância, frequência cardíaca média/máxima e calorias quando fornecidas. A atividade só conclui um treino depois que o atleta a associa a uma sessão prescrita para o mesmo dia.

Para ativar na produção:

1. Crie um app no portal de desenvolvedores do Strava e informe `plataforma-acessoria.pages.dev` como domínio de callback.
2. Cadastre estes Secrets no Cloudflare Pages: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `WEARABLES_ENCRYPTION_KEY`.
3. `WEARABLES_ENCRYPTION_KEY` deve ser Base64 de exatamente 32 bytes aleatórios. Tokens de acesso e renovação ficam criptografados no D1 com AES-GCM; não coloque essas chaves no Git ou no chat.
4. Aplique também `migrations/0005_wearable_integrations.sql` ao D1 e publique novamente.

O callback OAuth é `https://plataforma-acessoria.pages.dev/api/athlete/integrations/strava/callback`. O consentimento solicita leitura de atividades, incluindo as privadas, para que o atleta possa trazer seu próprio histórico. A interface não importa localização ou mapas. Garmin Connect APIs empresariais exigem acesso/aprovação própria; HealthKit precisa de um app iOS com entitlement e permissões do sistema. Essas integrações nativas podem ser adicionadas depois.

### Convites por e-mail e perfil do atleta

O convite é enviado pelo serviço transacional [Resend](https://resend.com/docs/api-reference/emails/send-email). Para ativá-lo, verifique um domínio no Resend e cadastre no Cloudflare Pages:

- Secret `RESEND_API_KEY` com a chave do Resend.
- Variável `EMAIL_FROM` com o remetente autorizado, por exemplo `Vetra <convites@seudominio.com.br>`.
- Variável `APP_BASE_URL` com a URL pública da aplicação.

Depois de salvar as configurações, publique novamente para ativar o envio automático. Se o serviço de e-mail não estiver configurado ou falhar, o convite continua disponível como link seguro para o treinador copiar e compartilhar manualmente. O convite vence em sete dias e o token bruto aparece somente nesse link; o banco guarda o hash. O atleta precisa entrar ou criar a conta com o e-mail convidado e aceitar o compartilhamento antes da criação do vínculo. O treinador vê os dados apenas enquanto o consentimento estiver ativo. Se o atleta retirar a autorização, as observações de saúde são apagadas e os dados do perfil deixam de ser exibidos ao treinador.

As observações sobre saúde são informações sensíveis. Colete somente o necessário para adaptar o treino e mantenha uma política de privacidade compatível com o uso desses dados.

## Cadastro e login

Cadastro e login por e-mail usam uma sessão opaca em cookie HttpOnly, Secure em HTTPS, SameSite=Lax, sete dias de duração e hash do token guardado no D1. A senha nunca é guardada em texto puro; é derivada com PBKDF2-HMAC-SHA256, salt exclusivo e 600.000 iterações. Há limite por endereço de rede para tentativas de autenticação.

Login Google e Apple usam Authorization Code, state de uso único, cookie temporário vinculado ao navegador, nonce, validação de emissor, público, expiração, e-mail verificado e assinatura do ID Token. Google também usa PKCE S256. Tokens de acesso do provedor não são armazenados. Depois de autenticar, uma conta já cadastrada entra diretamente; uma pessoa sem cadastro ativo escolhe se é atleta ou treinador(a), aceita os termos e então conclui o primeiro cadastro. A identidade verificada fica em um token temporário HttpOnly de uso único, válido por dez minutos.

### Ativar Google e Apple

O fluxo está implementado; para liberar os botões na produção, crie credenciais web nos consoles oficiais e cadastre os valores como Secrets no Cloudflare Pages. Configure também APP_BASE_URL como variável não secreta.

URLs de retorno (redirect URI) para registrar em cada provedor:

- Google: https://plataforma-acessoria.pages.dev/api/auth/google/callback
- Apple: https://plataforma-acessoria.pages.dev/api/auth/apple/callback

Secrets necessários:

- Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
- Apple: APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (chave privada .p8 do Sign in with Apple)
- Variável não secreta: APP_BASE_URL=https://plataforma-acessoria.pages.dev

A Apple exige uma conta de desenvolvedor, Services ID associado a um App ID habilitado para Sign in with Apple e a chave privada correspondente. Não coloque esses segredos em arquivos do repositório.

## Publicação no Cloudflare Pages

A pasta functions/ implementa as rotas de API. O arquivo wrangler.jsonc e as configurações do Cloudflare Pages vinculam a aplicação ao D1 vetra-users, usando a ligação DB. A pasta raiz serve a interface estática. As migrações 0002, 0003 e 0004 criam autenticação, perfis, assessorias e equipes de treinadores.

Para preparar outro ambiente Cloudflare, aplique as migrações na seguinte ordem:

1. Aplique api/migrations/0001_create_users.sql, migrations/0002_auth_and_trainer.sql, migrations/0003_role_profiles.sql, migrations/0004_assessoria_management.sql, migrations/0005_wearable_integrations.sql, migrations/0006_athlete_invites_and_profile.sql, migrations/0007_coach_feedback_replies.sql e migrations/0008_pending_oauth_registrations.sql.
2. Cadastre o binding D1 DB no Pages em Settings > Bindings.
3. Cadastre as variáveis e Secrets de OAuth, Strava e e-mail necessários no Pages e publique novamente.

O cadastro e o login por senha ficam ativos após as migrações e a ligação do D1. Login social permanece desabilitado até que os respectivos Secrets sejam cadastrados.

## Observação de escopo

O módulo de gestão permite ao responsável editar os dados da assessoria, vincular treinadores já cadastrados e administrar seus vínculos. Cada treinador mantém seus próprios atletas e treinos; os dados são agregados na visão da equipe.
