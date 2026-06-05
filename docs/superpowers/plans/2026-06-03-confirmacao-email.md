# Confirmação de email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmar email de novas contas com gate suave (banner + reenviar) e trava da venda direta até confirmar. Reusa `auth_tokens` (type `verify`).

**Architecture:** `users.setEmailVerified` + `email_verified` no `sessions.findByToken`; email `sendVerificationEmail`; `register` nasce não-verificado e dispara email; rotas `verify-email`/`resend-verification`; gate no `seller.js`; banner no `index.html`; página `/confirmar-email`.

**Tech Stack:** Node/Express, PostgreSQL, Resend, frontends estáticos.

---

## Task 1: DB

**Files:** Modify `src/models/database.js`

- [ ] **Step 1:** No model `users` (após `updatePassword`), adicionar:
```js
  async setEmailVerified(userId) {
    await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  },
```
- [ ] **Step 2:** Em `sessions.findByToken`, adicionar `u.email_verified` à lista de colunas de `u` no SELECT. Trocar:
```js
      SELECT s.*, u.id as user_id, u.name, u.email, u.role, u.plan_id, u.is_active,
```
por:
```js
      SELECT s.*, u.id as user_id, u.name, u.email, u.role, u.plan_id, u.is_active, u.email_verified,
```
- [ ] **Step 3:** `node -c src/models/database.js && echo OK` → `OK`. Commit:
```
git add src/models/database.js
git commit -m "feat: users.setEmailVerified + email_verified no findByToken"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 2: Email — sendVerificationEmail

**Files:** Modify `src/services/emailService.js`

- [ ] **Step 1:** Antes do `module.exports`, adicionar:
```js
async function sendVerificationEmail({ userEmail, userName, verifyUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fAddr  = process.env.EMAIL_FROM_ADDRESS || 'entregas@vaultly.digital';
  if (!apiKey) {
    logger.warn('RESEND_API_KEY nao configurada — email de verificacao nao enviado para ' + userEmail);
    return;
  }
  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">' +
    '<div style="background:linear-gradient(135deg,#FF6B35,#FF9F1C);padding:30px 24px;border-radius:8px 8px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;">Confirme seu email</h1>' +
    '</div>' +
    '<div style="background:#f9f9f9;padding:28px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">' +
    '<p style="font-size:16px;">Ola, <strong>' + (userName || userEmail) + '</strong>!</p>' +
    '<p style="font-size:15px;line-height:1.6;">Bem-vindo a Vaultly. Confirme seu email para garantir o acesso a sua conta e liberar a venda direta.</p>' +
    '<div style="text-align:center;margin:28px 0;">' +
    '<a href="' + verifyUrl + '" style="background:#FF6B35;color:#fff;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Confirmar email</a>' +
    '</div>' +
    '<p style="font-size:13px;color:#777;line-height:1.6;">Se voce nao criou esta conta, ignore este email.</p>' +
    '<p style="font-size:12px;color:#aaa;word-break:break-all;margin-top:16px;">Ou copie e cole no navegador: ' + verifyUrl + '</p>' +
    '</div></div>';
  var response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vaultly <' + fAddr + '>', to: [userEmail], subject: 'Confirme seu email — Vaultly', html: html })
  });
  var result = await response.json();
  if (!response.ok) throw new Error('Resend erro: ' + JSON.stringify(result));
  logger.info('Email de verificacao enviado para ' + userEmail);
}
```
- [ ] **Step 2:** Acrescentar `sendVerificationEmail` ao `module.exports`.
- [ ] **Step 3:** `node -c src/services/emailService.js && echo OK` → `OK`. Commit:
```
git add src/services/emailService.js
git commit -m "feat: emailService — sendVerificationEmail"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 3: auth.js — cadastro + rotas

**Files:** Modify `src/routes/auth.js`

- [ ] **Step 1:** No import do emailService, incluir `sendVerificationEmail`. Trocar:
```js
const { sendPasswordResetEmail } = require('../services/emailService');
```
por:
```js
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
```
- [ ] **Step 2:** No `POST /register`, trocar `email_verified: true` por `email_verified: false` na chamada `users.create({...})`.
- [ ] **Step 3:** No `POST /register`, logo após `const token = await sessions.create(user.id);`, adicionar:
```js
    try {
      const vraw = await authTokens.create(user.id, 'verify', 60 * 24);
      const vbase = process.env.BASE_URL || 'https://vaultly.digital';
      await sendVerificationEmail({ userEmail: user.email, userName: user.name, verifyUrl: vbase + '/confirmar-email?token=' + vraw });
    } catch (e) { logger.error('verify email no cadastro: ' + e.message); }
```
- [ ] **Step 4:** Adicionar as rotas (após `reset-password`, antes de `/logout`):
```js
// POST /api/auth/verify-email — confirma o email a partir do token
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

// POST /api/auth/resend-verification — reenvia o link (usuario logado)
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    if (req.user.email_verified) return res.json({ success: true, message: 'Seu email ja esta confirmado.' });
    const uid  = req.user.user_id || req.user.id;
    const vraw = await authTokens.create(uid, 'verify', 60 * 24);
    const vbase = process.env.BASE_URL || 'https://vaultly.digital';
    await sendVerificationEmail({ userEmail: req.user.email, userName: req.user.name, verifyUrl: vbase + '/confirmar-email?token=' + vraw })
      .catch(e => logger.error('resend verify: ' + e.message));
    res.json({ success: true, message: 'Enviamos um novo link de confirmacao para o seu email.' });
  } catch (err) {
    logger.error('resend-verification: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao reenviar.' });
  }
});
```
- [ ] **Step 5:** `node -c src/routes/auth.js && node -e "require('./src/routes/auth');console.log('ok')"` → `ok`. Commit:
```
git add src/routes/auth.js
git commit -m "feat: cadastro nao-verificado + envio + rotas verify-email/resend-verification"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 4: seller.js — trava da venda direta

**Files:** Modify `src/routes/seller.js`

- [ ] **Step 1:** No `POST /onboarding`, logo após a checagem de plano Free (`if (!req.user || req.user.plan_id === 'free') { ... }`), adicionar:
```js
    if (!req.user.email_verified) {
      return res.status(403).json({ success: false, error: 'Confirme seu email para ativar a venda direta.', needs_verification: true });
    }
```
- [ ] **Step 2:** `node -c src/routes/seller.js && echo OK` → `OK`. Commit:
```
git add src/routes/seller.js
git commit -m "feat: venda direta exige email confirmado"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 5: server.js + página confirmar-email

**Files:** Create `public/confirmar-email.html`; Modify `src/server.js`

- [ ] **Step 1:** Criar `public/confirmar-email.html`:
```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Confirmar email — Vaultly</title>
<link rel="icon" type="image/svg+xml" href="/img/logo-icon.svg"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"/>
<style>
  :root{--bg:#0B1020;--bg2:#141A2E;--orange:#FF6B35;--text:#E8ECF5;--muted:#8A93A8;--red:#EF4444;--emerald:#22C55E}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;text-align:center}
  .card{background:var(--bg2);border:1px solid #222a40;border-radius:16px;max-width:420px;width:100%;padding:32px 28px}
  .logo{height:34px;margin-bottom:18px}
  h1{font-size:20px;margin:0 0 8px}.desc{color:var(--muted);font-size:14px;margin:0 0 18px;line-height:1.5}
  .ic{font-size:42px;margin-bottom:10px}
  .btn{display:inline-block;margin-top:8px;padding:13px 28px;border:0;border-radius:10px;background:var(--orange);color:#1a0e06;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none}
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/img/logo-horizontal.png" alt="Vaultly"/>
    <div id="state">
      <div class="ic" style="color:var(--muted)"><i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block"></i></div>
      <h1>Confirmando seu email…</h1>
      <p class="desc">Aguarde um instante.</p>
    </div>
  </div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
<script>
var token = new URLSearchParams(location.search).get('token') || '';
function render(ok, title, desc){
  document.getElementById('state').innerHTML =
    '<div class="ic" style="color:' + (ok?'var(--emerald)':'var(--red)') + '"><i class="ti ti-' + (ok?'circle-check':'alert-circle') + '"></i></div>' +
    '<h1>' + title + '</h1><p class="desc">' + desc + '</p>' +
    '<a class="btn" href="/app">Ir para o painel</a>';
}
(async function(){
  if(!token){ render(false,'Link inválido','Solicite um novo link de confirmação pelo painel.'); return; }
  try{
    var r = await fetch('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})});
    var d = await r.json();
    if(d.success) render(true,'Email confirmado!','Sua conta está pronta. Bom trabalho!');
    else render(false,'Não foi possível confirmar', d.error || 'Link inválido ou expirado.');
  }catch(e){ render(false,'Erro de conexão','Tente novamente em instantes.'); }
})();
</script>
</body>
</html>
```
- [ ] **Step 2:** No `src/server.js`, após a rota `app.get('/redefinir-senha', ...)`, adicionar:
```js
app.get('/confirmar-email', (req, res) => {
  const p = path.join(publicPath, 'confirmar-email.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.redirect('/');
});
```
- [ ] **Step 3:** Verificar:
```bash
node -c src/server.js && echo BACKEND_OK
node -e "const fs=require('fs');const h=fs.readFileSync('public/confirmar-email.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "page OK" && rm -f _sc.js
```
Commit:
```
git add public/confirmar-email.html src/server.js
git commit -m "feat: pagina /confirmar-email + rota"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 6: Banner no painel

**Files:** Modify `public/index.html`

- [ ] **Step 1: Banner no HTML.** Logo após `<div class="content">` (primeiro filho), inserir:
```html
      <div id="email-verify-banner" style="display:none;align-items:center;gap:10px;background:var(--yellow-dim);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:var(--text);">
        <i class="ti ti-mail-exclamation" style="color:var(--yellow);font-size:18px;flex-shrink:0;"></i>
        <span style="flex:1;">Confirme seu email para garantir seu acesso e liberar a venda direta.</span>
        <button class="btn btn-ghost btn-sm" id="resend-verify-btn" onclick="resendVerification(this)"><i class="ti ti-send"></i> Reenviar</button>
      </div>
```

- [ ] **Step 2: JS.** Perto de `showApp`/`applyUserToUI`, adicionar:
```js
function checkEmailBanner() {
  var b = document.getElementById('email-verify-banner');
  if (!b) return;
  b.style.display = (currentUser && currentUser.email_verified === false) ? 'flex' : 'none';
}
async function resendVerification(btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block;"></i> Enviando...'; }
  try {
    var res = await apiFetch('/api/auth/resend-verification', { method: 'POST' });
    if (!res.success) throw new Error(res.error || 'Erro');
    showToast(res.message || 'Email de confirmacao reenviado.', 'success');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Enviado'; }
  } catch (e) {
    showToast(e.message || 'Nao foi possivel reenviar agora.', 'warn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Reenviar'; }
  }
}
```
E chamar `checkEmailBanner();` dentro de `showApp()` (no fim) — assim o banner aparece quando `currentUser` está carregado.

- [ ] **Step 3:** Verificar o script:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Commit:
```
git add public/index.html
git commit -m "feat: painel — banner de confirmacao de email + reenviar"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

- [ ] **Step 4:** `npm test` (verde) + `node -c` backend. Depois `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:** §2.1 (setEmailVerified + findByToken) → T1; §2.2 email → T2; §2.3 cadastro → T3 (1-3); §2.4 rotas → T3 (4); §2.5 `/me` já expõe email_verified (sem mudança); §2.6 gate seller → T4; §3.2/3.3 página+rota → T5; §3.1 banner → T6. ✅

**Placeholder scan:** sem TBD; código literal.

**Type consistency:** `authTokens.create/consume` (type 'verify'), `users.setEmailVerified`, `sendVerificationEmail({userEmail,userName,verifyUrl})` definido (T2) e usado (T3); `req.user.email_verified` disponível após T1 Step 2 (usado em T3 resend e T4 gate); `confirmar-email.html` POSTa `/api/auth/verify-email {token}` (T5) ↔ rota (T3); `checkEmailBanner`/`resendVerification`/`#email-verify-banner` consistentes (T6); `currentUser.email_verified` vem de `/me` (já exposto). ✅

**Gaps (aceitos):** sem testes unitários (I/O/UI); depende do Resend (já operando). Usuários antigos já têm email_verified=true (não veem banner).
