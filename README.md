# Vetra — assessoria esportiva

MVP para treinadores gerenciarem atletas e organizarem treinos.

## Banco e perfis

A identidade fica em uma tabela central users, que inclui e-mail, senha derivada, papel e consentimento. O papel é treinador(a) ou atleta. Dados específicos ficam em coach_profiles e athlete_profiles; o vínculo da equipe fica em trainer_athletes. Essa estrutura evita duplicar credenciais e mantém separadas as informações próprias de cada tipo de usuário.

As migrações migrations/0002_auth_and_trainer.sql e migrations/0003_role_profiles.sql criam sessões, vínculos, ciclos, treinos, feedbacks e perfis. A tabela base users vem da migração api/migrations/0001_create_users.sql.

## Recursos do treinador

- Visão geral com atletas, próximos treinos, sessões concluídas e distância registrada.
- Lista de atletas e vínculo de uma conta de atleta existente.
- Criação de ciclos e prescrição de sessões.
- Agenda semanal, liberação de treino, acompanhamento de feedback e indicadores.

O painel apresenta dados reais do D1 e estados vazios quando a equipe ainda não tem registros.

## Cadastro e login

Cadastro e login por e-mail usam uma sessão opaca em cookie HttpOnly, Secure em HTTPS, SameSite=Lax, sete dias de duração e hash do token guardado no D1. A senha nunca é guardada em texto puro; é derivada com PBKDF2-HMAC-SHA256, salt exclusivo e 600.000 iterações. Há limite por endereço de rede para tentativas de autenticação.

Login Google e Apple usam Authorization Code, state de uso único, cookie temporário vinculado ao navegador, nonce, validação de emissor, público, expiração, e-mail verificado e assinatura do ID Token. Google também usa PKCE S256. Tokens de acesso do provedor não são armazenados.

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

A pasta functions/ implementa as rotas de API. O arquivo wrangler.jsonc e as configurações do Cloudflare Pages vinculam a aplicação ao D1 vetra-users, usando a ligação DB. A pasta raiz serve a interface estática. A ligação DB e as migrações 0002 e 0003 já foram aplicadas na conta Cloudflare deste projeto.

Para preparar outro ambiente Cloudflare, aplique as migrações na seguinte ordem:

1. Aplique api/migrations/0001_create_users.sql, migrations/0002_auth_and_trainer.sql e migrations/0003_role_profiles.sql.
2. Cadastre o binding D1 DB no Pages em Settings > Bindings.
3. Cadastre as variáveis e Secrets OAuth no Pages e publique novamente.

O cadastro e o login por senha ficam ativos após as migrações e a ligação do D1. Login social permanece desabilitado até que os respectivos Secrets sejam cadastrados.

## Observação de escopo

O MVP entrega o espaço do treinador e a criação de contas. O app do atleta, recuperação de senha, confirmação de e-mail e termos jurídicos finais são etapas futuras.
