# Spec — Recuperação de senha ("Esqueci minha senha")

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Primeiro dos itens funcionais de lançamento. Reusa a infra (`auth_tokens` + email) na confirmação de email (spec seguinte).

---

## 1. Objetivo

Permitir que o usuário recupere o acesso quando esquece a senha: link "Esqueci minha senha" no login → email com link → página dedicada `/redefinir-senha` para definir a nova senha. Seguro: token hasheado, uso único, expiração, sem enumeração de usuário.

---

## 2. Banco — tabela `auth_tokens` (`src/models/database.js`)

Compartilhada (reset de senha + futura confirmação de email). No `CREATE TABLE` block:
```sql
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        TEXT NOT NULL,            -- 'reset' | 'verify'
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        used_at     TIMESTAMP,
        created_at  TIMESTAMP DEFAULT NOW()
      );
```

Model `authTokens` (novo, exportado):
```js
const crypto = require('crypto');
const authTokens = {
  // Cria um token; retorna o token CRU (para enviar por email). Guarda so o hash.
  async create(userId, type, ttlMinutes) {
    const id    = uuidv4();
    const raw   = crypto.randomBytes(32).toString('hex');
    const hash  = crypto.createHash('sha256').update(raw).digest('hex');
    const exp   = new Date(Date.now() + (ttlMinutes || 60) * 60 * 1000);
    await query(
      'INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [id, userId, type, hash, exp]
    );
    return raw;
  },
  // Valida e consome (uso unico). Retorna o user_id ou null.
  async consume(raw, type) {
    if (!raw) return null;
    const hash = crypto.createHash('sha256').update(String(raw)).digest('hex');
    const rows = await query(
      "UPDATE auth_tokens SET used_at = NOW() WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id",
      [hash, type]
    );
    return rows.length === 1 ? rows[0].user_id : null;
  }
};
```
(`crypto` já é usado no arquivo via `require('crypto')` nos models; importar localmente como acima.)

Model `users` ganha:
```js
  async updatePassword(userId, newPassword) {
    const bcrypt = require('./bcrypt');
    const hash = await bcrypt.hash(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  },
```
(Confirmar que `users.findById` já existe — é usado em outras rotas; se não, usar `queryOne('SELECT * FROM users WHERE id=$1')`.)

Sessões: para invalidar as sessões antigas após o reset, usar um helper. Se `sessions` tiver `deleteByUser`, usar; senão adicionar:
```js
  async deleteByUser(userId) { await query('DELETE FROM sessions WHERE user_id = $1', [userId]); },
```

Exportar `authTokens` no `module.exports`.

---

## 3. Backend — `src/routes/auth.js`

`POST /api/auth/forgot-password`:
```js
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (email) {
      const user = await users.findByEmail(email);
      if (user) {
        const raw = await authTokens.create(user.id, 'reset', 60);
        const base = process.env.BASE_URL || 'https://vaultly.digital';
        await sendPasswordResetEmail({ userEmail: user.email, userName: user.name, resetUrl: base + '/redefinir-senha?token=' + raw })
          .catch(e => logger.error('reset email: ' + e.message));
      }
    }
    // Sempre sucesso (nao revela se o email existe)
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  } catch (err) {
    logger.error('forgot-password: ' + err.message);
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  }
});
```

`POST /api/auth/reset-password`:
```js
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
Imports no topo do `auth.js`: incluir `authTokens` no `require('../models/database')` e `const { sendPasswordResetEmail } = require('../services/emailService')`.

Rate limit: as rotas de auth já estão sob `authLimiter` (registrado em `app.use('/api/auth', authLimiter, ...)`), então `forgot-password`/`reset-password` herdam o limite.

---

## 4. Email — `src/services/emailService.js`

`sendPasswordResetEmail({ userEmail, userName, resetUrl })`, padrão Resend (igual `sendLimitWarningEmail`): assunto "Redefinicao de senha — Vaultly", corpo com saudacao, botao "Redefinir senha" (link `resetUrl`), aviso de expiracao em 1h e "se nao foi voce, ignore". Exportar.

---

## 5. Frontend

### 5.1 Login (landing) — link "Esqueci minha senha"
No `auth-login` (modal da landing), abaixo do botão Entrar, adicionar:
```html
<div style="text-align:center;margin-top:12px;"><a href="#" onclick="showForgot();return false;" style="font-size:13px;color:var(--text2);">Esqueci minha senha</a></div>
```
Nova view `#auth-forgot` (escondida) dentro do modal: campo email + botão "Enviar link" + voltar. JS:
- `showForgot()` esconde login, mostra `#auth-forgot`.
- `handleForgot()` → `POST /api/auth/forgot-password { email }` → sempre mostra "Se o email estiver cadastrado, enviamos o link. Verifique sua caixa de entrada." (mensagem de sucesso neutra).

### 5.2 Página `public/redefinir-senha.html` (nova)
Página leve com a marca (mesmo visual do checkout/termos): lê `token` da query, formulário com **nova senha** + **confirmar senha** (com 👁️ de mostrar), botão "Redefinir senha":
- Valida: senha ≥8 e igual à confirmação.
- `POST /api/auth/reset-password { token, password }`.
- Sucesso → mensagem + botão "Ir para o login" (`/` ou `/app`).
- Erro (link inválido/expirado) → mensagem + link "Solicitar novo" (`/`).
- Se não houver `token` na URL → mensagem de link inválido.

### 5.3 Rota no `server.js`
Servir a página (igual `/termos`): 
```js
app.get('/redefinir-senha', (req, res) => {
  const p = path.join(publicPath, 'redefinir-senha.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.redirect('/');
});
```

---

## 6. Fora de escopo
- Confirmação de email (próxima spec; reusa `auth_tokens` + email).
- 2FA, expiração configurável (fixo 1h), histórico de tokens.

---

## 7. Critérios de sucesso
- "Esqueci minha senha" no login envia o email (quando a conta existe) sem revelar se o email existe.
- O link abre `/redefinir-senha`, define a nova senha, invalida sessões antigas e permite login com a nova senha.
- Token é uso único, expira em 1h e é guardado hasheado.
- `node -c` no backend + `node --check` nos scripts inline + na nova página passam; suíte existente verde.
