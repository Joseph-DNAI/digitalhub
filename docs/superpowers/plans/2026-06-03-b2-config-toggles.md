# B2 — Config honesto + notificação de falha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os toggles falsos do Config por 2 indicadores de status honestos + 1 opt-in real ("avisar por email quando uma entrega falhar de vez"), com o backend que envia o email na falha permanente (attempts ≥ 3).

**Architecture:** Coluna `notify_on_failure` no tenant (persistida via `/api/tenants/me`); novo email `sendDeliveryFailedEmail`; disparo no `catch` de `attemptDelivery` quando attempts ≥ 3 e o opt-in está ligado; frontend do Config ajustado.

**Tech Stack:** Node.js/Express, PostgreSQL, Resend, frontend estático.

---

## Task 1: DB + persistência (tenants)

**Files:**
- Modify: `src/models/database.js`
- Modify: `src/routes/tenants.js`

- [ ] **Step 1: Coluna**

No bloco `// Migracoes incrementais` de `src/models/database.js` (o `await client.query(\`...\`)` com os `ALTER TABLE`), adicionar uma linha:
```sql
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notify_on_failure BOOLEAN DEFAULT FALSE;
```

- [ ] **Step 2: GET /me retorna o campo**

Em `src/routes/tenants.js`, no objeto `data` do `GET /me`, após a linha `email_template: tenant ? (tenant.email_template || '') : ''`, adicionar (com vírgula na linha anterior):
```js
        notify_on_failure:      !!(tenant && tenant.notify_on_failure)
```

- [ ] **Step 3: PUT /me aceita o campo**

No array `allowed` do `PUT /me`, acrescentar `'notify_on_failure'`:
```js
      'onboarding_completed', 'platforms_enabled', 'email_template', 'notify_on_failure'
```

- [ ] **Step 4: Verificar**

Run: `node -c src/models/database.js && node -c src/routes/tenants.js && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/models/database.js src/routes/tenants.js
git commit -m "feat: tenant.notify_on_failure (coluna + GET/PUT /tenants/me)"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: emailService — sendDeliveryFailedEmail

**Files:**
- Modify: `src/services/emailService.js`

- [ ] **Step 1: Adicionar a função**

Em `src/services/emailService.js`, antes do `module.exports`, adicionar (mesmo padrão de `sendLimitWarningEmail`, usando Resend):
```js
async function sendDeliveryFailedEmail({ userEmail, userName, productName, buyerEmail, error }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fAddr  = process.env.EMAIL_FROM_ADDRESS || 'entregas@vaultly.digital';
  if (!apiKey) {
    logger.warn('RESEND_API_KEY nao configurada — aviso de falha nao enviado para ' + userEmail);
    return;
  }
  const baseUrl = process.env.BASE_URL || 'https://vaultly.digital';
  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">' +
    '<div style="background:linear-gradient(135deg,#DC2626,#EF4444);padding:30px 24px;border-radius:8px 8px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;">Uma entrega falhou</h1>' +
    '</div>' +
    '<div style="background:#f9f9f9;padding:28px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">' +
    '<p style="font-size:16px;">Ola, <strong>' + (userName || userEmail) + '</strong>!</p>' +
    '<p style="font-size:15px;line-height:1.6;">A entrega do produto <strong>' + (productName || '-') + '</strong> para <strong>' + (buyerEmail || '-') + '</strong> falhou apos 3 tentativas automaticas.</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.6;">Motivo: ' + (error || 'erro desconhecido') + '</p>' +
    '<p style="font-size:14px;color:#555;line-height:1.6;">Verifique se o produto tem arquivo anexado e se o email do comprador esta correto. Voce pode reprocessar pela aba Entregas.</p>' +
    '<div style="text-align:center;margin:28px 0;">' +
    '<a href="' + baseUrl + '/app" style="background:#FF6B35;color:#fff;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Abrir o painel</a>' +
    '</div>' +
    '<p style="font-size:12px;color:#aaa;margin-top:16px;">Voce recebe este email porque ativou o aviso de falha de entrega nas configuracoes.</p>' +
    '</div></div>';
  var response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vaultly <' + fAddr + '>', to: [userEmail], subject: 'Uma entrega falhou apos 3 tentativas', html: html })
  });
  var result = await response.json();
  if (!response.ok) throw new Error('Resend erro: ' + JSON.stringify(result));
  logger.info('Aviso de falha de entrega enviado para ' + userEmail);
}
```

- [ ] **Step 2: Exportar**

No `module.exports`, acrescentar `sendDeliveryFailedEmail`:
```js
module.exports = { sendProductEmail, sendLimitWarningEmail, testSmtpConnection, sendTestEmail, sendDeliveryFailedEmail };
```

- [ ] **Step 3: Verificar**

Run: `node -c src/services/emailService.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/services/emailService.js
git commit -m "feat: emailService — sendDeliveryFailedEmail (aviso de falha permanente)"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 3: deliveryService — disparo na falha permanente

**Files:**
- Modify: `src/services/deliveryService.js`

- [ ] **Step 1: Importar a função**

No topo de `src/services/deliveryService.js`, trocar:
```js
const { sendProductEmail, sendLimitWarningEmail } = require('./emailService');
```
por:
```js
const { sendProductEmail, sendLimitWarningEmail, sendDeliveryFailedEmail } = require('./emailService');
```

- [ ] **Step 2: Notificar no catch**

No `catch (err)` de `attemptDelivery`, trocar:
```js
  } catch (err) {
    logger.error('Falha — delivery: ' + deliveryId + ' — ' + err.message);
    await deliveries.updateStatus(deliveryId, 'failed', err.message);
    throw err;
  }
```
por:
```js
  } catch (err) {
    logger.error('Falha — delivery: ' + deliveryId + ' — ' + err.message);
    await deliveries.updateStatus(deliveryId, 'failed', err.message);
    if (tenant && tenant.notify_on_failure && user) {
      try {
        const row = await queryOne('SELECT attempts FROM deliveries WHERE id=$1', [deliveryId]);
        if (row && row.attempts >= 3) {
          await sendDeliveryFailedEmail({
            userEmail: user.email, userName: user.name,
            productName: product.name, buyerEmail: normalized.buyerEmail, error: err.message
          });
        }
      } catch (e) { logger.warn('Aviso de falha nao enviado: ' + e.message); }
    }
    throw err;
  }
```
(`queryOne` já está importado no topo do arquivo.)

- [ ] **Step 3: Verificar**

Run: `node -c src/services/deliveryService.js && node -e "require('./src/services/deliveryService'); console.log('load ok')"`
Expected: sem erro de sintaxe e `load ok`.

- [ ] **Step 4: Commit**

```bash
git add src/services/deliveryService.js
git commit -m "feat: notifica o dono por email quando uma entrega falha de vez (attempts>=3)"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 4: Frontend — Config honesto + toggle real

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Trocar o card "Comportamento do sistema"**

Localizar o `<div class="card-body">` do card cujo título é "Comportamento do sistema" (3 `toggle-row` com botões falsos) e trocar TODO o `card-body` por:
```html
          <div class="card-body">
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="t-title">Validação de assinatura HMAC</div>
                <div class="t-desc">Ativa automaticamente quando você cadastra o Secret na aba Webhook.</div>
              </div>
              <i class="ti ti-circle-check-filled" style="color:var(--emerald);font-size:22px;flex-shrink:0;"></i>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="t-title">Reenvio automático em falha</div>
                <div class="t-desc">O sistema tenta reenviar até 3 vezes, automaticamente.</div>
              </div>
              <i class="ti ti-circle-check-filled" style="color:var(--emerald);font-size:22px;flex-shrink:0;"></i>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="t-title">Avisar quando uma entrega falhar de vez</div>
                <div class="t-desc">Você recebe um email no endereço da sua conta quando uma entrega esgota as 3 tentativas.</div>
              </div>
              <button class="toggle" id="toggle-notify-failure" onclick="this.classList.toggle('on');saveNotifyFailure()"></button>
            </div>
          </div>
```

- [ ] **Step 2: Preencher loadConfig + saveNotifyFailure**

A função `loadConfig()` hoje está vazia (`async function loadConfig() {}`). Trocar por:
```js
async function loadConfig() {
  try {
    var res = await apiFetch('/api/tenants/me');
    if (res && res.success && res.data) {
      var t = document.getElementById('toggle-notify-failure');
      if (t) t.classList.toggle('on', !!res.data.notify_on_failure);
    }
  } catch (e) {}
}

async function saveNotifyFailure() {
  var t = document.getElementById('toggle-notify-failure');
  var on = t ? t.classList.contains('on') : false;
  try {
    var res = await apiFetch('/api/tenants/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notify_on_failure: on })
    });
    if (!res.success) throw new Error(res.error || 'Erro');
    showToast('Preferência de notificação salva.', 'success');
  } catch (e) {
    showToast(e.message || 'Erro ao salvar.', 'warn');
    if (t) t.classList.toggle('on');
  }
}
```

- [ ] **Step 3: Verificar**

Run:
```bash
node -e "const h=require('fs').readFileSync('public/index.html','utf8'); const ok = h.includes('id=\"toggle-notify-failure\"') && h.includes('function saveNotifyFailure') && !h.includes('Notificar admin em falha'); console.log(ok?'CONTENT_OK':'FALTANDO'); process.exit(ok?0:1);"
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `CONTENT_OK` e `OK`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: Config — status honesto + toggle real de aviso de falha"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 5: Verificação final + finishing**

Run: `npm test` (deve continuar verde — sem testes novos).
Depois seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §3 frontend (2 status + 1 toggle real, loadConfig, saveNotifyFailure) → Task 4. ✅
- §4.1 coluna DB → Task 1 Step 1. ✅
- §4.2 GET/PUT /me → Task 1 Steps 2-3. ✅
- §4.3 email → Task 2. ✅
- §4.4 disparo no catch (attempts ≥ 3 + notify_on_failure, isolado) → Task 3. ✅

**Placeholder scan:** sem TBD; todo o código é literal.

**Type consistency:** `notify_on_failure` consistente (coluna ↔ GET/PUT ↔ frontend); `sendDeliveryFailedEmail({ userEmail, userName, productName, buyerEmail, error })` definido na Task 2, importado/chamado na Task 3 com os mesmos campos; `#toggle-notify-failure` (Task 4 HTML) ↔ `loadConfig`/`saveNotifyFailure` (Task 4 JS). `queryOne` já importado no deliveryService. ✅

**Gaps conhecidos (aceitos):**
- Sem testes unitários (são I/O/UI); verificação por `node -c`/`node --check`/`npm test` verde.
- Entregas de teste (`is_test`) também notificam — aceitável (o dono é quem recebe).
