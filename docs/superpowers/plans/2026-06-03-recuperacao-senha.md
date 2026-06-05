# Recuperação de senha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir recuperar a senha: link no login → email com token → página `/redefinir-senha` para definir a nova senha. Token hasheado, uso único, expiração 1h, sem enumeração de usuário.

**Architecture:** Tabela `auth_tokens` + model `authTokens` (create/consume) no `database.js`; `users.updatePassword` + `sessions.deleteByUser`; rotas `forgot-password`/`reset-password` no `auth.js`; email `sendPasswordResetEmail`; nova página `public/redefinir-senha.html` + rota no `server.js`; link/forgot-view no modal da landing.

**Tech Stack:** Node/Express, PostgreSQL, Resend, frontends estáticos.

---

## Task 1: DB — auth_tokens + helpers

**Files:**
- Modify: `src/models/database.js`

- [ ] **Step 1: Tabela `auth_tokens`**

No grande `CREATE TABLE IF NOT EXISTS` block (junto das outras tabelas, antes do fechamento `` `); ``), adicionar:
```sql
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT NOT NULL,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        used_at     TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW()
      );
```

- [ ] **Step 2: Model `authTokens`**

Antes do `module.exports`, adicionar:
```js
// ─── Auth tokens (reset de senha / verificacao de email) ────────────────────────
const authTokens = {
  async create(userId, type, ttlMinutes) {
    const crypto = require('crypto');
    const id   = uuidv4();
    const raw  = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const exp  = new Date(Date.now() + (ttlMinutes || 60) * 60 * 1000);
    await query(
      'INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [id, userId, type, hash, exp]
    );
    return raw;
  },
  async consume(raw, type) {
    if (!raw) return null;
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(raw)).digest('hex');
    const rows = await query(
      "UPDATE auth_tokens SET used_at = NOW() WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id",
      [hash, type]
    );
    return rows.length === 1 ? rows[0].user_id : null;
  }
};
```

- [ ] **Step 3: `users.updatePassword`**

No model `users` (após `findById`), adicionar:
```js
  async updatePassword(userId, newPassword) {
    const bcrypt = require('./bcrypt');
    const hash = await bcrypt.hash(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  },
```

- [ ] **Step 4: `sessions.deleteByUser`**

No model `sessions` (após `create`/`findByToken`), adicionar:
```js
  async deleteByUser(userId) { await query('DELETE FROM sessions WHERE user_id = $1', [userId]); },
```

- [ ] **Step 5: Exportar `authTokens`**

No `module.exports`, acrescentar `authTokens` ao objeto exportado.

- [ ] **Step 6: Verificar + commit**

Run: `node -c src/models/database.js && echo OK`  → `OK`.
```bash
git add src/models/database.js
git commit -m "feat: auth_tokens (reset/verify) + users.updatePassword + sessions.deleteByUser"
```
Fim do corpo do commit:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: Email — sendPasswordResetEmail

**Files:**
- Modify: `src/services/emailService.js`

- [ ] **Step 1: Função (antes do `module.exports`)**
```js
async function sendPasswordResetEmail({ userEmail, userName, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fAddr  = process.env.EMAIL_FROM_ADDRESS || 'entregas@vaultly.digital';
  if (!apiKey) {
    logger.warn('RESEND_API_KEY nao configurada — email de reset nao enviado para ' + userEmail);
    return;
  }
  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">' +
    '<div style="background:linear-gradient(135deg,#FF6B35,#FF9F1C);padding:30px 24px;border-radius:8px 8px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;">Redefinir sua senha</h1>' +
    '</div>' +
    '<div style="background:#f9f9f9;padding:28px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">' +
    '<p style="font-size:16px;">Ola, <strong>' + (userName || userEmail) + '</strong>!</p>' +
    '<p style="font-size:15px;line-height:1.6;">Recebemos um pedido para redefinir a senha da sua conta Vaultly. Clique no botao abaixo para criar uma nova senha.</p>' +
    '<div style="text-align:center;margin:28px 0;">' +
    '<a href="' + resetUrl + '" style="background:#FF6B35;color:#fff;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Redefinir senha</a>' +
    '</div>' +
    '<p style="font-size:13px;color:#777;line-height:1.6;">Este link expira em 1 hora. Se voce nao solicitou a redefinicao, ignore este email — sua senha continua a mesma.</p>' +
    '<p style="font-size:12px;color:#aaa;word-break:break-all;margin-top:16px;">Ou copie e cole no navegador: ' + resetUrl + '</p>' +
    '</div></div>';
  var response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vaultly <' + fAddr + '>', to: [userEmail], subject: 'Redefinicao de senha — Vaultly', html: html })
  });
  var result = await response.json();
  if (!response.ok) throw new Error('Resend erro: ' + JSON.stringify(result));
  logger.info('Email de redefinicao de senha enviado para ' + userEmail);
}
```

- [ ] **Step 2: Exportar** — acrescentar `sendPasswordResetEmail` ao `module.exports`.

- [ ] **Step 3: Verificar + commit**

Run: `node -c src/services/emailService.js && echo OK` → `OK`.
```bash
git add src/services/emailService.js
git commit -m "feat: emailService — sendPasswordResetEmail"
```
Fim do corpo: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 3: auth.js — forgot/reset

**Files:**
- Modify: `src/routes/auth.js`

- [ ] **Step 1: Imports**

Trocar a linha `const { users, sessions, plans } = require('../models/database');` por:
```js
const { users, sessions, plans, authTokens } = require('../models/database');
const { sendPasswordResetEmail } = require('../services/emailService');
```

- [ ] **Step 2: Rotas (após a rota de `/login`, antes de `/logout`)**
```js
// POST /api/auth/forgot-password — envia link de redefinicao (sem revelar se o email existe)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (email) {
      const user = await users.findByEmail(email);
      if (user) {
        const raw  = await authTokens.create(user.id, 'reset', 60);
        const base = process.env.BASE_URL || 'https://vaultly.digital';
        await sendPasswordResetEmail({ userEmail: user.email, userName: user.name, resetUrl: base + '/redefinir-senha?token=' + raw })
          .catch(e => logger.error('reset email: ' + e.message));
      }
    }
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  } catch (err) {
    logger.error('forgot-password: ' + err.message);
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  }
});

// POST /api/auth/reset-password — define nova senha a partir do token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token e nova senha sao obrigatorios.' });
    if (String(password).length < 8) return res.status(400).json({ success: false, error: 'A senha deve ter ao menos 8 caracteres.' });
    const userId = await authTokens.consume(token, 'reset');
    if (!userId) return res.status(400).json({ success: false, error: 'Link invalido ou expirado. Solicite um novo.' });
    await users.updatePassword(userId, password);
    await sessions.deleteByUser(userId);
    res.json({ success: true, message: 'Senha redefinida. Faca login com a nova senha.' });
  } catch (err) {
    logger.error('reset-password: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao redefinir a senha.' });
  }
});
```

- [ ] **Step 3: Verificar + commit**

Run: `node -c src/routes/auth.js && echo OK` → `OK`.
```bash
git add src/routes/auth.js
git commit -m "feat: rotas forgot-password e reset-password"
```
Fim do corpo: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 4: server.js — rota /redefinir-senha + página

**Files:**
- Create: `public/redefinir-senha.html`
- Modify: `src/server.js`

- [ ] **Step 1: Criar `public/redefinir-senha.html`**
```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Redefinir senha — Vaultly</title>
<link rel="icon" type="image/svg+xml" href="/img/logo-icon.svg"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"/>
<style>
  :root{--bg:#0B1020;--bg2:#141A2E;--orange:#FF6B35;--text:#E8ECF5;--muted:#8A93A8;--red:#EF4444;--emerald:#22C55E}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
  .card{background:var(--bg2);border:1px solid #222a40;border-radius:16px;max-width:420px;width:100%;padding:28px}
  .logo{height:34px;margin-bottom:18px}
  h1{font-size:20px;margin:0 0 6px}.desc{color:var(--muted);font-size:14px;margin:0 0 18px}
  label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
  input{width:100%;padding:11px 12px;border-radius:9px;border:1px solid #2a3350;background:#0E1426;color:var(--text);font-size:14px}
  .pwd{position:relative}.pwd button{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted)}
  .btn{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:var(--orange);color:#1a0e06;font-weight:700;font-size:15px;cursor:pointer}
  .btn:disabled{opacity:.6;cursor:not-allowed}
  .msg{margin-top:14px;font-size:14px;text-align:center}
  a{color:var(--orange);text-decoration:none}
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/img/logo-horizontal.png" alt="Vaultly"/>
    <div id="form-wrap">
      <h1>Redefinir senha</h1>
      <p class="desc">Crie uma nova senha para sua conta.</p>
      <label>Nova senha</label>
      <div class="pwd">
        <input type="password" id="p1" placeholder="Mínimo 8 caracteres" style="padding-right:40px"/>
        <button type="button" onclick="tog('p1','i1')"><i id="i1" class="ti ti-eye"></i></button>
      </div>
      <label>Confirmar senha</label>
      <div class="pwd">
        <input type="password" id="p2" placeholder="Repita a senha" style="padding-right:40px"/>
        <button type="button" onclick="tog('p2','i2')"><i id="i2" class="ti ti-eye"></i></button>
      </div>
      <button class="btn" id="btn" onclick="submitReset()">Redefinir senha</button>
      <div class="msg" id="msg"></div>
    </div>
    <div id="done-wrap" style="display:none;text-align:center;">
      <h1 id="done-title">Pronto!</h1>
      <p class="desc" id="done-desc">Sua senha foi redefinida.</p>
      <a class="btn" href="/app" style="display:block;text-decoration:none;text-align:center;line-height:1.4;">Ir para o login</a>
    </div>
  </div>
<script>
var token = new URLSearchParams(location.search).get('token') || '';
var $ = function(id){ return document.getElementById(id); };
function tog(inp,ic){ var i=$(inp),c=$(ic); if(i.type==='password'){i.type='text';c.className='ti ti-eye-off';}else{i.type='password';c.className='ti ti-eye';} }
if(!token){ $('msg').textContent='Link inválido. Solicite uma nova recuperação na tela de login.'; $('msg').style.color='var(--red)'; $('btn').disabled=true; }
async function submitReset(){
  var p1=$('p1').value, p2=$('p2').value;
  $('msg').textContent='';
  if(p1.length<8){ $('msg').textContent='A senha deve ter ao menos 8 caracteres.'; $('msg').style.color='var(--red)'; return; }
  if(p1!==p2){ $('msg').textContent='As senhas não coincidem.'; $('msg').style.color='var(--red)'; return; }
  $('btn').disabled=true; $('btn').textContent='Redefinindo…';
  try{
    var r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token,password:p1})});
    var d=await r.json();
    if(!d.success){ $('msg').textContent=d.error||'Não foi possível redefinir.'; $('msg').style.color='var(--red)'; $('btn').disabled=false; $('btn').textContent='Redefinir senha'; return; }
    $('form-wrap').style.display='none'; $('done-wrap').style.display='block';
  }catch(e){ $('msg').textContent='Erro de conexão. Tente novamente.'; $('msg').style.color='var(--red)'; $('btn').disabled=false; $('btn').textContent='Redefinir senha'; }
}
</script>
</body>
</html>
```

- [ ] **Step 2: Rota no `server.js`**

Junto das outras páginas públicas (ex.: após o handler `app.get('/termos', ...)`), adicionar:
```js
app.get('/redefinir-senha', (req, res) => {
  const p = path.join(publicPath, 'redefinir-senha.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.redirect('/');
});
```

- [ ] **Step 3: Verificar + commit**

Run:
```bash
node -c src/server.js && echo BACKEND_OK
node -e "const fs=require('fs');const h=fs.readFileSync('public/redefinir-senha.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "page OK" && rm -f _sc.js
```
Expected: `BACKEND_OK` e `page OK`.
```bash
git add public/redefinir-senha.html src/server.js
git commit -m "feat: pagina /redefinir-senha + rota"
```
Fim do corpo: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 5: Landing — link e view "Esqueci minha senha"

**Files:**
- Modify: `public/landing.html`

- [ ] **Step 1: Link no login + view forgot**

No bloco `<div id="auth-login" ...>`, trocar:
```html
        <button class="btn-submit" id="loginBtn" onclick="handleLogin()">Entrar</button>
      </div>
```
por:
```html
        <button class="btn-submit" id="loginBtn" onclick="handleLogin()">Entrar</button>
        <div style="text-align:center;margin-top:12px;"><a href="#" onclick="showForgot();return false;" style="font-size:13px;color:var(--text2);text-decoration:none;">Esqueci minha senha</a></div>
      </div>
      <div id="auth-forgot" style="display:none;">
        <div id="forgot-msg" class="auth-error" style="display:none;"></div>
        <p style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:14px;">Informe o email da sua conta. Se houver cadastro, enviaremos um link para redefinir a senha.</p>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="forgotEmail" class="form-input" placeholder="seu@email.com" autocomplete="email" onkeydown="if(event.key==='Enter')handleForgot()"/>
        </div>
        <button class="btn-submit" id="forgotBtn" onclick="handleForgot()">Enviar link de recuperação</button>
        <div style="text-align:center;margin-top:12px;"><a href="#" onclick="switchAuthTab('login');return false;" style="font-size:13px;color:var(--text2);text-decoration:none;">Voltar ao login</a></div>
      </div>
```

- [ ] **Step 2: JS (perto de `handleLogin`)**
```js
function showForgot() {
  document.getElementById('auth-login').style.display = 'none';
  var f = document.getElementById('auth-forgot'); if (f) f.style.display = 'block';
  var m = document.getElementById('forgot-msg'); if (m) m.style.display = 'none';
}
async function handleForgot() {
  var btn = document.getElementById('forgotBtn');
  var msg = document.getElementById('forgot-msg');
  var email = (document.getElementById('forgotEmail') || {}).value || '';
  if (!email) { if (msg) { msg.textContent = 'Informe seu email.'; msg.className = 'auth-error'; msg.style.display = 'block'; } return; }
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    var res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
    var data = await res.json();
    if (msg) { msg.textContent = data.message || 'Se o email estiver cadastrado, enviamos o link.'; msg.className = 'auth-success'; msg.style.display = 'block'; }
  } catch (e) {
    if (msg) { msg.textContent = 'Erro de conexão. Tente novamente.'; msg.className = 'auth-error'; msg.style.display = 'block'; }
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar link de recuperação';
  }
}
```
> Observação: `switchAuthTab('login')` (já existe) também precisa esconder `#auth-forgot`. Em `switchAuthTab`, após as linhas que mostram/escondem `auth-register`/`auth-login`, adicionar:
> ```js
>   var fg = document.getElementById('auth-forgot'); if (fg) fg.style.display = 'none';
> ```

- [ ] **Step 3: Verificar + commit**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/landing.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.
```bash
git add public/landing.html
git commit -m "feat: landing — link e fluxo 'Esqueci minha senha'"
```
Fim do corpo: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

- [ ] **Step 4: Verificação final + finishing**

Run: `npm test` (verde) + `node -c` nos arquivos backend. Depois seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2 auth_tokens + authTokens + users.updatePassword + sessions.deleteByUser + export → Task 1. ✅
- §3 forgot/reset routes + imports → Task 3. ✅
- §4 email → Task 2. ✅
- §5.1 link + forgot view + handleForgot → Task 5. ✅
- §5.2 página redefinir-senha → Task 4 Step 1. ✅
- §5.3 rota /redefinir-senha → Task 4 Step 2. ✅

**Placeholder scan:** sem TBD; todo o código é literal.

**Type consistency:** `authTokens.create(userId,type,ttl)`→raw / `consume(raw,type)`→userId usados igual em auth.js; `sendPasswordResetEmail({userEmail,userName,resetUrl})` definido (Task 2) e chamado (Task 3); `users.updatePassword`/`sessions.deleteByUser` (Task 1) usados em reset (Task 3); página POSTa `/api/auth/reset-password {token,password}` (Task 4) ↔ rota (Task 3); `showForgot`/`handleForgot`/`#auth-forgot`/`#forgotBtn`/`#forgot-msg`/`#forgotEmail` consistentes (Task 5). ✅

**Gaps conhecidos (aceitos):**
- Depende do Resend configurado para o email sair (chave da plataforma; ideal com domínio verificado).
- Sem testes unitários (I/O/UI); verificação por `node -c`/`node --check`/`npm test`.
