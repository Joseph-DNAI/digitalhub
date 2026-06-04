# B3 — Surfacing da venda direta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor a venda direta no painel: rota autenticada de pedidos, aba "Vendas" com a lista, e um card de vendas diretas no Dashboard (faturamento + nº de vendas), tudo exclusivo de assinante.

**Architecture:** `orders.stats` (agregado) no model; nova rota `src/routes/orders.js` (`GET /` e `GET /stats`) registrada no `server.js`; frontend ganha item de menu, seção `#tab-vendas`, `loadVendas()`, card no Dashboard e `loadDashVendas()`.

**Tech Stack:** Node.js/Express, PostgreSQL, frontend estático `public/index.html`.

---

## Task 1: Model orders.stats

**Files:**
- Modify: `src/models/database.js`

- [ ] **Step 1: Adicionar o método**

No model `orders` (que termina com o método `findAll` seguido de `};`), trocar:
```js
  async findAll(tenantId, limit = 100) {
    return query(
      `SELECT o.*, p.name AS product_name FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.tenant_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
      [tenantId, limit]);
  }
};
```
por:
```js
  async findAll(tenantId, limit = 100) {
    return query(
      `SELECT o.*, p.name AS product_name FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.tenant_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
      [tenantId, limit]);
  },
  async stats(tenantId) {
    const row = await queryOne(`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE status='paid' AND created_at >= date_trunc('month', NOW())), 0) AS faturamento_month_cents,
        COUNT(*) FILTER (WHERE status='paid' AND created_at >= date_trunc('month', NOW())) AS count_month,
        COUNT(*) FILTER (WHERE status='paid' AND created_at >= date_trunc('day', NOW()))   AS count_today
      FROM orders WHERE tenant_id = $1
    `, [tenantId]);
    return {
      faturamento_month_cents: parseInt(row ? row.faturamento_month_cents : 0, 10) || 0,
      count_month: parseInt(row ? row.count_month : 0, 10) || 0,
      count_today: parseInt(row ? row.count_today : 0, 10) || 0
    };
  }
};
```
(`queryOne` está definido no arquivo.)

- [ ] **Step 2: Verificar**

Run: `node -c src/models/database.js && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/models/database.js
git commit -m "feat: orders.stats — faturamento e contagem de vendas do mes/dia"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: Rota /api/orders + registro

**Files:**
- Create: `src/routes/orders.js`
- Modify: `src/server.js`

- [ ] **Step 1: Criar a rota**

Criar `src/routes/orders.js`:
```js
// src/routes/orders.js — pedidos da venda direta (painel do vendedor)
const express = require('express');
const router  = express.Router();
const { orders } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(requireAuth);

router.get('/stats', async (req, res) => {
  try {
    const stats = await orders.stats(req.tenantId);
    res.json({ success: true, stats: stats });
  } catch (err) {
    logger.error('orders/stats: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const list = await orders.findAll(req.tenantId, 100);
    res.json({ success: true, orders: list });
  } catch (err) {
    logger.error('orders/list: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar no server.js**

Em `src/server.js`, após `app.use('/api/checkout',   express.json());` (linha ~80), adicionar:
```js
app.use('/api/orders',     express.json());
```
E após `app.use('/api/checkout',   checkoutLimiter, require('./routes/checkout'));` (linha ~102), adicionar:
```js
app.use('/api/orders',     require('./routes/orders'));
```

- [ ] **Step 3: Verificar**

Run: `node -c src/routes/orders.js && node -c src/server.js && node -e "require('./src/routes/orders'); console.log('orders route ok')"`
Expected: sem erro e `orders route ok`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/orders.js src/server.js
git commit -m "feat: rota GET /api/orders + /api/orders/stats (pedidos da venda direta)"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 3: Aba Vendas (frontend)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Item no menu**

Na sidebar, trocar:
```html
      <button class="nav-item" onclick="switchTab('produtos',this)"><i class="ti ti-package"></i> Produtos</button>
      <button class="nav-item" onclick="switchTab('entregas',this)"><i class="ti ti-mail-forward"></i> Entregas</button>
```
por:
```html
      <button class="nav-item" onclick="switchTab('produtos',this)"><i class="ti ti-package"></i> Produtos</button>
      <button class="nav-item" onclick="switchTab('vendas',this)"><i class="ti ti-shopping-cart"></i> Vendas</button>
      <button class="nav-item" onclick="switchTab('entregas',this)"><i class="ti ti-mail-forward"></i> Entregas</button>
```

- [ ] **Step 2: Seção da aba**

Antes do comentário `<!-- ── ENTREGAS ── -->`, inserir:
```html
      <!-- ── VENDAS ── -->
      <div id="tab-vendas" class="section">
        <div class="page-header">
          <div>
            <div class="page-title">Vendas</div>
            <div class="page-sub">pedidos da venda direta (checkout Vaultly)</div>
          </div>
          <button class="btn btn-ghost" onclick="loadVendas()">
            <i class="ti ti-refresh"></i> Atualizar
          </button>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Comprador</th><th>Produto</th><th>Valor</th><th>Metodo</th><th>Status</th><th>Data</th></tr></thead>
              <tbody id="orders-table">
                <tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px;">Carregando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: JS — loadVendas + badge + hook no switchTab**

No `<script>`, perto de `loadDeliveries`/`switchTab`, adicionar:
```js
function orderStatusBadge(status) {
  var map = {
    paid:       ['Pago', 'var(--emerald)'],
    pending:    ['Pendente', 'var(--yellow)'],
    failed:     ['Falhou', 'var(--red)'],
    refunded:   ['Estornado', 'var(--red)'],
    chargeback: ['Chargeback', 'var(--red)']
  };
  var m = map[status] || [status || '-', 'var(--text3)'];
  return '<span style="color:' + m[1] + ';font-weight:600;">' + m[0] + '</span>';
}

async function loadVendas() {
  var tb = document.getElementById('orders-table');
  if (!tb) return;
  if (currentUser && currentUser.plan_id === 'free') {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:32px;">Ative a venda direta na aba <strong>Loja</strong> para vender pela Vaultly.</td></tr>';
    return;
  }
  tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px;">Carregando...</td></tr>';
  try {
    var res = await apiFetch('/api/orders');
    if (!res.success) throw new Error(res.error || 'Erro');
    var list = res.orders || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px;">Nenhuma venda ainda.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function(o) {
      var metodo = o.payment_method === 'card' ? 'Cartao' : (o.payment_method === 'pix' ? 'Pix' : '-');
      var valor  = 'R$ ' + ((o.amount_cents || 0) / 100).toFixed(2).replace('.', ',');
      var data   = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-';
      return '<tr>' +
        '<td>' + escAttr(o.buyer_name || o.buyer_email || '-') + '</td>' +
        '<td>' + escAttr(o.product_name || '-') + '</td>' +
        '<td>' + valor + '</td>' +
        '<td>' + metodo + '</td>' +
        '<td>' + orderStatusBadge(o.status) + '</td>' +
        '<td style="color:var(--text3);">' + data + '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:32px;">Erro ao carregar.</td></tr>';
  }
}
```
E no `switchTab(name, el)`, junto dos outros `if (name === ...)`, adicionar:
```js
  if (name === 'vendas')    loadVendas();
```

- [ ] **Step 4: Verificar script**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: aba Vendas — lista de pedidos da venda direta"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 4: Card de vendas no Dashboard

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Card no HTML do dashboard**

Na aba dashboard, entre o fechamento da `.stats-grid` e o `<div id="limit-warning-banner" ...>`, inserir:
```html
        <div class="card" id="dash-vendas-card" style="display:none;">
          <div class="card-header">
            <div class="card-title"><i class="ti ti-shopping-cart"></i> Vendas diretas (mes)</div>
            <button class="btn btn-ghost btn-xs" onclick="switchTabById('vendas')">Ver vendas</button>
          </div>
          <div class="card-body" style="display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;">
            <div>
              <div class="stat-label">Faturamento</div>
              <div class="stat-val" id="dash-fat" style="font-size:26px;">R$ 0,00</div>
            </div>
            <div style="color:var(--text2);font-size:13px;" id="dash-vendas-sub">0 vendas no mes</div>
          </div>
        </div>
```

- [ ] **Step 2: loadDashVendas + chamada no loadDashboard**

No `<script>`, adicionar a função:
```js
async function loadDashVendas() {
  var card = document.getElementById('dash-vendas-card');
  if (!card) return;
  if (currentUser && currentUser.plan_id === 'free') { card.style.display = 'none'; return; }
  try {
    var res = await apiFetch('/api/orders/stats');
    if (!res.success || !res.stats) return;
    var s = res.stats;
    document.getElementById('dash-fat').textContent = 'R$ ' + ((s.faturamento_month_cents || 0) / 100).toFixed(2).replace('.', ',');
    document.getElementById('dash-vendas-sub').textContent = (s.count_month || 0) + ' vendas no mes · ' + (s.count_today || 0) + ' hoje';
    card.style.display = 'block';
  } catch (e) {}
}
```
E no início do corpo de `loadDashboard()` (logo após `async function loadDashboard() {`), adicionar:
```js
  loadDashVendas();
```

- [ ] **Step 3: Verificar script**

Run:
```bash
node -e "const h=require('fs').readFileSync('public/index.html','utf8'); const ok = h.includes('id=\"tab-vendas\"') && h.includes('function loadVendas') && h.includes('id=\"dash-vendas-card\"') && h.includes('function loadDashVendas'); console.log(ok?'CONTENT_OK':'FALTANDO'); process.exit(ok?0:1);"
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `CONTENT_OK` e `OK`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: Dashboard — card de vendas diretas (faturamento + nº de vendas)"
```
Termine o corpo do commit com:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 5: Verificação final + finishing**

Run: `npm test` (deve continuar verde) e os `node -c` dos arquivos backend.
Depois seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2.1 orders.stats → Task 1. ✅
- §2.2 rota /api/orders + /stats → Task 2. ✅
- §2.3 registro server.js → Task 2 Step 2. ✅
- §3 aba Vendas (menu + seção + loadVendas + switchTab) → Task 3. ✅
- §4 card no Dashboard (HTML + loadDashVendas + chamada) → Task 4. ✅
- §5 gating (Free: CTA na aba, card escondido) → Task 3 Step 3 + Task 4 Step 2. ✅

**Placeholder scan:** sem TBD; todo o código é literal.

**Type consistency:** `orders.stats` retorna `{ faturamento_month_cents, count_month, count_today }` (Task 1) consumido em `/stats` (Task 2) e `loadDashVendas` (Task 4); `GET /api/orders` retorna `{ orders }` consumido em `loadVendas` (Task 3); `escAttr` já existe; `switchTabById` já existe (usado no card). IDs `tab-vendas`/`orders-table`/`dash-vendas-card`/`dash-fat`/`dash-vendas-sub` consistentes entre HTML e JS. ✅

**Gaps conhecidos (aceitos):**
- Sem testes unitários (DB/IO/UI); verificação por `node -c`/`require`/`node --check`/`npm test`.
- Faturamento conta só `status='paid'` (exclui pending/refunded/chargeback) — intencional.
