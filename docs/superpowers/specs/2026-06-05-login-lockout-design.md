# Spec — Bloqueio escalonado de login (por conta)

> Data: 2026-06-05
> Status: design aprovado pelo usuário; implementar.

---

## 1. Problema

O limite atual é **por IP** (`authLimiter` 20/15min em `/api/auth`): ao errar o login, o IP fica bloqueado e trocar de email não adianta. Queremos um esquema **por conta**, escalonado, com recuperação via reset de senha.

---

## 2. Esquema (por conta, contando falhas de login do email)

| Falhas acumuladas | Efeito |
|---|---|
| 1–4 | só conta; resposta genérica "Credenciais inválidas." |
| **5** | trava **5 min** |
| **10** | trava **10 min** + sugere redefinir a senha |
| **15** | trava **15 min** + sugere redefinir a senha |
| **20+** | **conta bloqueada** até redefinir a senha |

- **Zera o contador:** login com sucesso OU redefinição de senha (`reset-password`).
- Durante a trava, novas tentativas são rejeitadas com o tempo restante.

---

## 3. Banco (`src/models/database.js`)

Migrações incrementais (users):
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMP;
```

Model `users`:
```js
  async recordFailedLogin(userId) {
    // incrementa e calcula a trava conforme o novo total
    const rows = await query('UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1 RETURNING failed_login_count', [userId]);
    const count = rows.length ? rows[0].failed_login_count : 0;
    let lockMinutes = 0, blocked = false;
    if (count >= 20)      { blocked = true; }
    else if (count === 15) lockMinutes = 15;
    else if (count === 10) lockMinutes = 10;
    else if (count === 5)  lockMinutes = 5;
    if (blocked) {
      await query("UPDATE users SET lockout_until = NOW() + INTERVAL '100 years' WHERE id = $1", [userId]);
    } else if (lockMinutes > 0) {
      await query("UPDATE users SET lockout_until = NOW() + ($2 || ' minutes')::interval WHERE id = $1", [userId, String(lockMinutes)]);
    }
    return { count, lockMinutes, blocked };
  },
  async resetFailedLogin(userId) {
    await query('UPDATE users SET failed_login_count = 0, lockout_until = NULL WHERE id = $1', [userId]);
  },
```

---

## 4. Login (`src/routes/auth.js`)

No `POST /login`, após achar o `user` (e antes do bcrypt):
- Se `user.lockout_until` e `new Date(user.lockout_until) > new Date()`:
  - calcular minutos restantes; se `user.failed_login_count >= 20` → 423/429 "Conta bloqueada por seguranca. Redefina sua senha (Esqueci minha senha) para recuperar o acesso."; senão → 429 "Muitas tentativas. Aguarde N minuto(s)." (+ se `failed_login_count >= 10`: " Voce pode redefinir sua senha pelo link 'Esqueci minha senha'.").
  - log `warn`.
- bcrypt:
  - **sucesso** → `users.resetFailedLogin(user.id)` e segue (cria sessão, retorna token).
  - **falha** → `const r = await users.recordFailedLogin(user.id);` e responder:
    - `r.blocked` → 429 "Conta bloqueada por seguranca. Redefina sua senha (Esqueci minha senha)."
    - `r.lockMinutes > 0` → 429 "Muitas tentativas. Aguarde " + r.lockMinutes + " minuto(s)." (+ se `r.count >= 10`: sugerir reset)
    - senão → 401 "Credenciais inválidas."
  - log `warn` com email + count + IP (`req.headers['x-forwarded-for'] || req.ip`).
- **Email inexistente:** mantém 401 genérico "Credenciais inválidas." (sem rastrear — não há conta; o backstop por IP cobre flood). Nota: leve trade-off de enumeração, aceitável.

No `POST /reset-password` (já existe): após `users.updatePassword` + `sessions.deleteByUser`, chamar `await users.resetFailedLogin(userId);` (zera o contador ao redefinir).

---

## 5. IP backstop (`src/server.js`)

Afrouxar o `authLimiter` para não bloquear quem troca de conta legitimamente: `max: 20` → `max: 100` (mesma janela 15min). Continua protegendo contra enxurrada de requests; a lógica de bloqueio real passa a ser por conta.

---

## 6. Fora de escopo
- Tela de admin para desbloquear (recuperação é via reset).
- Captcha; bloqueio por device/fingerprint.

## 7. Critérios de sucesso
- 5/10/15 falhas → travas de 5/10/15 min; 20 → conta bloqueada até reset.
- Login OK ou reset de senha zeram o contador.
- Trocar de conta não fica mais globalmente bloqueado pelo IP.
- `node -c` backend + suíte verde.
