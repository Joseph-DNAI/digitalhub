# Reestruturação de Produtos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o cadastro de produto "venda direta pela Vaultly" por padrão (planos pagos), trocar o limite do plano de "total cadastrado" para "ativos", com teto global de 100 e auto-descarte do inativo mais antigo, além de um botão "Importar produtos" que inclui import por CSV com seleção.

**Architecture:** O campo `status` (active/inactive) já existente vira o liga/desliga que conta no limite do plano. A lógica de limite vira um módulo puro testável (`productLimits.js`). O backend de criação fica focado (produto base + status inicial + teto/eviction); a config de venda é aplicada pelo frontend via o endpoint `/selling` que já existe. O CSV é parseado no navegador e enviado como JSON para `POST /api/products/bulk`.

**Tech Stack:** Node.js 20, Express, PostgreSQL (`pg`), multer (upload), `node:test`, frontend HTML/JS em `public/index.html`.

---

## File Structure

**Criar:**
- `src/services/productLimits.js` — lógica pura: status inicial, pode ativar, está no teto. Testável.
- `test/productLimits.test.js` — testes da lógica pura.

**Modificar:**
- `src/models/database.js` — model `products`: `countActive`, `findOldestInactive`.
- `src/routes/products.js` — `POST /` (relaxa exigência de plataforma + teto/eviction + status inicial), novo `PUT /:id/status` (toggle), novo `POST /bulk`, remove `requirePlanLimit('product')` do POST.
- `public/index.html` — modal "Novo produto" adaptativo, botão "Importar produtos" + menu, import CSV (parse + seleção), aba Produtos Ativos/Inativos + toggle + contador.

**Convenções:** helpers `query`/`queryOne` e models em `database.js`. Money em centavos nos campos `*_cents`. Sem template literal aninhado com emoji em `.js`. Verificação de `public/index.html` por extração do script + `node --check`.

---

## Task 1: Lógica pura de limites (productLimits.js)

**Files:**
- Create: `src/services/productLimits.js`
- Test: `test/productLimits.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/productLimits.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL } = require('../src/services/productLimits');

test('initialStatus: nasce active quando ha espaco no limite de ativos', () => {
  assert.strictEqual(initialStatus(0, 1), 'active');   // free: 0 ativos de 1
  assert.strictEqual(initialStatus(4, 5), 'active');   // basic: 4 de 5
});

test('initialStatus: nasce inactive quando o limite de ativos foi atingido', () => {
  assert.strictEqual(initialStatus(1, 1), 'inactive'); // free cheio
  assert.strictEqual(initialStatus(5, 5), 'inactive'); // basic cheio
});

test('initialStatus: plano ilimitado (-1) sempre active', () => {
  assert.strictEqual(initialStatus(999, -1), 'active');
});

test('canActivate: respeita o limite de ativos', () => {
  assert.strictEqual(canActivate(0, 1), true);
  assert.strictEqual(canActivate(1, 1), false);
  assert.strictEqual(canActivate(100, -1), true); // ilimitado
});

test('atGlobalCap: true quando o total atingiu o teto', () => {
  assert.strictEqual(atGlobalCap(99, 100), false);
  assert.strictEqual(atGlobalCap(100, 100), true);
  assert.strictEqual(MAX_PRODUCTS_TOTAL, 100);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/services/productLimits'`.

- [ ] **Step 3: Implementar o módulo**

Criar `src/services/productLimits.js`:

```js
// src/services/productLimits.js
// Logica pura dos limites de produto. Sem I/O.
// - Limite do plano (maxActive) conta produtos ATIVOS (status='active'). -1 = ilimitado.
// - Teto global protege o servidor (total cadastrado por tenant).

const MAX_PRODUCTS_TOTAL = parseInt(process.env.MAX_PRODUCTS_TOTAL || '100', 10);

function unlimited(maxActive) {
  return maxActive === -1 || maxActive == null;
}

// Status inicial de um produto novo conforme o limite de ativos do plano.
function initialStatus(activeCount, maxActive) {
  if (unlimited(maxActive)) return 'active';
  return activeCount < maxActive ? 'active' : 'inactive';
}

// Pode ativar mais um produto?
function canActivate(activeCount, maxActive) {
  if (unlimited(maxActive)) return true;
  return activeCount < maxActive;
}

// O total ja atingiu o teto global?
function atGlobalCap(totalCount, cap) {
  return totalCount >= (cap || MAX_PRODUCTS_TOTAL);
}

module.exports = { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (5 testes novos + os existentes).

- [ ] **Step 5: Commit**

```bash
git add src/services/productLimits.js test/productLimits.test.js
git commit -m "feat: productLimits.js — logica pura de limite de ativos e teto global (TDD)"
```

---

## Task 2: Model — countActive e findOldestInactive

**Files:**
- Modify: `src/models/database.js` (dentro do objeto `const products = { ... }`)

- [ ] **Step 1: Adicionar os métodos**

No objeto `products` de `src/models/database.js`, logo após o método `count(tenantId)` (que termina com `return parseInt(r.n); }`), inserir:

```js
  async countActive(tenantId) {
    const r = await queryOne("SELECT COUNT(*) as n FROM products WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
    return parseInt(r.n);
  },

  async findOldestInactive(tenantId) {
    return queryOne(
      "SELECT * FROM products WHERE tenant_id = $1 AND status = 'inactive' ORDER BY created_at ASC LIMIT 1",
      [tenantId]
    );
  },
```

(Atenção à vírgula: o método anterior `count` deve terminar com `},` para o objeto continuar válido. Se `count` for o último antes do `}` de fechamento do objeto, garanta que ele tenha vírgula após a chave.)

- [ ] **Step 2: Verificar sintaxe**

Run: `node -c src/models/database.js`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/models/database.js
git commit -m "feat: products.countActive e findOldestInactive"
```

---

## Task 3: POST / — teto global, eviction e status inicial

**Files:**
- Modify: `src/routes/products.js` (imports + rota `POST /`)

- [ ] **Step 1: Importar a lógica de limites**

Em `src/routes/products.js`, após a linha `const { fetchYampiProducts, fetchKiwifyProducts } = require('../services/platformApiService');`, adicionar:

```js
const { initialStatus, atGlobalCap, MAX_PRODUCTS_TOTAL } = require('../services/productLimits');
```

- [ ] **Step 2: Reescrever a rota POST /**

Substituir o handler atual `router.post('/', requirePlanLimit('product'), uploadMw, async (req, res) => { ... });` (da linha `router.post('/', requirePlanLimit('product')` até o `});` que o fecha) por:

```js
router.post('/', uploadMw, async (req, res) => {
  try {
    const { name, description, price, kiwify_id, yampi_id, email_template, confirm_evict } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Campo obrigatório: name' });

    // Teto global anti-abuso (ativos + inativos). Se cheio: descarta o inativo mais antigo
    // (com confirmacao) ou bloqueia se todos estiverem ativos.
    const total = await products.count(req.tenantId);
    if (atGlobalCap(total, MAX_PRODUCTS_TOTAL)) {
      const oldest = await products.findOldestInactive(req.tenantId);
      if (!oldest) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        return res.status(409).json({ success: false,
          error: 'Voce atingiu o limite de ' + MAX_PRODUCTS_TOTAL + ' produtos e todos estao ativos. Desative ou apague algum para cadastrar.' });
      }
      if (confirm_evict !== 'true' && confirm_evict !== true) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        return res.status(200).json({ success: false, needs_evict: true,
          evict_product: { id: oldest.id, name: oldest.name, since: oldest.created_at },
          error: 'Limite de ' + MAX_PRODUCTS_TOTAL + ' produtos atingido.' });
      }
      // confirmado: apaga o mais antigo inativo (e seu arquivo no storage, se houver)
      if (oldest.file_path) { try { await deleteFile(oldest.file_path); } catch (_) {} }
      await products.delete(req.tenantId, oldest.id);
    }

    let r2Key = null, fileName = null;
    if (req.file) {
      r2Key    = await uploadFile(req.file.path, req.file.originalname);
      fileName = req.file.originalname;
    }

    // Status inicial: ativo se ha espaco no limite de ativos do plano; senao inativo.
    const activeCount = await products.countActive(req.tenantId);
    const status = initialStatus(activeCount, req.user.max_products);

    const created = await products.create(req.tenantId, {
      name, description: description || null,
      price: parseFloat(price) || 0,
      kiwify_id: kiwify_id || null, yampi_id: yampi_id || null,
      email_template: email_template || null,
      file_path: r2Key, file_name: fileName,
      status: status
    });

    if (kiwify_id) await unmatchedProducts.deleteByPlatformId(req.tenantId, 'kiwify', kiwify_id);
    if (yampi_id)  await unmatchedProducts.deleteByPlatformId(req.tenantId, 'yampi',  yampi_id);

    const { file_path, ...safe } = created;
    res.status(201).json({ success: true, data: safe, status: status });
  } catch (err) {
    logger.error('Erro ao criar produto: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

Notas:
- Removida a exigência de `kiwify_id`/`yampi_id` — produtos de venda direta não têm vínculo de plataforma. (O frontend orienta cada caso.)
- Removido `requirePlanLimit('product')` — o limite agora é por ativos (decidido pelo `status` inicial e pela rota de ativação na Task 4).
- `req.user.max_products` vem do middleware `requireAuth` (sessão já traz `max_products`).

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/products.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/products.js
git commit -m "feat: criar produto com teto global + eviction + status inicial por limite de ativos"
```

---

## Task 4: PUT /:id/status — ativar/desativar com limite de ativos

**Files:**
- Modify: `src/routes/products.js` (nova rota antes de `module.exports`)

- [ ] **Step 1: Importar canActivate**

Atualizar o require da Task 3 para incluir `canActivate`:

```js
const { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL } = require('../services/productLimits');
```

- [ ] **Step 2: Adicionar a rota**

Antes de `module.exports = router;`, inserir:

```js
// PUT /api/products/:id/status — ativa/desativa o produto (ativos contam no limite do plano)
router.put('/:id/status', async (req, res) => {
  try {
    const want = req.body.status === 'active' ? 'active' : 'inactive';
    const product = await products.findById(req.tenantId, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    if (want === 'active' && product.status !== 'active') {
      const activeCount = await products.countActive(req.tenantId);
      if (!canActivate(activeCount, req.user.max_products)) {
        return res.status(403).json({ success: false, needs_upgrade: true,
          error: 'Limite de produtos ativos do seu plano atingido. Faca upgrade ou desative outro produto.' });
      }
    }
    const updated = await products.update(req.tenantId, req.params.id, { status: want });
    const { file_path, ...safe } = updated;
    res.json({ success: true, data: safe });
  } catch (err) {
    logger.error('products/status: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/products.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/products.js
git commit -m "feat: PUT /:id/status — ativar/desativar com checagem de limite de ativos"
```

---

## Task 5: POST /bulk — import em massa (CSV → JSON)

**Files:**
- Modify: `src/routes/products.js` (nova rota antes de `module.exports`)

- [ ] **Step 1: Adicionar a rota**

Antes de `module.exports = router;`, inserir:

```js
// POST /api/products/bulk — cria varios produtos a partir de itens JSON (import CSV).
// Itens: [{ name, price (reais, opcional), description (opcional) }]. Sem arquivo (entra depois).
// Respeita o teto global e o limite de ativos. NAO faz eviction (para nao apagar em massa).
router.post('/bulk', express.json(), async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, error: 'Nenhum item para importar.' });

    let total = await products.count(req.tenantId);
    let activeCount = await products.countActive(req.tenantId);
    const createdList = [];
    let skipped = 0;

    for (const it of items) {
      const name = (it && it.name ? String(it.name) : '').trim();
      if (!name) { skipped++; continue; }
      if (atGlobalCap(total, MAX_PRODUCTS_TOTAL)) { skipped++; continue; }

      const status = initialStatus(activeCount, req.user.max_products);
      const priceReais = parseFloat(String(it.price || '0').replace(',', '.')) || 0;
      const created = await products.create(req.tenantId, {
        name,
        description: it.description ? String(it.description) : null,
        price: priceReais,
        status: status
      });
      createdList.push({ id: created.id, name: created.name, status: created.status });
      total++;
      if (status === 'active') activeCount++;
    }

    res.status(201).json({ success: true, created: createdList.length, skipped: skipped, items: createdList });
  } catch (err) {
    logger.error('products/bulk: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao importar.' });
  }
});
```

Nota: este router NÃO tem `express.json()` global (usa multer). Por isso o `/bulk` declara `express.json()` no próprio handler. Confirme que `express` está importado no topo do arquivo (está: `const express = require('express')`).

- [ ] **Step 2: Verificar sintaxe**

Run: `node -c src/routes/products.js`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/routes/products.js
git commit -m "feat: POST /bulk — import em massa de produtos (CSV) respeitando teto e limite de ativos"
```

---

## Task 6: Frontend — modal "Novo produto" adaptativo por plano

**Files:**
- Modify: `public/index.html` (HTML do modal de produto + funções `openModal`/`saveProduct`)

- [ ] **Step 1: Ler as âncoras**

READ em `public/index.html`:
- O modal de produto (busque `id="productModal"` ou o modal com `id="m-name"`, `id="m-kiwify"`, `id="m-yampi"`, `id="modal-title"`).
- As funções `openModal()`, `editProduct()`, `saveProduct()`.

- [ ] **Step 2: Adicionar a seção de venda direta no modal (visível só p/ pago)**

Dentro do corpo do modal de produto, após os campos básicos (nome/descrição/arquivo) e antes dos botões de salvar, inserir um bloco com `id="m-selling-section"`:

```html
        <div id="m-selling-section" style="display:none;margin-top:6px;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;"><i class="ti ti-shopping-cart" style="color:var(--orange);"></i> Vender direto pela Vaultly</div>
          <div class="toggle-row" style="border-bottom:none;padding:0 0 10px;">
            <div class="toggle-info"><div class="t-title">Colocar à venda</div><div class="t-desc">Gera um link de checkout para este produto</div></div>
            <button type="button" class="toggle" id="m-sellable" onclick="this.classList.toggle('on');document.getElementById('m-selling-fields').style.display=this.classList.contains('on')?'block':'none'"></button>
          </div>
          <div id="m-selling-fields" style="display:none;">
            <div class="form-grid">
              <div class="form-group"><label class="form-label">Preço (R$) <span style="color:var(--red);font-size:10px;">mín. R$9,00</span></label><input type="number" class="form-input" id="m-price-cents" placeholder="27.00" step="0.01" min="9"/></div>
              <div class="form-group full" style="display:flex;gap:16px;align-items:center;padding-top:6px;">
                <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;"><input type="checkbox" id="m-accept-pix" checked style="width:16px;height:16px;accent-color:var(--orange);"/> <i class="ti ti-qrcode" style="color:var(--emerald);"></i> Pix</label>
                <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;"><input type="checkbox" id="m-accept-card" checked style="width:16px;height:16px;accent-color:var(--orange);"/> <i class="ti ti-credit-card" style="color:var(--orange);"></i> Cartão</label>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 3: Mostrar/ocultar a seção conforme o plano em openModal()**

Em `openModal()` (chamada ao abrir o modal de NOVO produto), adicionar no final da função:

```js
  var sellingSec = document.getElementById('m-selling-section');
  if (sellingSec) {
    var paid = currentUser && currentUser.plan_id && currentUser.plan_id !== 'free';
    sellingSec.style.display = paid ? 'block' : 'none';
    // reset
    var tgl = document.getElementById('m-sellable'); if (tgl) tgl.classList.remove('on');
    var fld = document.getElementById('m-selling-fields'); if (fld) fld.style.display = 'none';
    var pc = document.getElementById('m-price-cents'); if (pc) pc.value = '';
  }
```

- [ ] **Step 4: Após criar o produto, aplicar a venda direta (em saveProduct)**

Em `saveProduct()`, depois do `POST /api/products` retornar sucesso e ANTES de fechar/recarregar, adicionar a aplicação da venda quando o toggle estiver ligado. Localize onde o sucesso do POST é tratado (algo como `if (data.success) { ... }`) e, usando o `data.data.id` do produto criado, insira:

```js
    // Se marcou "colocar à venda", aplica a config de venda direta no produto recém-criado
    var sellToggle = document.getElementById('m-sellable');
    if (sellToggle && sellToggle.classList.contains('on') && data.data && data.data.id) {
      var priceReais = (document.getElementById('m-price-cents').value || '').replace(',', '.');
      var priceCents = Math.round(parseFloat(priceReais) * 100) || 0;
      if (priceCents < 900) {
        showToast('Produto criado, mas o preço mínimo de venda é R$9,00 — ajuste em "Config." no card.', 'warn');
      } else {
        var sres = await apiFetch('/api/products/' + data.data.id + '/selling', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellable: true, price_cents: priceCents,
            checkout_title: document.getElementById('m-name').value || '',
            accept_pix: document.getElementById('m-accept-pix').checked,
            accept_card: document.getElementById('m-accept-card').checked })
        });
        if (!sres.success && sres.needs_onboarding) {
          showToast('Produto criado. Ative sua conta de recebimento na aba Config para vender.', 'warn');
        }
      }
    }
```

(Garanta que `saveProduct` é `async` — é, pois usa `await`/`fetch`. Se o sucesso do POST for tratado com `.then`, adapte para usar o `data.data.id` no mesmo escopo.)

- [ ] **Step 5: Tratar o aviso de eviction no teto (resposta needs_evict)**

Ainda em `saveProduct()`, onde a resposta do `POST /api/products` é avaliada: se `data.needs_evict`, perguntar e reenviar com `confirm_evict`. Adicionar, antes do tratamento de sucesso:

```js
    if (data && data.needs_evict) {
      var ev = data.evict_product || {};
      var ok = confirm('Voce atingiu o limite de produtos. O produto "' + (ev.name || '') + '" (inativo) sera apagado para liberar espaco. Continuar?');
      if (!ok) { /* reabilita o botao salvar */ return; }
      // reenvia o mesmo formulario com confirm_evict=true
      formData.append('confirm_evict', 'true');
      data = await (await fetch(getApiUrl() + '/api/products', { method: 'POST', headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}, body: formData })).json();
    }
```

(Use o mesmo objeto `formData` já montado em `saveProduct`. Ajuste os nomes de variáveis conforme o código existente — leia a função antes.)

- [ ] **Step 6: Verificar o script e commitar**

Run (extrai os `<script>` inline e checa sintaxe):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: modal de produto com venda direta padrao (pago) + eviction no teto"
```

---

## Task 7: Frontend — botão "Importar produtos" + menu

**Files:**
- Modify: `public/index.html` (cabeçalho da aba Produtos + um modal/menu de import)

- [ ] **Step 1: Ler a aba Produtos**

READ a seção da aba Produtos em `public/index.html` (busque `id="products-grid"` e a barra de ações acima dela — onde fica o botão "Novo produto"). Identifique os fluxos de import existentes (Kiwify/Yampi: funções `preRegisterKiwify`, `openModalFromPlatform`, e a lista de import de plataforma).

- [ ] **Step 2: Adicionar o botão e o menu**

Ao lado do botão "Novo produto" (na barra de ações da aba Produtos), adicionar:

```html
<button class="btn btn-ghost" onclick="openImportMenu()"><i class="ti ti-download"></i> Importar produtos</button>
```

E adicionar o modal de menu (perto dos outros modais, ex: após o `sellingModal`):

```html
<div class="modal-bg" id="importMenuModal" onclick="if(event.target===this)closeImportMenu()">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header"><div class="modal-title">Importar produtos</div>
      <button class="btn btn-ghost btn-sm" onclick="closeImportMenu()"><i class="ti ti-x"></i></button></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
      <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="closeImportMenu();importFromKiwify()"><i class="ti ti-plug" style="color:var(--orange);"></i> Importar da Kiwify</button>
      <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="closeImportMenu();importFromYampi()"><i class="ti ti-plug" style="color:var(--orange);"></i> Importar da Yampi</button>
      <button class="btn btn-ghost" style="justify-content:flex-start;" onclick="closeImportMenu();openCsvImport()"><i class="ti ti-file-spreadsheet" style="color:var(--emerald);"></i> Importar de CSV</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Funções do menu**

Adicionar as funções globais. `importFromKiwify`/`importFromYampi` devem chamar os fluxos que JÁ existem (leia os nomes reais ao ler o arquivo — ex: a aba/seção de importação de plataforma, ou `switchTabById` para a seção de import). Esqueleto:

```js
function openImportMenu() { document.getElementById('importMenuModal').classList.add('open'); }
function closeImportMenu() { document.getElementById('importMenuModal').classList.remove('open'); }
function importFromKiwify() { /* chama o fluxo Kiwify existente (ex: abrir a secao/painel de import Kiwify) */ }
function importFromYampi() { /* chama o fluxo Yampi existente */ }
```

(Se hoje os imports de Kiwify/Yampi estão como botões/painel inline na aba Produtos, mova o gatilho para dentro deste menu, fazendo `importFromKiwify`/`importFromYampi` exibirem esse painel. Não duplique a lógica — só reaponte o gatilho.)

- [ ] **Step 4: Verificar e commitar**

Run: extração do script + `node --check` (mesmo comando da Task 6 Step 6). Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: botao Importar produtos consolidando Kiwify/Yampi/CSV"
```

---

## Task 8: Frontend — Import por CSV (parse no navegador + seleção)

**Files:**
- Modify: `public/index.html` (modal de import CSV + funções)

- [ ] **Step 1: Adicionar o modal de CSV**

Perto do `importMenuModal`, adicionar:

```html
<div class="modal-bg" id="csvModal" onclick="if(event.target===this)closeCsv()">
  <div class="modal" style="max-width:600px;">
    <div class="modal-header"><div class="modal-title">Importar de CSV</div>
      <button class="btn btn-ghost btn-sm" onclick="closeCsv()"><i class="ti ti-x"></i></button></div>
    <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:12px;">
      Colunas: <code>nome,preco,descricao</code> (cabeçalho na 1ª linha). O preço é usado só em planos pagos. O arquivo PDF é enviado depois, por produto.
      <a href="#" onclick="downloadCsvTemplate();return false;" style="color:var(--orange);">Baixar modelo</a>
    </div>
    <input type="file" id="csv-file" accept=".csv,text/csv" onchange="parseCsvFile(this.files[0])" class="form-input"/>
    <div id="csv-list" style="margin-top:14px;max-height:340px;overflow:auto;"></div>
    <div id="csv-actions" style="display:none;justify-content:flex-end;gap:10px;margin-top:14px;">
      <button class="btn btn-ghost" onclick="closeCsv()">Cancelar</button>
      <button class="btn btn-primary" id="csv-import-btn" onclick="importCsvSelected()"><i class="ti ti-download"></i> Importar selecionados</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Funções de CSV (parse client-side + seleção + POST /bulk)**

Adicionar as funções globais:

```js
var _csvRows = [];

function openCsvImport() { _csvRows = []; document.getElementById('csv-list').innerHTML = ''; document.getElementById('csv-actions').style.display = 'none'; var f = document.getElementById('csv-file'); if (f) f.value = ''; document.getElementById('csvModal').classList.add('open'); }
function closeCsv() { document.getElementById('csvModal').classList.remove('open'); }

function downloadCsvTemplate() {
  var csv = 'nome,preco,descricao\nEbook Marketing,27.00,Guia completo de marketing\nPlanilha Financeira,19.90,Controle suas financas\n';
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'modelo-produtos.csv'; a.click();
}

// Parse simples de CSV: detecta separador , ou ; ; suporta campos entre aspas.
function parseCsv(text) {
  var lines = text.replace(/\r/g, '').split('\n').filter(function(l) { return l.trim() !== ''; });
  if (!lines.length) return [];
  var sep = (lines[0].indexOf(';') > -1 && lines[0].indexOf(',') === -1) ? ';' : ',';
  function splitLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else { cur += c; }
    }
    out.push(cur);
    return out.map(function(s) { return s.trim().replace(/^"|"$/g, ''); });
  }
  var header = splitLine(lines[0]).map(function(h) { return h.toLowerCase(); });
  var iName = header.indexOf('nome'); var iPrice = header.indexOf('preco'); var iDesc = header.indexOf('descricao');
  if (iName === -1) iName = 0;
  var rows = [];
  for (var r = 1; r < lines.length; r++) {
    var cols = splitLine(lines[r]);
    var name = (cols[iName] || '').trim();
    if (!name) continue;
    rows.push({ name: name, price: iPrice > -1 ? (cols[iPrice] || '') : '', description: iDesc > -1 ? (cols[iDesc] || '') : '' });
  }
  return rows;
}

function parseCsvFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    _csvRows = parseCsv(e.target.result);
    renderCsvList();
  };
  reader.readAsText(file, 'UTF-8');
}

function renderCsvList() {
  var el = document.getElementById('csv-list');
  if (!_csvRows.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px;">Nenhum produto encontrado no arquivo.</div>'; document.getElementById('csv-actions').style.display = 'none'; return; }
  el.innerHTML = _csvRows.map(function(row, i) {
    return '<label style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;">' +
      '<input type="checkbox" class="csv-chk" data-i="' + i + '" checked style="width:16px;height:16px;accent-color:var(--orange);"/>' +
      '<span style="flex:1;font-weight:600;">' + escAttr(row.name) + '</span>' +
      (row.price ? '<span style="color:var(--orange);font-family:\'JetBrains Mono\',monospace;">R$ ' + escAttr(row.price) + '</span>' : '') +
      '</label>';
  }).join('');
  document.getElementById('csv-actions').style.display = 'flex';
}

async function importCsvSelected() {
  var checks = Array.prototype.slice.call(document.querySelectorAll('.csv-chk:checked'));
  var items = checks.map(function(c) { return _csvRows[parseInt(c.getAttribute('data-i'), 10)]; }).filter(Boolean);
  if (!items.length) { showToast('Selecione ao menos um produto.', 'warn'); return; }
  var btn = document.getElementById('csv-import-btn'); btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block;"></i> Importando...';
  try {
    var res = await apiFetch('/api/products/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items }) });
    if (!res.success) throw new Error(res.error || 'Falha ao importar');
    showToast(res.created + ' produto(s) importado(s)' + (res.skipped ? ' · ' + res.skipped + ' ignorado(s)' : '') + '.', 'success');
    closeCsv();
    loadProducts();
  } catch (e) {
    showToast(e.message || 'Erro ao importar.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-download"></i> Importar selecionados';
  }
}
```

- [ ] **Step 3: Verificar e commitar**

Run: extração do script + `node --check` (comando da Task 6 Step 6). Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: import de produtos por CSV (parse no navegador + lista com selecao)"
```

---

## Task 9: Frontend — aba Produtos Ativos/Inativos + toggle + contador

**Files:**
- Modify: `public/index.html` (`loadProducts` e o cabeçalho da aba)

- [ ] **Step 1: Contador de ativos no topo da aba**

No cabeçalho da aba Produtos (perto do título), adicionar um elemento `<span id="products-active-count" style="font-size:12px;color:var(--text2);"></span>`. Em `loadProducts()`, após obter `res.data`, calcular e preencher:

```js
    var active = res.data.filter(function(p) { return p.status === 'active'; }).length;
    var lim = (currentUser && currentUser.max_products);
    var limTxt = (lim === -1 || lim == null) ? '∞' : lim;
    var cc = document.getElementById('products-active-count');
    if (cc) cc.textContent = active + '/' + limTxt + ' ativos · ' + res.data.length + '/100 cadastrados';
```

- [ ] **Step 2: Filtro Ativos/Inativos**

Adicionar acima do grid (`#products-grid`) um filtro simples:

```html
<div style="display:flex;gap:8px;margin-bottom:14px;">
  <button class="btn btn-ghost btn-sm" id="pf-all" onclick="setProductFilter('all')">Todos</button>
  <button class="btn btn-ghost btn-sm" id="pf-active" onclick="setProductFilter('active')">Ativos</button>
  <button class="btn btn-ghost btn-sm" id="pf-inactive" onclick="setProductFilter('inactive')">Inativos</button>
</div>
```

E a lógica de filtro:

```js
var _productFilter = 'all';
function setProductFilter(f) { _productFilter = f; loadProducts(); }
```

Em `loadProducts()`, ao montar o grid, filtrar `res.data` por `_productFilter` (quando != 'all', `res.data.filter(p => p.status === _productFilter)`).

- [ ] **Step 3: Toggle de ativação no card**

No template do card em `loadProducts()`, trocar/ajustar o badge de status por um botão-toggle que chama `toggleProductStatus`. Onde hoje há `<span class="badge badge-${p.status === 'active' ? 'green' : 'red'}">...`, adicionar ao lado (ou no rodapé do card) um botão:

```js
`<button class="btn btn-ghost btn-sm" onclick="toggleProductStatus('${p.id}','${p.status === 'active' ? 'inactive' : 'active'}')" title="${p.status === 'active' ? 'Desativar' : 'Ativar'}">
   <i class="ti ti-${p.status === 'active' ? 'player-pause' : 'player-play'}"></i> ${p.status === 'active' ? 'Ativo' : 'Inativo'}
 </button>`
```

E a função:

```js
async function toggleProductStatus(id, want) {
  try {
    var res = await apiFetch('/api/products/' + id + '/status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: want }) });
    if (!res.success) {
      if (res.needs_upgrade) { showToast(res.error, 'warn'); showUpgradeModal && showUpgradeModal(); }
      else showToast(res.error || 'Erro.', 'error');
      return;
    }
    showToast(want === 'active' ? 'Produto ativado!' : 'Produto desativado.', 'success');
    loadProducts();
  } catch (e) { showToast(e.message || 'Erro.', 'error'); }
}
```

- [ ] **Step 4: Verificar e commitar**

Run: extração do script + `node --check` (comando da Task 6 Step 6). Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: aba Produtos com filtro Ativos/Inativos, contador e toggle de ativacao"
```

---

## Task 10: Verificação final

- [ ] **Step 1: Testes**

Run: `npm test`
Expected: PASS — testes de `productLimits`, `pricing`, `asaasService` (todos verdes).

- [ ] **Step 2: Sintaxe de tudo que mudou**

Run:
```bash
node -c src/routes/products.js && node -c src/models/database.js && node -c src/services/productLimits.js && echo BACKEND_OK
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo INDEX_OK && rm -f _sc.js
```
Expected: `BACKEND_OK` e `INDEX_OK`.

- [ ] **Step 3: Require-graph**

Run: `node -e "require('./src/routes/products'); const pl=require('./src/services/productLimits'); console.log('ok', typeof pl.initialStatus, typeof pl.canActivate);"`
Expected: `ok function function`.

- [ ] **Step 4:** Seguir `superpowers:finishing-a-development-branch` para o deploy.

---

## Self-Review (preenchido)

**Spec coverage:**
- Modelo ativo/inativo + limite por ativos → Task 1/2/3/4 + Task 9. ✅
- Teto global 100 + eviction do inativo mais antigo (com confirmação; bloqueia se todos ativos) → Task 2 (POST) + Task 6 (UI confirm). ✅
- Cadastro adaptativo (pago = venda direta padrão; Free = sem checkout) → Task 6. ✅
- Botão "Importar produtos" (Kiwify/Yampi/CSV) → Task 7. ✅
- Import CSV com seleção (parse no navegador, checkboxes, /bulk) → Task 5 (backend) + Task 8 (frontend). ✅
- Aba Ativos/Inativos + contador + toggle → Task 9. ✅
- Plano pago cria produto sem vínculo de plataforma → Task 3 (removida exigência kiwify/yampi). ✅

**Placeholder scan:** os trechos "leia a função antes/reaponte o gatilho existente" nas Tasks 6/7 são instruções de integração com código existente que o implementador deve ler (alvo da implementação), não placeholders de lógica. O código novo está completo.

**Type consistency:** `initialStatus`/`canActivate`/`atGlobalCap` usados com a mesma assinatura definida na Task 1; `products.countActive`/`findOldestInactive` definidos na Task 2 e usados nas Tasks 3/4/5; endpoints `/status` e `/bulk` consumidos pelo frontend nas Tasks 8/9 com os mesmos shapes. ✅

**Gap conhecido (aceito):** a exigência de arquivo (PDF) não é validada na criação — produtos podem nascer sem arquivo (catálogo), coerente com o import CSV. A entrega só funciona após o upload do arquivo (comportamento já existente: produto "sem arquivo").
