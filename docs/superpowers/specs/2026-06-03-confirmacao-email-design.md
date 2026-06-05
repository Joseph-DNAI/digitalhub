# Spec — Confirmação de email no cadastro

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Segundo item funcional de lançamento. Reusa `auth_tokens` (type `verify`) e o padrão de email da recuperação de senha.

---

## 1. Objetivo

Confirmar o email de novas contas. **Gate suave**: ao cadastrar, o usuário entra no painel normalmente, mas (a) vê um banner "Confirme seu email" com botão Reenviar e (b) **não consegue ativar a venda direta** (receber dinheiro) até confirmar. Link do email → página `/confirmar-email` que confirma automaticamente.

---

## 2. Backend

### 2.1 Model (`src/models/database.js`)
- `users.setEmailVerified(userId)`:
```js
  async setEmailVerified(userId) {
    await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  },
```
- `sessions.findByToken` — incluir `u.email_verified` no SELECT (para o middleware/`req.user` e o frontend saberem o estado). Adicionar `u.email_verified` à lista de colunas de `u` no SELECT existente.

### 2.2 Email (`src/services/emailService.js`)
`sendVerificationEmail({ userEmail, userName, verifyUrl })`, padrão Resend (igual `sendPasswordResetEmail`): assunto "Confirme seu email — Vaultly", botão "Confirmar email" (link `verifyUrl`), texto curto e "se nao foi voce, ignore". Exportar.

### 2.3 Cadastro (`src/routes/auth.js`)
- No `POST /register`: trocar `email_verified: true` por `email_verified: false` no `users.create(...)`.
- Após criar o usuário e a sessão (antes do `res.status(201)`), disparar o email de verificação (best-effort, não bloqueia o cadastro):
```js
    try {
      const raw  = await authTokens.create(user.id, 'verify', 60 * 24); // 24h
      const base = process.env.BASE_URL || 'https://vaultly.digital';
      await sendVerificationEmail({ userEmail: user.email, userName: user.name, verifyUrl: base + '/confirmar-email?token=' + raw });
    } catch (e) { logger.error('verify email no cadastro: ' + e.message); }
```
- Import: incluir `sendVerificationEmail` no `require('../services/emailService')` (junto de `sendPasswordResetEmail`).

### 2.4 Rotas novas (`src/routes/auth.js`)
- `POST /api/auth/verify-email` (público):
```js
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'Token ausente.' });
    const userId = await authTokens.consume(token, 'verify');
    if (!userId) return res.status(400).json({ success: false, error: 'Link invalido ou expirado.' });
    await users.setEmailVerified(userId);
    res.json({ success: true, message: 'Email confirmado!' });
  } catch (err) {
    logger.error('verify-email: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao confirmar o email.' });
  }
});
```
- `POST /api/auth/resend-verification` (requireAuth):
```js
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    if (req.user.email_verified) return res.json({ success: true, message: 'Seu email ja esta confirmado.' });
    const raw  = await authTokens.create(req.user.user_id || req.user.id, 'verify', 60 * 24);
    const base = process.env.BASE_URL || 'https://vaultly.digital';
    await sendVerificationEmail({ userEmail: req.user.email, userName: req.user.name, verifyUrl: base + '/confirmar-email?token=' + raw })
      .catch(e => logger.error('resend verify: ' + e.message));
    res.json({ success: true, message: 'Enviamos um novo link de confirmacao para o seu email.' });
  } catch (err) {
    logger.error('resend-verification: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao reenviar.' });
  }
});
```
> Nota: confirmar o campo do id do usuário no `req.user` (vem de `sessions.findByToken`, que já expõe `user_id`). Usar `req.user.user_id` (com fallback `req.user.id`).

### 2.5 `/api/auth/me`
Garantir que a resposta inclua `email_verified` (o frontend usa para o banner e o gate). Se `/me` devolve `sanitizeUser(req.user)` ou o objeto da sessão, incluir `email_verified` no que é retornado.

### 2.6 Trava da venda direta (`src/routes/seller.js`)
No `POST /onboarding`, logo após a checagem de plano pago (`req.user.plan_id === 'free'`), adicionar:
```js
    if (!req.user.email_verified) {
      return res.status(403).json({ success: false, error: 'Confirme seu email para ativar a venda direta.', needs_verification: true });
    }
```

---

## 3. Frontend

### 3.1 Banner no painel (`public/index.html`)
- Adicionar um banner (escondido) no topo do `.content` (ou logo abaixo da topbar): "Confirme seu email para garantir seu acesso." + botão "Reenviar email".
- Quando `currentUser.email_verified === false`, mostrar o banner. Função `resendVerification()` → `POST /api/auth/resend-verification` → toast de sucesso.
- Onde acionar: na inicialização (depois de `currentUser` carregado, ex.: em `applyUserToUI`/`showApp`), chamar uma função `checkEmailBanner()` que mostra/esconde o banner conforme `currentUser.email_verified`.

### 3.2 Página `public/confirmar-email.html` (nova)
Página leve (mesmo visual de `redefinir-senha.html`): lê `token` da URL e, **ao carregar**, faz `POST /api/auth/verify-email { token }`:
- Sucesso → "Email confirmado!" + botão "Ir para o painel" (`/app`).
- Erro → "Link inválido ou expirado." + botão "Ir para o painel" (lá ele pode reenviar pelo banner).
- Sem token → mensagem de link inválido.

### 3.3 Rota `/confirmar-email` (`src/server.js`)
Servir a página (igual `/redefinir-senha`):
```js
app.get('/confirmar-email', (req, res) => {
  const p = path.join(publicPath, 'confirmar-email.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.redirect('/');
});
```

### 3.4 Onboarding da Loja
O 403 `needs_verification` já retorna mensagem; o front (no `submitSellerOnboarding`/`renderSellerForm`) deve exibir essa mensagem (o handler de erro existente com `showToast(e.message)` já cobre). Opcional: na aba Loja, se `currentUser.email_verified === false`, mostrar um aviso curto "Confirme seu email para ativar".

---

## 4. Fora de escopo
- Tornar o gate rígido (bloquear login) — decidimos suave.
- Re-verificar email ao trocar de email (não há troca de email hoje).
- Expiração configurável (fixo 24h).

---

## 5. Critérios de sucesso
- Novo cadastro nasce com `email_verified=false` e recebe o email de confirmação; o usuário entra no painel e vê o banner.
- Clicar no link confirma (página `/confirmar-email`) e o banner some no próximo carregamento.
- "Reenviar" envia um novo link; já-confirmado responde amigável.
- A ativação da venda direta é bloqueada (403) até o email ser confirmado.
- `node -c` no backend + `node --check` nos scripts inline/página passam; suíte existente verde.
