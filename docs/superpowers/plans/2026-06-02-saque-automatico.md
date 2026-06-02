# Saque Automático (Passo 0 + Feature A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar com segurança (criptografada) a apiKey da subconta Asaas e repassar automaticamente, a cada 2h via Pix, o saldo disponível do vendedor para a chave Pix (CPF/CNPJ) dele.

**Architecture:** Util de cripto AES-256-GCM (`crypto.js`). A apiKey da subconta (devolvida na criação) é criptografada e guardada em `seller_accounts.asaas_api_key_enc`; o CPF/CNPJ (chave Pix de repasse) em `payout_pix_key`. Um job periódico (`payoutService.js`, padrão do job de retry) consulta o saldo de cada subconta (com a apiKey dela) e cria uma transferência Pix para a chave do vendedor, registrando em `payouts`.

**Tech Stack:** Node.js 20 (`crypto` nativo), Express, PostgreSQL, `node:test`, Asaas API v3, frontend `public/index.html`.

---

## File Structure
- `src/services/crypto.js` — AES-256-GCM `encrypt`/`decrypt` (+ teste).
- `src/services/asaasService.js` — `request()` aceita apiKey opcional; `getSubaccountBalance`, `createPixTransfer`, `pixKeyType` (+ teste do `pixKeyType`).
- `src/services/payoutService.js` — job de saque (`runPayouts`, `startPayoutJob`).
- `src/models/database.js` — colunas `asaas_api_key_enc`/`payout_pix_key`; tabela `payouts`; model `payouts`; `sellerAccounts.findAllActiveWithKey`.
- `src/routes/seller.js` — onboarding exige `pix_key_declared`, guarda apiKey criptografada + payout_pix_key; `GET /account` não vaza o enc e expõe `has_payout_key`.
- `src/server.js` — inicia `startPayoutJob()`.
- `public/index.html` — checkbox de declaração no onboarding + aviso "reative" quando faltar a apiKey + texto da cadência.
- `.env.example` — `ENCRYPTION_KEY`, `PAYOUT_INTERVAL_HOURS`.

Verificação de `index.html`: extrair scripts + `node --check`.

---

## Task 1: crypto.js (AES-256-GCM) — TDD

**Files:**
- Create: `src/services/crypto.js`
- Test: `test/crypto.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/crypto.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
process.env.ENCRYPTION_KEY = '0'.repeat(64); // 32 bytes em hex (chave de teste)
const { encrypt, decrypt } = require('../src/services/crypto');

test('encrypt/decrypt: round-trip recupera o texto', () => {
  const plain = 'aact_subconta_apikey_secreta_123';
  const enc = encrypt(plain);
  assert.notStrictEqual(enc, plain);      // nao guarda em texto puro
  assert.strictEqual(decrypt(enc), plain); // recupera
});

test('encrypt: dois textos iguais geram cifras diferentes (IV aleatorio)', () => {
  assert.notStrictEqual(encrypt('abc'), encrypt('abc'));
});

test('decrypt: cifra adulterada falha (GCM autentica)', () => {
  const enc = encrypt('segredo');
  const partes = enc.split(':');
  partes[2] = Buffer.from('xxxxxxxx').toString('base64'); // corrompe o ciphertext
  assert.throws(() => decrypt(partes.join(':')));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/services/crypto'`.

- [ ] **Step 3: Implementar**

Criar `src/services/crypto.js`:
```js
// src/services/crypto.js
// Criptografia simetrica AES-256-GCM para secrets (ex.: apiKey de subconta Asaas).
// Chave em ENCRYPTION_KEY (32 bytes; aceita hex de 64 chars ou base64).
const crypto = require('crypto');

function getKey() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('ENCRYPTION_KEY nao configurada');
  const buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, 'hex') : Buffer.from(k, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY deve ter 32 bytes (64 hex ou base64)');
  return buf;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new Error('payload cifrado invalido');
  const iv  = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (3 testes novos + os existentes).

- [ ] **Step 5: Commit**

```bash
git add src/services/crypto.js test/crypto.test.js
git commit -m "feat: crypto.js — AES-256-GCM para secrets (TDD)"
```

---

## Task 2: Schema + models (apiKey enc, payout_pix_key, payouts)

**Files:**
- Modify: `src/models/database.js`

- [ ] **Step 1: Colunas + tabela**

No bloco `// Migracoes incrementais` de `src/models/database.js`, adicionar:
```sql
      ALTER TABLE seller_accounts ADD COLUMN IF NOT EXISTS asaas_api_key_enc TEXT;
      ALTER TABLE seller_accounts ADD COLUMN IF NOT EXISTS payout_pix_key    TEXT;
```
E no grande `CREATE TABLE IF NOT EXISTS` (junto das outras tabelas, antes do fechamento `` `); `` daquele query), adicionar:
```sql
      -- Repasses automaticos (saque via Pix) para o vendedor
      CREATE TABLE IF NOT EXISTS payouts (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        amount_cents      INTEGER NOT NULL DEFAULT 0,
        asaas_transfer_id TEXT,
        status            TEXT NOT NULL DEFAULT 'done',   -- 'done' | 'failed'
        error             TEXT,
        created_at        TIMESTAMP DEFAULT NOW()
      );
```

- [ ] **Step 2: Model payouts + sellerAccounts.findAllActiveWithKey**

Adicionar o model `payouts` antes do `module.exports`:
```js
// ─── Payouts (repasses automaticos) ─────────────────────────────────────────────
const payouts = {
  async create(data) {
    const id = uuidv4();
    await query(
      'INSERT INTO payouts (id, tenant_id, amount_cents, asaas_transfer_id, status, error) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, data.tenant_id, data.amount_cents || 0, data.asaas_transfer_id || null, data.status || 'done', data.error || null]
    );
    return id;
  },
  async findAll(tenantId, limit = 100) {
    return query('SELECT * FROM payouts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2', [tenantId, limit]);
  }
};
```
No objeto `sellerAccounts`, adicionar o método (após `findByTenant`):
```js
  async findAllActiveWithKey() {
    return query("SELECT * FROM seller_accounts WHERE status='active' AND asaas_api_key_enc IS NOT NULL");
  },
```
E incluir `payouts` no `module.exports` (acrescentar `, payouts` no objeto exportado).

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/models/database.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/models/database.js
git commit -m "feat: schema saque (asaas_api_key_enc, payout_pix_key, tabela payouts)"
```

---

## Task 3: asaasService — apiKey por chamada + saldo + transfer Pix

**Files:**
- Modify: `src/services/asaasService.js`
- Test: `test/asaasService.test.js`

- [ ] **Step 1: Teste do pixKeyType (puro)**

Em `test/asaasService.test.js`, no require do topo, acrescentar `pixKeyType`:
```js
const { buildSubaccountPayload, buildChargePayload, isValidWebhookToken, pixKeyType } = require('../src/services/asaasService');
```
E adicionar o teste:
```js
test('pixKeyType: 11 digitos = CPF, 14 = CNPJ', () => {
  assert.strictEqual(pixKeyType('123.456.789-00'), 'CPF');
  assert.strictEqual(pixKeyType('12.345.678/0001-90'), 'CNPJ');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `pixKeyType is not a function`.

- [ ] **Step 3: Implementar**

Em `src/services/asaasService.js`:

(a) A função `headers()` passa a aceitar uma apiKey opcional. Trocar:
```js
function headers() {
  return {
    'Content-Type': 'application/json',
    'access_token': process.env.ASAAS_API_KEY || ''
  };
}
```
por:
```js
function headers(apiKey) {
  return {
    'Content-Type': 'application/json',
    'access_token': apiKey || process.env.ASAAS_API_KEY || ''
  };
}
```

(b) `request()` passa a aceitar `apiKey` opcional. Trocar a assinatura/uso:
```js
async function request(method, path, body) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
```
por:
```js
async function request(method, path, body, apiKey) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: headers(apiKey),
    body: body ? JSON.stringify(body) : undefined
  });
```
(As chamadas existentes não passam apiKey → continuam usando a master. Nada quebra.)

(c) Adicionar, antes do `module.exports`:
```js
// Deriva o tipo da chave Pix a partir do documento (11 digitos = CPF, 14 = CNPJ).
function pixKeyType(cpfCnpj) {
  const clean = String(cpfCnpj || '').replace(/\D/g, '');
  return clean.length > 11 ? 'CNPJ' : 'CPF';
}

// Saldo disponivel da subconta (usa a apiKey da subconta). Retorna em centavos.
async function getSubaccountBalance(apiKey) {
  const r = await request('GET', '/finance/balance', null, apiKey);
  return Math.round((r && r.balance ? r.balance : 0) * 100);
}

// Transferencia Pix para uma chave (CPF/CNPJ). Roda na subconta (apiKey dela).
async function createPixTransfer(apiKey, opts) {
  const cleanKey = String(opts.pixKey || '').replace(/\D/g, '');
  return request('POST', '/transfers', {
    value: opts.valueReais,
    pixAddressKey: cleanKey,
    pixAddressKeyType: opts.pixKeyType || pixKeyType(cleanKey),
    operationType: 'PIX'
  }, apiKey);
}
```

(d) Incluir os três no `module.exports` (acrescentar `pixKeyType, getSubaccountBalance, createPixTransfer`).

> **Gate de validação (sandbox):** confirmar o endpoint de saldo (`GET /finance/balance` → `{ balance }`) e o payload de `POST /transfers` (campos `pixAddressKey`/`pixAddressKeyType`/`value`/`operationType`) e o retorno (`id`, `status`). Ajustar se a doc/sandbox divergir.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos, incl. o `pixKeyType`).

- [ ] **Step 5: Commit**

```bash
git add src/services/asaasService.js test/asaasService.test.js
git commit -m "feat: asaasService — apiKey por chamada + getSubaccountBalance + createPixTransfer + pixKeyType"
```

---

## Task 4: Onboarding — guarda apiKey criptografada + payout_pix_key + declaração

**Files:**
- Modify: `src/routes/seller.js`

- [ ] **Step 1: Importar o crypto**

No topo de `src/routes/seller.js`, após `const asaas = require('../services/asaasService');`, adicionar:
```js
const { encrypt } = require('../services/crypto');
```

- [ ] **Step 2: Exigir a declaração + guardar a apiKey/chave no onboarding**

No handler `POST /onboarding`:

(a) Na desestruturação do body, incluir `pix_key_declared`:
```js
    const { name, email, cpfCnpj, mobilePhone, birthDate, incomeValue,
            postalCode, address, addressNumber, province, accept_pix, accept_card, pix_key_declared } = req.body;
```
(b) Logo após a checagem de `!name || !email || !cpfCnpj`, adicionar:
```js
    if (pix_key_declared !== true) {
      return res.status(400).json({ success: false, error: 'E necessario declarar seu CPF/CNPJ como chave Pix para o repasse automatico.' });
    }
```
(c) No `sellerAccounts.upsert` que grava a subconta recém-criada (o que tem `asaas_account_id: created.accountId`), adicionar os dois campos:
```js
    const acc = await sellerAccounts.upsert(req.tenantId, {
      asaas_account_id: created.accountId,
      asaas_wallet_id:  created.walletId,
      asaas_api_key_enc: created.apiKey ? encrypt(created.apiKey) : null,
      payout_pix_key:    String(cpfCnpj).replace(/\D/g, ''),
      status:           'active',
      kyc_status:       created.status || null,
      accept_pix:       accept_pix !== false,
      accept_card:      accept_card !== false
    });
```
(No ramo de **adoção** — quando a subconta já existia e foi encontrada por CPF/CNPJ — não há `apiKey` disponível; deixe `asaas_api_key_enc` como está. Esse vendedor precisará reativar para habilitar o saque. Não altere o ramo de reuso/adoção além de, se quiser, gravar `payout_pix_key`.)

- [ ] **Step 3: GET /account não vaza o enc e expõe has_payout_key**

No handler `GET /account`, trocar:
```js
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    res.json({ success: true, account: acc || null });
```
por:
```js
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    let safe = null;
    if (acc) {
      const { asaas_api_key_enc, ...rest } = acc;
      safe = { ...rest, has_payout_key: !!asaas_api_key_enc };
    }
    res.json({ success: true, account: safe });
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node -c src/routes/seller.js`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/routes/seller.js
git commit -m "feat: onboarding guarda apiKey da subconta criptografada + chave Pix + declaracao obrigatoria"
```

---

## Task 5: payoutService — job de saque automático

**Files:**
- Create: `src/services/payoutService.js`
- Modify: `src/server.js`

- [ ] **Step 1: Criar o serviço**

Criar `src/services/payoutService.js`:
```js
// src/services/payoutService.js — repasse automatico via Pix para a chave do vendedor.
const { sellerAccounts, payouts } = require('../models/database');
const asaas = require('./asaasService');
const { decrypt } = require('./crypto');
const logger = require('../config/logger');

const INTERVAL_MS = parseInt(process.env.PAYOUT_INTERVAL_HOURS || '2', 10) * 60 * 60 * 1000;

async function runPayouts() {
  let accounts;
  try {
    accounts = await sellerAccounts.findAllActiveWithKey();
  } catch (e) {
    logger.error('payout: falha ao listar contas — ' + e.message);
    return;
  }
  for (const acc of (accounts || [])) {
    if (!acc.payout_pix_key || !acc.asaas_api_key_enc) continue;
    try {
      const apiKey = decrypt(acc.asaas_api_key_enc);
      const balanceCents = await asaas.getSubaccountBalance(apiKey);
      if (balanceCents <= 0) continue;
      const transfer = await asaas.createPixTransfer(apiKey, {
        pixKey: acc.payout_pix_key,
        valueReais: balanceCents / 100
      });
      await payouts.create({ tenant_id: acc.tenant_id, amount_cents: balanceCents, asaas_transfer_id: transfer && transfer.id, status: 'done' });
      logger.info('Repasse R$' + (balanceCents / 100).toFixed(2) + ' — tenant ' + acc.tenant_id.slice(0, 8));
    } catch (e) {
      logger.error('Repasse falhou — tenant ' + (acc.tenant_id || '').slice(0, 8) + ': ' + e.message);
      try { await payouts.create({ tenant_id: acc.tenant_id, amount_cents: 0, status: 'failed', error: e.message }); } catch (_) {}
    }
  }
}

function startPayoutJob() {
  setInterval(function () { runPayouts().catch(function (e) { logger.error('payout job: ' + e.message); }); }, INTERVAL_MS);
  logger.info('Job de saque automatico iniciado — intervalo: ' + (INTERVAL_MS / 3600000) + 'h');
}

module.exports = { runPayouts, startPayoutJob };
```

- [ ] **Step 2: Iniciar o job no server.js**

Em `src/server.js`, onde hoje está `const { startRetryJob } = require('./services/deliveryService');`, adicionar abaixo:
```js
const { startPayoutJob } = require('./services/payoutService');
```
E dentro de `startWithRetry`, onde chama `startRetryJob();` (após `app.listen`), adicionar logo abaixo:
```js
        startPayoutJob();
```

- [ ] **Step 3: Verificar sintaxe + require-graph**

Run: `node -c src/services/payoutService.js && node -c src/server.js`
Expected: sem saída.
Run: `node -e "require('./src/services/payoutService'); console.log('payout ok')"`
Expected: `payout ok`.

- [ ] **Step 4: Commit**

```bash
git add src/services/payoutService.js src/server.js
git commit -m "feat: job de saque automatico a cada 2h (Pix para a chave do vendedor)"
```

---

## Task 6: Frontend — declaração no onboarding + aviso de reativar

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Ler as âncoras**

READ em `public/index.html`: `renderSellerForm(prefill)`, `submitSellerOnboarding()`, `renderSellerActive(body, account)`.

- [ ] **Step 2: Checkbox de declaração + texto da cadência em renderSellerForm**

Em `renderSellerForm`, ANTES do botão "Ativar conta de recebimento" (a string que monta `<button ... id="seller-onboard-btn" ...>`), inserir na concatenação:
```js
    '<div class="form-group full" style="margin-top:6px;">' +
      '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:12px;color:var(--text2);line-height:1.5;">' +
        '<input type="checkbox" id="seller-pixdecl" style="width:16px;height:16px;accent-color:var(--orange);margin-top:2px;flex-shrink:0;" /> ' +
        '<span>Declaro que meu <strong>CPF/CNPJ está cadastrado como chave Pix</strong> no meu banco e autorizo a Vaultly a usar essa chave para repassar automaticamente os valores das minhas vendas (repasse automatico a cada 2 horas, via Pix). Se a chave nao estiver ativa no banco, o repasse nao sera concluido.</span>' +
      '</label>' +
    '</div>' +
```

- [ ] **Step 3: submitSellerOnboarding envia pix_key_declared e valida**

Em `submitSellerOnboarding()`, onde lê os campos, adicionar:
```js
  var pixDecl = !!(document.getElementById('seller-pixdecl') || {}).checked;
```
Na validação de campos obrigatórios (onde checa name/email/cpf/etc.), incluir o aceite — adicionar antes do `apiFetch`:
```js
  if (!pixDecl) { showToast('Marque a declaracao do CPF/CNPJ como chave Pix para continuar.', 'warn'); return; }
```
E no `body: JSON.stringify({ ... })` do POST de onboarding, incluir `pix_key_declared: pixDecl`.

- [ ] **Step 4: Aviso de reativar quando faltar a chave (renderSellerActive)**

Em `renderSellerActive(body, account)`, no topo do innerHTML (logo após o banner verde "Conta de recebimento ativa"), inserir um aviso condicional:
```js
    (account.has_payout_key === false ?
      '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;background:var(--yellow-dim);border:1px solid rgba(245,158,11,0.3);border-radius:8px;margin-bottom:16px;font-size:12px;color:var(--yellow);line-height:1.5;">' +
        '<i class="ti ti-alert-triangle" style="font-size:15px;flex-shrink:0;margin-top:1px;"></i>' +
        '<span>Sua conta foi criada antes do saque automatico. Para habilitar o repasse automatico, reative sua conta de recebimento (refaça o cadastro).</span>' +
      '</div>'
      : '') +
```
(Insira essa expressão concatenada no ponto certo do innerHTML de `renderSellerActive`. O `account.has_payout_key` vem do `GET /account`.)

- [ ] **Step 5: Verificar script e commitar**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: onboarding com declaracao de chave Pix + aviso de reativar conta antiga"
```

---

## Task 7: Env + verificação final

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Documentar envs**

Em `.env.example`, junto do bloco do Asaas, adicionar:
```
# Saque automatico
ENCRYPTION_KEY=          # 32 bytes em hex (64 chars) — criptografa a apiKey da subconta
PAYOUT_INTERVAL_HOURS=2  # intervalo do repasse automatico
```

- [ ] **Step 2: Testes**

Run: `npm test`
Expected: PASS (crypto, asaasService incl. pixKeyType, pricing, etc.).

- [ ] **Step 3: Sintaxe + require**

Run:
```bash
node -c src/services/crypto.js && node -c src/services/asaasService.js && node -c src/services/payoutService.js && node -c src/routes/seller.js && node -c src/models/database.js && node -c src/server.js && echo BACKEND_OK
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "index OK" && rm -f _sc.js
```
Expected: `BACKEND_OK` e `index OK`.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: env do saque automatico (ENCRYPTION_KEY, PAYOUT_INTERVAL_HOURS)"
```

- [ ] **Step 5:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- Passo 0 — crypto + apiKey criptografada (Seção 2 do spec) → Task 1 + Task 4. ✅
- Coluna `asaas_api_key_enc` + `payout_pix_key` + tabela `payouts` → Task 2. ✅
- Onboarding — declaração obrigatória do CPF/CNPJ como chave Pix → Task 4 + Task 6. ✅
- Saque automático (job a cada 2h, sem mínimo, registra payout) → Task 5. ✅
- asaasService (saldo + transfer Pix + apiKey por chamada) → Task 3. ✅
- Vendedores antigos sem apiKey → aviso de reativar (Task 6) + GET /account `has_payout_key` (Task 4). ✅
- Envs (`ENCRYPTION_KEY`, `PAYOUT_INTERVAL_HOURS`) → Task 7. ✅
- Comunicar a cadência de 2h → Task 6 (texto da declaração). ✅
- Gating por plano → onboarding já é exclusivo de pagos (gate existente); o job só pega contas ativas com apiKey. ✅

**Placeholder scan:** os "gates de validação (sandbox)" na Task 3 são pontos de confirmação contra a doc do Asaas (endpoints `/finance/balance` e `/transfers`), não placeholders de lógica — o código está completo e roda; só os shapes exatos do Asaas podem precisar de ajuste fino no sandbox.

**Type consistency:** `encrypt`/`decrypt` (Task 1) usados em seller.js (Task 4) e payoutService (Task 5); `getSubaccountBalance`/`createPixTransfer`/`pixKeyType` (Task 3) usados no payoutService (Task 5); `payouts.create` e `sellerAccounts.findAllActiveWithKey` (Task 2) usados no payoutService (Task 5); `has_payout_key` (Task 4) consumido pelo frontend (Task 6). ✅

**Gaps conhecidos (aceitos):**
- A apiKey só existe para subcontas criadas DEPOIS desta mudança; contas adotadas/antigas precisam reativar (sinalizado no painel).
- Os shapes exatos do Asaas (`/finance/balance`, `/transfers`) são confirmados no sandbox; o código segue a doc v3 e é facilmente ajustável.
- `ENCRYPTION_KEY` é obrigatória — sem ela, o onboarding falha ao tentar criptografar (erro claro). Documentado no `.env.example`.
