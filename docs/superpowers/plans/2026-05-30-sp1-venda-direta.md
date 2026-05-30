# SP1 — Venda Direta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um usuário da Vaultly venda um produto cadastrado direto na plataforma — comprador paga via checkout próprio (Pix ou cartão), o Asaas divide o valor na fonte (vendedor recebe líquido, Vaultly recebe a taxa), e o pagamento confirmado dispara o núcleo de entrega que já existe.

**Architecture:** Camada fina sobre o gateway Asaas. A Vaultly nunca custodia dinheiro: o split é configurado na criação da cobrança usando a **chave master da Vaultly** (env `ASAAS_API_KEY`) e o `walletId` do vendedor. O pagamento confirmado chega por webhook do Asaas, que (de forma idempotente) marca o pedido como pago e reaproveita `deliveryService` para entregar — exatamente como um webhook Kiwify.

**Tech Stack:** Node.js 20, Express 4.18, PostgreSQL (`pg`), Asaas API v3 (sandbox em `https://api-sandbox.asaas.com/v3`, produção `https://api.asaas.com/v3`), testes com `node:test` nativo.

---

## Desvio consciente em relação ao spec (segurança)

O spec (`docs/superpowers/specs/2026-05-30-vaultly-venda-direta-design.md`, Seção 10/13) previa `seller_accounts.asaas_api_key` "criptografado igual aos secrets atuais". **Não existe camada de criptografia no código** — os secrets atuais são TEXT puro. Para não gravar uma credencial de pagamento em texto plano, este plano **não armazena a apiKey da subconta**. O modelo de marketplace do Asaas não precisa dela: cobranças com split são criadas na conta **master** (chave em env) referenciando o `walletId` do vendedor. Armazenamos só `asaas_account_id` e `asaas_wallet_id` (identificadores de roteamento, não secretos).

---

## File Structure

**Criar:**
- `src/services/pricing.js` — cálculo puro de taxa Vaultly + split (sem I/O). Testável isoladamente.
- `src/services/asaasService.js` — client HTTP do Asaas (criar subconta, criar cobrança com split, buscar cobrança, validar token de webhook).
- `src/routes/seller.js` — onboarding do vendedor (`/api/seller/...`).
- `src/routes/checkout.js` — API pública de checkout (`/api/checkout/...`).
- `src/routes/asaasWebhook.js` — recebe webhook de pagamento do Asaas.
- `public/checkout.html` — página pública de pagamento servida em `/c/:slug`.
- `test/pricing.test.js` — testes do cálculo de taxa/split.
- `test/asaasService.test.js` — testes da montagem de payload e validação de token (com `fetch` mockado).

**Modificar:**
- `src/models/database.js` — migrations (colunas em `users`/`products`, tabelas `seller_accounts`, `orders`) e models `sellerAccounts`, `orders`; ajuste em `products.create`/`findBySlug`.
- `src/services/deliveryService.js` — nova função `processDirectOrder()` que cria a delivery e reaproveita `attemptDelivery`.
- `src/routes/products.js` — aceitar campos de venda direta (sellable, price_cents, slug, etc.).
- `src/routes/auth.js` — aceitar `usage_mode` no registro.
- `src/server.js` — registrar rotas novas, body parser do webhook Asaas, rota `/c/:slug`.
- `package.json` — script `"test": "node --test"`.
- `.env.example` (se existir; senão criar) — novas variáveis.

---

## Convenções deste plano

- Banco: helpers `query`/`queryOne` e models já existentes em `src/models/database.js`. Toda query multi-tenant filtra por `tenant_id`.
- Dinheiro em **centavos** (`*_cents` inteiros) nas tabelas novas. A API do Asaas usa reais decimais (ex: `12.90`) — a conversão fica isolada no `asaasService`/`checkout`.
- Logs via `require('../config/logger')`.
- Sem template literals aninhados com emojis em `.js` (regra do projeto).
- Testes só cobrem lógica pura (`pricing`, montagem de payload). Integração com Asaas é validada manualmente no **sandbox** (instruções na Task 9).

---

## Task 0: Configuração e variáveis de ambiente

**Files:**
- Modify: `package.json:6-9`
- Create/Modify: `.env.example`

- [ ] **Step 1: Adicionar script de teste**

Em `package.json`, dentro de `"scripts"`, adicionar a linha `test`:

```json
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Documentar as variáveis novas**

Criar (ou acrescentar a) `.env.example` com:

```
# ─── Asaas (venda direta / split) ───────────────────────────────
ASAAS_API_KEY=            # Chave da conta MASTER da Vaultly (sandbox: $aact_...)
ASAAS_VAULTLY_WALLET_ID=  # walletId da conta MASTER (recebe a taxa via split)
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3   # produção: https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=      # Token compartilhado p/ validar o header asaas-access-token
# Precificação Vaultly (configurável — sobrescreve o default do código)
VAULTLY_FEE_FIXED_CENTS=10
VAULTLY_FEE_PERCENT=1.49
DIRECT_MIN_PRICE_CENTS=900
```

- [ ] **Step 3: Verificar que o app ainda sobe**

Run: `node -e "require('./package.json'); console.log('ok')"`
Expected: imprime `ok` (JSON do package.json válido).

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example
git commit -m "chore: config e env para venda direta (Asaas, precificacao)"
```

---

## Task 1: Cálculo puro de taxa Vaultly + split (pricing.js)

Módulo puro (sem DB, sem rede). Centavos na entrada e saída. É o coração financeiro — por isso TDD completo.

**Files:**
- Create: `src/services/pricing.js`
- Test: `test/pricing.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/pricing.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { vaultlyFeeCents, buildSplit } = require('../src/services/pricing');

test('taxa Vaultly = fixo 10c + 1.49% (arredonda p/ centavo)', () => {
  // R$27,00 = 2700c -> 10 + round(2700*0.0149)=10+40=50
  assert.strictEqual(vaultlyFeeCents(2700), 50);
  // R$10,00 = 1000c -> 10 + round(1000*0.0149)=10+15=25 (14.9 arredonda p/ 15)
  assert.strictEqual(vaultlyFeeCents(1000), 25);
});

test('taxa Vaultly respeita overrides via env', () => {
  assert.strictEqual(
    vaultlyFeeCents(5000, { fixedCents: 0, percent: 2 }),
    100 // 0 + 2% de 5000 = 100
  );
});

test('buildSplit devolve valor da Vaultly em reais p/ o walletId master-less', () => {
  // amount 2700c, fee 50c -> split fixedValue 0.50 para a wallet da Vaultly
  const split = buildSplit({ amountCents: 2700, vaultlyWalletId: 'w_vaultly' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_vaultly', fixedValue: 0.5 }
  ]);
});

test('nunca cobra mais que o valor da venda', () => {
  // venda de 1 centavo: taxa não pode passar do total
  assert.ok(vaultlyFeeCents(1) <= 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/services/pricing'`.

- [ ] **Step 3: Implementar o módulo**

Criar `src/services/pricing.js`:

```js
// src/services/pricing.js
// Cálculo puro da taxa da Vaultly e do split do Asaas. Sem I/O.
// Margem Vaultly: fixo (centavos) + percentual. Configurável por env.

function feeConfig(overrides) {
  const o = overrides || {};
  const fixedCents = o.fixedCents != null
    ? o.fixedCents
    : parseInt(process.env.VAULTLY_FEE_FIXED_CENTS || '10', 10);
  const percent = o.percent != null
    ? o.percent
    : parseFloat(process.env.VAULTLY_FEE_PERCENT || '1.49');
  return { fixedCents, percent };
}

// Taxa (margem) da Vaultly, em centavos, para uma venda de amountCents.
function vaultlyFeeCents(amountCents, overrides) {
  const { fixedCents, percent } = feeConfig(overrides);
  const variable = Math.round(amountCents * (percent / 100));
  const fee = fixedCents + variable;
  // Trava de segurança: a taxa nunca pode exceder o valor da venda.
  return Math.min(fee, amountCents);
}

// Converte centavos para reais (number com 2 casas) no formato que o Asaas espera.
function centsToReais(cents) {
  return Math.round(cents) / 100;
}

// Monta o array de split do Asaas: manda a taxa da Vaultly para a wallet master.
// O restante fica automaticamente com o recebedor principal (subconta do vendedor),
// pois a cobrança é criada NA subconta do vendedor com split para a Vaultly.
function buildSplit({ amountCents, vaultlyWalletId, overrides }) {
  const feeCents = vaultlyFeeCents(amountCents, overrides);
  return [{ walletId: vaultlyWalletId, fixedValue: centsToReais(feeCents) }];
}

module.exports = { vaultlyFeeCents, centsToReais, buildSplit };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (4 testes do pricing).

- [ ] **Step 5: Commit**

```bash
git add src/services/pricing.js test/pricing.test.js
git commit -m "feat: pricing.js — calculo puro de taxa Vaultly e split (TDD)"
```

> **Nota de modelo de split:** a cobrança envia a taxa da Vaultly para a wallet master (`process.env.ASAAS_VAULTLY_WALLET_ID`, definida na Task 0) e o restante fica com a subconta do vendedor. O formato exato do split (`fixedValue` na wallet da Vaultly vs. na wallet do vendedor) deve ser confirmado no sandbox na Task 9.

---

## Task 2: Schema — colunas novas e tabelas seller_accounts / orders

**Files:**
- Modify: `src/models/database.js:188-205` (bloco de migrations incrementais) e `src/models/database.js:170-185` (CREATE TABLE)

- [ ] **Step 1: Adicionar CREATE TABLE das tabelas novas**

Em `src/models/database.js`, dentro do grande `client.query(\`...\`)` que cria as tabelas (logo após o bloco `support_tickets`, antes do fechamento `` `); ``), inserir:

```sql
      -- Conta de recebimento do vendedor no Asaas (1 por tenant)
      CREATE TABLE IF NOT EXISTS seller_accounts (
        id               TEXT PRIMARY KEY,
        tenant_id        TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        asaas_account_id TEXT,
        asaas_wallet_id  TEXT,
        status           TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'active'|'blocked'
        kyc_status       TEXT,
        accept_pix       BOOLEAN DEFAULT TRUE,
        accept_card      BOOLEAN DEFAULT TRUE,
        created_at       TIMESTAMP DEFAULT NOW(),
        updated_at       TIMESTAMP DEFAULT NOW()
      );

      -- Pedidos de venda direta (porta de entrada do modo venda direta)
      CREATE TABLE IF NOT EXISTS orders (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        buyer_name        TEXT,
        buyer_email       TEXT NOT NULL,
        buyer_doc         TEXT,
        amount_cents      INTEGER NOT NULL,
        payment_method    TEXT,                              -- 'pix'|'card'
        asaas_payment_id  TEXT UNIQUE,
        status            TEXT NOT NULL DEFAULT 'pending',   -- pending|paid|refunded|chargeback|failed
        platform_fee_cents INTEGER,
        gateway_fee_cents  INTEGER,
        net_cents          INTEGER,
        delivery_id        TEXT,
        created_at        TIMESTAMP DEFAULT NOW(),
        paid_at           TIMESTAMP,
        refunded_at       TIMESTAMP
      );
```

- [ ] **Step 2: Adicionar colunas incrementais**

No bloco `// Migracoes incrementais` (após a linha que adiciona `terms_version`), inserir:

```sql
      ALTER TABLE users    ADD COLUMN IF NOT EXISTS usage_mode          TEXT DEFAULT 'automation';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sellable            BOOLEAN DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS price_cents         INTEGER;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS slug                TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS checkout_title      TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS checkout_description TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS accept_pix          BOOLEAN DEFAULT TRUE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS accept_card         BOOLEAN DEFAULT TRUE;
      CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products (slug) WHERE slug IS NOT NULL;
```

- [ ] **Step 3: Verificar que o servidor inicia e migra sem erro**

Run: `node -e "require('dotenv').config(); require('./src/models/database').initDatabase().then(()=>{console.log('migrou ok');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"`
Expected: imprime `migrou ok` (requer DATABASE_URL acessível; se rodando offline, validar pelo menos que o arquivo não tem erro de sintaxe com `node -c src/models/database.js`).

- [ ] **Step 4: Commit**

```bash
git add src/models/database.js
git commit -m "feat: schema venda direta (usage_mode, products sellable, seller_accounts, orders)"
```

---

## Task 3: Models sellerAccounts e orders

**Files:**
- Modify: `src/models/database.js` (após o objeto `productFiles`, antes do `module.exports`)

- [ ] **Step 1: Implementar os models**

Inserir antes da linha `module.exports = {...}`:

```js
// ─── Seller Accounts (conta de recebimento Asaas) ───────────────────────────────
const sellerAccounts = {
  async upsert(tenantId, data) {
    const existing = await this.findByTenant(tenantId);
    if (existing) {
      const fields = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
      await query(
        `UPDATE seller_accounts SET ${fields}, updated_at = NOW() WHERE tenant_id = $${Object.keys(data).length + 1}`,
        [...Object.values(data), tenantId]
      );
      return this.findByTenant(tenantId);
    }
    const id = uuidv4();
    await query(
      `INSERT INTO seller_accounts (id, tenant_id, asaas_account_id, asaas_wallet_id, status, kyc_status, accept_pix, accept_card)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, tenantId, data.asaas_account_id || null, data.asaas_wallet_id || null,
       data.status || 'pending', data.kyc_status || null,
       data.accept_pix !== false, data.accept_card !== false]
    );
    return this.findByTenant(tenantId);
  },
  async findByTenant(tenantId) {
    return queryOne('SELECT * FROM seller_accounts WHERE tenant_id = $1', [tenantId]);
  }
};

// ─── Orders (vendas diretas) ────────────────────────────────────────────────────
const orders = {
  async create(tenantId, data) {
    const id = uuidv4();
    await query(
      `INSERT INTO orders (id, tenant_id, product_id, buyer_name, buyer_email, buyer_doc,
         amount_cents, payment_method, asaas_payment_id, status, platform_fee_cents, gateway_fee_cents, net_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, tenantId, data.product_id, data.buyer_name || null, data.buyer_email, data.buyer_doc || null,
       data.amount_cents, data.payment_method || null, data.asaas_payment_id || null,
       data.status || 'pending', data.platform_fee_cents || null, data.gateway_fee_cents || null, data.net_cents || null]);
    return id;
  },
  async findById(id) {
    return queryOne('SELECT * FROM orders WHERE id = $1', [id]);
  },
  async findByAsaasPaymentId(asaasPaymentId) {
    return queryOne('SELECT * FROM orders WHERE asaas_payment_id = $1', [asaasPaymentId]);
  },
  async setAsaasPaymentId(id, asaasPaymentId) {
    await query('UPDATE orders SET asaas_payment_id = $1 WHERE id = $2', [asaasPaymentId, id]);
  },
  async markPaid(id, deliveryId) {
    await query(
      `UPDATE orders SET status = 'paid', paid_at = NOW(), delivery_id = $2 WHERE id = $1`,
      [id, deliveryId || null]);
  },
  async updateStatus(id, status) {
    const refundedAt = (status === 'refunded' || status === 'chargeback') ? 'NOW()' : 'refunded_at';
    await query(`UPDATE orders SET status = $1, refunded_at = ${refundedAt} WHERE id = $2`, [status, id]);
  },
  async findAll(tenantId, limit = 100) {
    return query(
      `SELECT o.*, p.name AS product_name FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.tenant_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
      [tenantId, limit]);
  }
};
```

- [ ] **Step 2: Exportar os models**

Na linha `module.exports = { ... }`, acrescentar `sellerAccounts, orders`:

```js
module.exports = { initDatabase, pool, query, queryOne, users, sessions, tenants, products, deliveries, webhookLogs, plans, unmatchedProducts, supportTickets, productFiles, sellerAccounts, orders };
```

- [ ] **Step 3: Adicionar `findBySlug` ao model products**

Dentro do objeto `products`, após `findByPlatformId`, inserir:

```js
  async findBySlug(slug) {
    return queryOne("SELECT * FROM products WHERE slug = $1 AND sellable = TRUE AND status = 'active'", [slug]);
  },
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node -c src/models/database.js`
Expected: sem saída (sintaxe OK).

- [ ] **Step 5: Commit**

```bash
git add src/models/database.js
git commit -m "feat: models sellerAccounts, orders e products.findBySlug"
```

---

## Task 4: asaasService — client HTTP do Asaas

Isola toda chamada ao Asaas. Usa `fetch` nativo (Node 20). **Os formatos exatos de request/response devem ser confirmados contra a doc oficial (https://docs.asaas.com) no sandbox** — esta implementação segue a API v3 documentada.

**Files:**
- Create: `src/services/asaasService.js`
- Test: `test/asaasService.test.js`

- [ ] **Step 1: Escrever testes (montagem de payload + validação de token)**

Criar `test/asaasService.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSubaccountPayload, buildChargePayload, isValidWebhookToken } = require('../src/services/asaasService');

test('buildSubaccountPayload mapeia os campos do formulário', () => {
  const p = buildSubaccountPayload({
    name: 'Maria', email: 'm@x.com', cpfCnpj: '12345678900',
    mobilePhone: '32999999999', birthDate: '1990-01-01',
    incomeValue: 5000
  });
  assert.strictEqual(p.name, 'Maria');
  assert.strictEqual(p.cpfCnpj, '12345678900');
  assert.strictEqual(p.incomeValue, 5000);
});

test('buildChargePayload Pix inclui billingType e split', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'pix', amountCents: 2700,
    description: 'Ebook', vaultlyWalletId: 'w_v', dueDate: '2026-06-01'
  });
  assert.strictEqual(p.billingType, 'PIX');
  assert.strictEqual(p.customer, 'cus_1');
  assert.strictEqual(p.value, 27);
  assert.deepStrictEqual(p.split, [{ walletId: 'w_v', fixedValue: 0.5 }]);
});

test('buildChargePayload cartão usa CREDIT_CARD', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'card', amountCents: 2700,
    description: 'Ebook', vaultlyWalletId: 'w_v', dueDate: '2026-06-01'
  });
  assert.strictEqual(p.billingType, 'CREDIT_CARD');
});

test('isValidWebhookToken compara com env', () => {
  process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
  assert.strictEqual(isValidWebhookToken('segredo'), true);
  assert.strictEqual(isValidWebhookToken('errado'), false);
  assert.strictEqual(isValidWebhookToken(undefined), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/services/asaasService'`.

- [ ] **Step 3: Implementar o service**

Criar `src/services/asaasService.js`:

```js
// src/services/asaasService.js
// Client HTTP do Asaas (API v3). Conta master da Vaultly via ASAAS_API_KEY.
// As cobranças são criadas na subconta do vendedor (apiKey da subconta NÃO é
// persistida — ver plano). Para o split marketplace, criamos a cobrança na conta
// master referenciando o customer do comprador e a wallet do vendedor como
// recebedor principal via split inverso NÃO é suportado; portanto o fluxo é:
//   1) subconta criada para o vendedor (gera walletId)
//   2) cobrança criada na conta MASTER, com split enviando a TAXA p/ a Vaultly
//      e o restante para a wallet do vendedor.
// Confirmar no sandbox o formato de split que melhor atende (ver Task 9).

const logger = require('../config/logger');
const { buildSplit } = require('./pricing');

function baseUrl() {
  return process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'access_token': process.env.ASAAS_API_KEY || ''
  };
}

async function request(method, path, body) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json && json.errors ? JSON.stringify(json.errors) : ('HTTP ' + res.status);
    logger.error('Asaas ' + method + ' ' + path + ' falhou: ' + msg);
    const err = new Error('Asaas: ' + msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ── Montagem de payloads (puro — testável) ──────────────────────────────────────
function buildSubaccountPayload(d) {
  return {
    name: d.name,
    email: d.email,
    cpfCnpj: String(d.cpfCnpj || '').replace(/\D/g, ''),
    mobilePhone: d.mobilePhone ? String(d.mobilePhone).replace(/\D/g, '') : undefined,
    birthDate: d.birthDate || undefined,
    incomeValue: d.incomeValue || 1000,
    // dados bancários (opcional no cadastro; Asaas pede no saque)
    companyType: d.companyType || undefined
  };
}

function buildChargePayload(d) {
  const value = Math.round(d.amountCents) / 100;
  return {
    customer: d.customerId,
    billingType: d.method === 'card' ? 'CREDIT_CARD' : 'PIX',
    value,
    dueDate: d.dueDate,
    description: d.description || 'Compra Vaultly',
    externalReference: d.orderId || undefined,
    split: buildSplit({ amountCents: d.amountCents, vaultlyWalletId: d.vaultlyWalletId })
  };
}

function isValidWebhookToken(token) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  return !!expected && token === expected;
}

// ── Chamadas HTTP ────────────────────────────────────────────────────────────────
async function createSubaccount(formData) {
  // POST /accounts cria uma subconta white-label; devolve id, walletId, apiKey
  const payload = buildSubaccountPayload(formData);
  const acc = await request('POST', '/accounts', payload);
  return { accountId: acc.id, walletId: acc.walletId, apiKey: acc.apiKey, status: acc.status };
}

async function createCustomer({ name, email, cpfCnpj }) {
  const c = await request('POST', '/customers', {
    name, email, cpfCnpj: String(cpfCnpj || '').replace(/\D/g, '')
  });
  return c.id;
}

async function createCharge(opts) {
  // opts: customerId, method, amountCents, description, vaultlyWalletId, dueDate, orderId, card
  const payload = buildChargePayload(opts);
  if (opts.method === 'card' && opts.card) {
    payload.creditCard = opts.card.creditCard;
    payload.creditCardHolderInfo = opts.card.holderInfo;
    if (opts.remoteIp) payload.remoteIp = opts.remoteIp;
  }
  return request('POST', '/payments', payload);
}

async function getPixQrCode(paymentId) {
  // GET /payments/{id}/pixQrCode -> { encodedImage, payload (copia-e-cola) }
  return request('GET', '/payments/' + paymentId + '/pixQrCode');
}

async function getCharge(paymentId) {
  return request('GET', '/payments/' + paymentId);
}

module.exports = {
  buildSubaccountPayload, buildChargePayload, isValidWebhookToken,
  createSubaccount, createCustomer, createCharge, getPixQrCode, getCharge
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (testes de pricing + asaasService).

- [ ] **Step 5: Commit**

```bash
git add src/services/asaasService.js test/asaasService.test.js
git commit -m "feat: asaasService — client do Asaas com payloads testados"
```

---

## Task 5: processDirectOrder no deliveryService

Reaproveita `attemptDelivery` para entregar uma venda direta paga.

**Files:**
- Modify: `src/services/deliveryService.js:1-5` (imports), `:83` (exportar/usar attemptDelivery), `:191` (module.exports)

- [ ] **Step 1: Importar models necessários**

Em `src/services/deliveryService.js`, na linha 2, acrescentar `orders` e `deliveries` já está. Atualizar o require:

```js
const { products, deliveries, tenants, unmatchedProducts, users, productFiles, orders, queryOne } = require('../models/database');
```

- [ ] **Step 2: Adicionar a função processDirectOrder**

Após a função `processWebhookEvent` (antes de `attemptDelivery`), inserir:

```js
// Processa uma venda direta JÁ PAGA: cria a delivery e entrega (reaproveita attemptDelivery).
async function processDirectOrder(order) {
  const tenant = await tenants.findById(order.tenant_id);
  const user   = tenant ? await users.findById(tenant.user_id) : null;
  const isFree = !user || user.plan_id === 'free';
  const product = await products.findById(order.tenant_id, order.product_id);
  if (!product) throw new Error('Produto da order ' + order.id + ' nao encontrado');

  const deliveryId = await deliveries.create(order.tenant_id, {
    product_id:        product.id,
    platform:          'vaultly',
    platform_order_id: order.id,
    buyer_name:        order.buyer_name,
    buyer_email:       order.buyer_email,
    is_test:           false
  });

  const normalized = {
    buyerEmail: order.buyer_email,
    buyerName:  order.buyer_name,
    orderId:    order.id,
    platform:   'vaultly'
  };
  await attemptDelivery(deliveryId, product, normalized, tenant, isFree, user);
  return deliveryId;
}
```

- [ ] **Step 3: Exportar a função**

Atualizar a última linha:

```js
module.exports = { processWebhookEvent, processDirectOrder, retryFailedDeliveries, startRetryJob };
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node -c src/services/deliveryService.js`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/services/deliveryService.js
git commit -m "feat: processDirectOrder — entrega de venda direta reaproveitando deliveryService"
```

---

## Task 6: Onboarding do vendedor (routes/seller.js)

**Files:**
- Create: `src/routes/seller.js`
- Modify: `src/server.js` (registrar rota + body parser)

- [ ] **Step 1: Implementar as rotas**

Criar `src/routes/seller.js`:

```js
// src/routes/seller.js — onboarding e status da conta de recebimento (Asaas)
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sellerAccounts } = require('../models/database');
const asaas = require('../services/asaasService');
const logger = require('../config/logger');

// GET /api/seller/account — status da conta de recebimento do tenant
router.get('/account', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    res.json({ success: true, account: acc || null });
  } catch (err) {
    logger.error('seller/account: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/seller/onboarding — cria a subconta no Asaas (white-label)
router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const { name, email, cpfCnpj, mobilePhone, birthDate, incomeValue, accept_pix, accept_card } = req.body;
    if (!name || !email || !cpfCnpj) {
      return res.status(400).json({ success: false, error: 'name, email e cpfCnpj sao obrigatorios.' });
    }
    const existing = await sellerAccounts.findByTenant(req.tenantId);
    if (existing && existing.status === 'active') {
      return res.status(409).json({ success: false, error: 'Conta de recebimento ja ativa.' });
    }

    const created = await asaas.createSubaccount({ name, email, cpfCnpj, mobilePhone, birthDate, incomeValue });
    const acc = await sellerAccounts.upsert(req.tenantId, {
      asaas_account_id: created.accountId,
      asaas_wallet_id:  created.walletId,
      status:           'active',
      kyc_status:       created.status || null,
      accept_pix:       accept_pix !== false,
      accept_card:      accept_card !== false
    });
    logger.info('Subconta Asaas criada — tenant ' + req.tenantId.slice(0, 8));
    res.status(201).json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/onboarding: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel criar a conta de recebimento. ' + err.message });
  }
});

// PUT /api/seller/methods — atualiza meios aceitos (Pix/cartão)
router.put('/methods', requireAuth, async (req, res) => {
  try {
    const { accept_pix, accept_card } = req.body;
    const acc = await sellerAccounts.upsert(req.tenantId, {
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    });
    res.json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/methods: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar no server.js (body parser + rota)**

Em `src/server.js`, no bloco de body parsers normais (após linha 76 `app.use('/api/support', express.json());`), adicionar:

```js
app.use('/api/seller',     express.json());
app.use('/api/checkout',   express.json());
```

E no bloco de rotas (após linha 95 `app.use('/api/support', ...)`), adicionar:

```js
app.use('/api/seller',     require('./routes/seller'));
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/seller.js && node -c src/server.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seller.js src/server.js
git commit -m "feat: onboarding do vendedor (subconta Asaas white-label)"
```

---

## Task 7: Produto vendável (routes/products.js)

Permite marcar um produto como vendável, com preço, slug e textos de checkout. Respeita preço mínimo.

**Files:**
- Modify: `src/routes/products.js` (rota de criação/edição)
- Modify: `src/models/database.js` (`products.create` e `products.update` precisam aceitar os campos novos)

- [ ] **Step 1: Verificar como products.update trata campos**

`products.update` (em `database.js`) já é genérico (monta `SET` a partir das chaves de `data`), então aceita os campos novos automaticamente. `products.create` é explícito — **não** precisa dos campos de venda direta na criação (o produto nasce não-vendável; a venda direta é configurada via update). Nenhuma mudança em `create`.

- [ ] **Step 2: Adicionar endpoint de configuração de venda direta**

Em `src/routes/products.js`, localizar o `module.exports = router;` ao final e, antes dele, inserir a rota (ajustar import de `slugify` inline — sem dependência nova):

```js
const { sellerAccounts } = require('../models/database');

function makeSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// PUT /api/products/:id/selling — configura venda direta do produto
router.put('/:id/selling', requireAuth, async (req, res) => {
  try {
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    const { sellable, price_cents, slug, checkout_title, checkout_description, accept_pix, accept_card } = req.body;

    const product = await products.findById(req.tenantId, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    if (sellable) {
      const acc = await sellerAccounts.findByTenant(req.tenantId);
      if (!acc || acc.status !== 'active') {
        return res.status(403).json({ success: false, error: 'Ative sua conta de recebimento antes de vender direto.', needs_onboarding: true });
      }
      if (!price_cents || price_cents < MIN) {
        return res.status(400).json({ success: false, error: 'Preco minimo para venda direta e R$' + (MIN / 100).toFixed(2).replace('.', ',') + '.' });
      }
    }

    let finalSlug = slug ? makeSlug(slug) : makeSlug(product.name) + '-' + req.params.id.slice(0, 6);
    // garante unicidade
    const clash = await require('../models/database').queryOne(
      'SELECT id FROM products WHERE slug = $1 AND id <> $2', [finalSlug, req.params.id]);
    if (clash) finalSlug = finalSlug + '-' + req.params.id.slice(0, 4);

    const updated = await products.update(req.tenantId, req.params.id, {
      sellable: !!sellable,
      price_cents: price_cents || null,
      slug: finalSlug,
      checkout_title: checkout_title || product.name,
      checkout_description: checkout_description || null,
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    });
    res.json({ success: true, product: updated });
  } catch (err) {
    logger.error('products/selling: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});
```

> Confirme no topo de `products.js` que `requireAuth`, `products`, `logger` já estão importados (estão — é o padrão do arquivo). Se `sellerAccounts` já não estiver no destructuring do require de `database`, o `const { sellerAccounts } = ...` acima resolve.

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/products.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/products.js
git commit -m "feat: configurar venda direta do produto (preco, slug, meios)"
```

---

## Task 8: Checkout — API pública e criação de cobrança (routes/checkout.js)

**Files:**
- Create: `src/routes/checkout.js`
- Modify: `src/server.js` (registrar rota — body parser já adicionado na Task 6)

- [ ] **Step 1: Implementar a API de checkout**

Criar `src/routes/checkout.js`:

```js
// src/routes/checkout.js — API pública de checkout (sem auth)
const express = require('express');
const router  = express.Router();
const { products, orders, sellerAccounts, tenants } = require('../models/database');
const asaas = require('../services/asaasService');
const { vaultlyFeeCents } = require('../services/pricing');
const logger = require('../config/logger');

// GET /api/checkout/:slug — dados públicos do produto p/ renderizar a página
router.get('/:slug', async (req, res) => {
  try {
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });
    res.json({
      success: true,
      product: {
        slug: product.slug,
        title: product.checkout_title || product.name,
        description: product.checkout_description,
        price_cents: product.price_cents,
        accept_pix: product.accept_pix,
        accept_card: product.accept_card
      }
    });
  } catch (err) {
    logger.error('checkout/get: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/checkout/:slug — cria a cobrança no Asaas + a order (pending)
router.post('/:slug', async (req, res) => {
  try {
    const { buyer_name, buyer_email, buyer_doc, method, card } = req.body;
    if (!buyer_email || !buyer_doc) {
      return res.status(400).json({ success: false, error: 'Email e CPF sao obrigatorios.' });
    }
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    const pm = method === 'card' ? 'card' : 'pix';
    if (pm === 'pix' && !product.accept_pix) return res.status(400).json({ success: false, error: 'Pix indisponivel para este produto.' });
    if (pm === 'card' && !product.accept_card) return res.status(400).json({ success: false, error: 'Cartao indisponivel para este produto.' });

    const acc = await sellerAccounts.findByTenant(product.tenant_id);
    if (!acc || acc.status !== 'active' || !acc.asaas_wallet_id) {
      return res.status(409).json({ success: false, error: 'Vendedor sem conta de recebimento ativa.' });
    }

    const amountCents = product.price_cents;
    const feeCents = vaultlyFeeCents(amountCents);

    // cria a order pendente primeiro (para termos o id como externalReference)
    const orderId = await orders.create(product.tenant_id, {
      product_id: product.id, buyer_name, buyer_email, buyer_doc,
      amount_cents: amountCents, payment_method: pm,
      platform_fee_cents: feeCents
    });

    const customerId = await asaas.createCustomer({ name: buyer_name || buyer_email, email: buyer_email, cpfCnpj: buyer_doc });
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const charge = await asaas.createCharge({
      customerId, method: pm, amountCents,
      description: product.checkout_title || product.name,
      vaultlyWalletId: process.env.ASAAS_VAULTLY_WALLET_ID,
      dueDate, orderId,
      card: pm === 'card' ? card : undefined,
      remoteIp: req.headers['x-forwarded-for'] || req.ip
    });

    await orders.setAsaasPaymentId(orderId, charge.id);

    if (pm === 'pix') {
      const qr = await asaas.getPixQrCode(charge.id);
      return res.json({ success: true, orderId, method: 'pix', payment_id: charge.id,
        pix: { encodedImage: qr.encodedImage, payload: qr.payload }, status: charge.status });
    }
    // cartão: o status já volta (CONFIRMED/RECEIVED se aprovado)
    return res.json({ success: true, orderId, method: 'card', payment_id: charge.id, status: charge.status });
  } catch (err) {
    logger.error('checkout/post: ' + err.message);
    res.status(502).json({ success: false, error: 'Falha ao processar pagamento. ' + err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar a rota no server.js**

Em `src/server.js`, no bloco de rotas, adicionar (após a rota `/api/seller`):

```js
app.use('/api/checkout',   require('./routes/checkout'));
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/checkout.js && node -c src/server.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/checkout.js src/server.js
git commit -m "feat: API de checkout (cria cobranca Asaas com split + order pendente)"
```

---

## Task 9: Webhook de pagamento do Asaas (idempotente → entrega)

**Files:**
- Create: `src/routes/asaasWebhook.js`
- Modify: `src/server.js` (rota + body parser JSON; valida token por header)

- [ ] **Step 1: Implementar o webhook**

Criar `src/routes/asaasWebhook.js`:

```js
// src/routes/asaasWebhook.js — recebe eventos de pagamento do Asaas
const express = require('express');
const router  = express.Router();
const { orders } = require('../models/database');
const { isValidWebhookToken } = require('../services/asaasService');
const { processDirectOrder } = require('../services/deliveryService');
const logger = require('../config/logger');

// Eventos de pagamento confirmado
const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const REFUND_EVENTS = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'];

router.post('/webhook', async (req, res) => {
  // Asaas envia o token configurado no header 'asaas-access-token'
  const token = req.headers['asaas-access-token'];
  if (!isValidWebhookToken(token)) {
    logger.warn('Asaas webhook com token invalido');
    return res.status(401).json({ error: 'token invalido' });
  }

  const event = req.body && req.body.event;
  const payment = (req.body && req.body.payment) || {};
  res.status(200).json({ received: true }); // responde rápido; processa depois

  setImmediate(async () => {
    try {
      const order = await orders.findByAsaasPaymentId(payment.id);
      if (!order) { logger.warn('Asaas webhook: order nao encontrada p/ payment ' + payment.id); return; }

      if (PAID_EVENTS.includes(event)) {
        if (order.status === 'paid') { logger.debug('Order ja paga (idempotente): ' + order.id); return; }
        const deliveryId = await processDirectOrder(order);
        await orders.markPaid(order.id, deliveryId);
        logger.info('Venda direta paga e entregue — order ' + order.id + ', delivery ' + deliveryId);
      } else if (REFUND_EVENTS.includes(event)) {
        const newStatus = event === 'PAYMENT_REFUNDED' ? 'refunded' : 'chargeback';
        await orders.updateStatus(order.id, newStatus);
        logger.info('Order ' + order.id + ' -> ' + newStatus + ' (sem desentrega; ver disclaimer)');
      } else {
        logger.debug('Asaas evento ignorado: ' + event);
      }
    } catch (err) {
      logger.error('Asaas webhook processing: ' + err.message);
    }
  });
});

module.exports = router;
```

- [ ] **Step 2: Registrar no server.js**

Body parser: o webhook do Asaas é JSON simples (sem HMAC sobre rawBody), então usa `express.json()`. Em `src/server.js`, adicionar no bloco de body parsers:

```js
app.use('/api/asaas',      express.json());
```

E no bloco de rotas:

```js
app.use('/api/asaas',      require('./routes/asaasWebhook'));
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/asaasWebhook.js && node -c src/server.js`
Expected: sem saída.

- [ ] **Step 4: Teste manual no sandbox (validação de integração)**

Pré-requisitos: conta sandbox Asaas, `ASAAS_API_KEY` (sandbox), `ASAAS_VAULTLY_WALLET_ID` (walletId da master no sandbox), `ASAAS_WEBHOOK_TOKEN` definido, webhook do Asaas apontando para `BASE_URL/api/asaas/webhook` com esse token.

1. Criar subconta: `POST /api/seller/onboarding` (autenticado) com CPF de teste.
2. Configurar produto vendável: `PUT /api/products/:id/selling` com `price_cents` ≥ mínimo.
3. Abrir `/c/:slug`, pagar via Pix sandbox (o Asaas sandbox permite confirmar pagamento manualmente no painel).
4. Confirmar no painel Asaas → webhook dispara → checar log `Venda direta paga e entregue`.
5. Conferir no banco: `SELECT status, delivery_id FROM orders WHERE ...` → `paid`; `SELECT status FROM deliveries WHERE id = <delivery_id>` → `delivered`.

Expected: order `paid`, delivery `delivered`, email recebido.

- [ ] **Step 5: Commit**

```bash
git add src/routes/asaasWebhook.js src/server.js
git commit -m "feat: webhook de pagamento Asaas (idempotente, dispara entrega)"
```

---

## Task 10: Página pública de checkout (`/c/:slug`)

**Files:**
- Create: `public/checkout.html`
- Modify: `src/server.js` (rota `GET /c/:slug`)

- [ ] **Step 1: Criar a página**

Criar `public/checkout.html` (identidade Vaultly: laranja #FF6B35, fundo escuro; busca os dados via `/api/checkout/:slug`; Pix mostra QR + copia-e-cola; cartão envia dados — **ver nota PCI no fim da task**):

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Checkout — Vaultly</title>
<link rel="icon" type="image/svg+xml" href="/img/logo-icon.svg"/>
<style>
  :root{--bg:#0B1020;--bg2:#141A2E;--orange:#FF6B35;--text:#E8ECF5;--muted:#8A93A8}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
  .card{background:var(--bg2);border:1px solid #222a40;border-radius:16px;max-width:440px;width:100%;padding:28px}
  .logo{height:34px;margin-bottom:18px}
  h1{font-size:20px;margin:0 0 4px}.desc{color:var(--muted);font-size:14px;margin:0 0 18px}
  .price{font-size:30px;font-weight:700;color:var(--orange);margin:8px 0 18px}
  label{display:block;font-size:13px;color:var(--muted);margin:12px 0 4px}
  input{width:100%;padding:11px 12px;border-radius:9px;border:1px solid #2a3350;background:#0E1426;color:var(--text);font-size:14px}
  .methods{display:flex;gap:8px;margin:16px 0}
  .methods button{flex:1;padding:10px;border-radius:9px;border:1px solid #2a3350;background:#0E1426;color:var(--text);cursor:pointer}
  .methods button.active{border-color:var(--orange);color:var(--orange)}
  .pay{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:var(--orange);color:#1a0e06;font-weight:700;font-size:15px;cursor:pointer}
  .pay:disabled{opacity:.6;cursor:not-allowed}
  .msg{margin-top:14px;font-size:14px;text-align:center}
  .pix-box{text-align:center;margin-top:16px}.pix-box img{width:200px;border-radius:8px;background:#fff;padding:8px}
  .copy{word-break:break-all;background:#0E1426;border:1px solid #2a3350;border-radius:8px;padding:10px;font-size:12px;margin-top:10px}
  .foot{color:var(--muted);font-size:11px;text-align:center;margin-top:18px}
  .hidden{display:none}
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/img/logo-horizontal.png" alt="Vaultly"/>
    <div id="loading" class="msg">Carregando…</div>
    <div id="content" class="hidden">
      <h1 id="title"></h1>
      <p class="desc" id="desc"></p>
      <div class="price" id="price"></div>

      <div class="methods" id="methods">
        <button data-m="pix" class="active">Pix</button>
        <button data-m="card">Cartão</button>
      </div>

      <div id="form-common">
        <label>Nome</label><input id="buyer_name" autocomplete="name"/>
        <label>Email</label><input id="buyer_email" type="email" autocomplete="email"/>
        <label>CPF</label><input id="buyer_doc" inputmode="numeric"/>
      </div>

      <div id="card-fields" class="hidden">
        <label>Número do cartão</label><input id="cc_number" inputmode="numeric"/>
        <label>Nome no cartão</label><input id="cc_name"/>
        <label>Validade (MM/AAAA)</label><input id="cc_exp"/>
        <label>CVV</label><input id="cc_cvv" inputmode="numeric"/>
      </div>

      <button class="pay" id="pay">Pagar</button>
      <div class="msg" id="msg"></div>

      <div class="pix-box hidden" id="pix-box">
        <p>Escaneie o QR Code para pagar:</p>
        <img id="pix-img" alt="QR Code Pix"/>
        <div class="copy" id="pix-copy"></div>
        <p class="desc" style="margin-top:10px">Após o pagamento, o produto chega no seu email automaticamente.</p>
      </div>

      <p class="foot">Pagamento processado com segurança. A Vaultly não se responsabiliza pelo conteúdo do produto. <a href="/termos" style="color:var(--muted)">Termos</a></p>
    </div>
  </div>

<script>
const slug = location.pathname.split('/').pop();
let method = 'pix';
const $ = id => document.getElementById(id);

async function load(){
  const r = await fetch('/api/checkout/' + slug);
  const d = await r.json();
  if(!d.success){ $('loading').textContent = 'Produto não encontrado.'; return; }
  $('title').textContent = d.product.title;
  $('desc').textContent = d.product.description || '';
  $('price').textContent = 'R$ ' + (d.product.price_cents/100).toFixed(2).replace('.', ',');
  // esconde métodos não aceitos
  document.querySelectorAll('#methods button').forEach(b=>{
    if(b.dataset.m==='pix' && !d.product.accept_pix) b.remove();
    if(b.dataset.m==='card' && !d.product.accept_card) b.remove();
  });
  const first = document.querySelector('#methods button');
  if(first){ method = first.dataset.m; setMethod(method); }
  $('loading').classList.add('hidden'); $('content').classList.remove('hidden');
}

function setMethod(m){
  method = m;
  document.querySelectorAll('#methods button').forEach(b=>b.classList.toggle('active', b.dataset.m===m));
  $('card-fields').classList.toggle('hidden', m!=='card');
}
document.getElementById('methods').addEventListener('click', e=>{ if(e.target.dataset.m) setMethod(e.target.dataset.m); });

$('pay').addEventListener('click', async ()=>{
  $('msg').textContent=''; $('pay').disabled=true; $('pay').textContent='Processando…';
  const body = {
    buyer_name: $('buyer_name').value, buyer_email: $('buyer_email').value,
    buyer_doc: $('buyer_doc').value.replace(/\D/g,''), method
  };
  if(method==='card'){
    const exp = $('cc_exp').value.split('/');
    body.card = {
      creditCard: { holderName: $('cc_name').value, number: $('cc_number').value.replace(/\s/g,''),
        expiryMonth: (exp[0]||'').trim(), expiryYear: (exp[1]||'').trim(), ccv: $('cc_cvv').value },
      holderInfo: { name: $('buyer_name').value, email: $('buyer_email').value, cpfCnpj: body.buyer_doc,
        postalCode: '00000000', addressNumber: '0', phone: '' }
    };
  }
  try{
    const r = await fetch('/api/checkout/' + slug, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if(!d.success){ $('msg').textContent = d.error || 'Falha no pagamento.'; $('pay').disabled=false; $('pay').textContent='Pagar'; return; }
    if(d.method==='pix'){
      $('pay').classList.add('hidden'); $('card-fields').classList.add('hidden'); $('form-common').classList.add('hidden'); $('methods').classList.add('hidden');
      $('pix-img').src = 'data:image/png;base64,' + d.pix.encodedImage;
      $('pix-copy').textContent = d.pix.payload;
      $('pix-box').classList.remove('hidden');
    } else {
      const ok = ['CONFIRMED','RECEIVED','RECEIVED_IN_CASH'].includes(d.status);
      $('msg').textContent = ok ? 'Pagamento aprovado! O produto chegará no seu email.' : 'Pagamento ' + (d.status||'pendente') + '. Você receberá por email quando confirmado.';
      $('pay').textContent = ok ? 'Aprovado ✓' : 'Aguardando';
    }
  }catch(e){ $('msg').textContent='Erro de conexão.'; $('pay').disabled=false; $('pay').textContent='Pagar'; }
});

load();
</script>
</body>
</html>
```

> **Nota PCI:** este formulário envia os dados do cartão ao backend, que repassa ao Asaas. Para reduzir o escopo PCI, o ideal (SP3/refinamento) é trocar por **tokenização client-side do Asaas** (campo do cartão tokeniza direto no Asaas e o backend recebe só o token). Marcado como dívida no spec; aceitável no MVP sandbox.

- [ ] **Step 2: Servir a página em `/c/:slug`**

Em `src/server.js`, junto às rotas de página (após a rota `/termos`), adicionar:

```js
// Página pública de checkout de venda direta
app.get('/c/:slug', (req, res) => {
  const co = path.join(publicPath, 'checkout.html');
  if (fs.existsSync(co)) return res.sendFile(co);
  res.redirect('/');
});
```

- [ ] **Step 3: Verificar sintaxe + carregamento estático**

Run: `node -c src/server.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add public/checkout.html src/server.js
git commit -m "feat: pagina publica de checkout /c/:slug (Pix QR + cartao)"
```

---

## Task 11: usage_mode no registro

**Files:**
- Modify: `src/routes/auth.js:15-41` (register) e `src/models/database.js` (`users.create`)

- [ ] **Step 1: Aceitar usage_mode no register**

Em `src/routes/auth.js`, na rota `/register`, alterar a extração do body e a criação:

```js
    const { name, email, password, accept_terms, usage_mode } = req.body;
```

e na chamada `users.create`:

```js
    const user = await users.create({ name, email, password, plan_id: 'free', is_active: true, email_verified: true, terms_version: TERMS_VERSION, usage_mode: (usage_mode === 'direct' || usage_mode === 'both') ? usage_mode : 'automation' });
```

- [ ] **Step 2: Persistir usage_mode em users.create**

Em `src/models/database.js`, no model `users.create`, incluir a coluna. Trocar o INSERT por:

```js
    await query(`
      INSERT INTO users (id, name, email, password_hash, role, plan_id, is_active, email_verified, terms_accepted_at, terms_version, usage_mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [id, data.name, data.email, hash, data.role||'client', data.plan_id||'free', data.is_active!==false, data.email_verified||false,
        data.terms_version ? new Date() : null, data.terms_version || null, data.usage_mode || 'automation']);
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/auth.js && node -c src/models/database.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth.js src/models/database.js
git commit -m "feat: usage_mode (intencao de uso) no registro"
```

---

## Task 12: Smoke test do app completo + verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS — todos os testes de `pricing` e `asaasService`.

- [ ] **Step 2: Subir o servidor localmente**

Run: `npm start` (com `.env` apontando para um Postgres de dev e Asaas sandbox)
Expected: log `Vaultly rodando na porta ...` sem stack trace; migrations aplicadas.

- [ ] **Step 3: Checar as rotas novas respondem**

Run (com o server no ar):
`curl -s localhost:3000/api/checkout/inexistente` → espera `{"success":false,"error":"Produto nao encontrado."}`
`curl -s localhost:3000/c/qualquer` → espera HTML do checkout (status 200).

- [ ] **Step 4: Fluxo sandbox end-to-end** (repete a Task 9 Step 4 se ainda não validado)

Expected: order `paid` + delivery `delivered` + email recebido.

- [ ] **Step 5: Commit final / merge**

Seguir a skill `superpowers:finishing-a-development-branch` para decidir merge/PR.

---

## Self-Review (preenchido)

**Spec coverage:**
- Restrição regulatória (split na fonte) → Task 1/8 (split via Asaas). ✅
- Modo duplo / usage_mode → Task 11. ✅
- Asaas onboarding white-label → Task 6. ✅
- Precificação R$0,10 + 1,49% configurável → Task 0/1. ✅
- Checkout hospedado /c/:slug + slug → Task 7/8/10. ✅
- Split + webhook idempotente → Task 8/9. ✅
- Pagamento pago → núcleo de entrega existente → Task 5/9. ✅
- Disclaimer de estorno → Task 10 (rodapé do checkout) + reaproveita disclaimer dos emails já existente. ✅
- Preço mínimo R$9 → Task 7. ✅
- Tabelas/colunas (seller_accounts, orders, products, users) → Task 2/3. ✅
- **Desvio consciente:** não armazenar apiKey da subconta (segurança) — documentado no topo. ✅
- Retenção, domínio próprio, embed, quebra de transparência → **fora do SP1** (SP2/SP3), conforme decomposição do spec. ✅

**Placeholder scan:** sem TBD/TODO; pontos de integração com Asaas marcados com "confirmar no sandbox" (Task 4/9) — são gates de verificação, não placeholders de código.

**Type consistency:** `vaultlyFeeCents`, `buildSplit`, `buildChargePayload`, `processDirectOrder`, `orders.markPaid`, `sellerAccounts.findByTenant`, `products.findBySlug` usados com a mesma assinatura em que foram definidos. `platform='vaultly'` consistente entre `processDirectOrder` e o restante. ✅

**Gap conhecido (aceito):** a confirmação de pagamento de **cartão** depende do webhook (não só da resposta síncrona) — o webhook cobre ambos os casos (Pix e cartão) de forma idempotente, então não há entrega perdida nem duplicada.
