# Repasse da Taxa do Cartão + Aba "Loja" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o vendedor (plano pago) repasse a taxa do cartão ao comprador — no checkout o Pix mostra o valor real e o cartão mostra o valor com a taxa embutida (gross-up), e o vendedor recebe o preço cheio. A configuração mora numa nova aba "Loja" que consolida a Venda Direta.

**Architecture:** O gross-up é uma função pura (`cardChargeCents`) em `pricing.js`. A divisão (split) NÃO muda — ela já entrega `cobrado − taxaAsaas`; basta cobrar o valor com gross-up no cartão. Um flag por loja (`pass_card_fee_to_buyer` em `seller_accounts`) liga o comportamento. O painel ganha uma aba "Loja" que recebe a seção de Venda Direta (hoje na Config) + o toggle de repasse.

**Tech Stack:** Node.js 20, Express, PostgreSQL, `node:test`, frontend em `public/index.html` e `public/checkout.html`.

---

## File Structure
- `src/services/pricing.js` — nova função pura `cardChargeCents` (+ teste em `test/pricing.test.js`).
- `src/models/database.js` — migration `pass_card_fee_to_buyer` em `seller_accounts`.
- `src/routes/seller.js` — `PUT /methods` aceita `pass_card_fee_to_buyer`.
- `src/routes/checkout.js` — GET retorna `pix_cents`/`card_cents`/`pass_card_fee`; POST cobra gross-up no cartão quando ligado.
- `public/index.html` — aba "Loja"; mover Venda Direta pra lá; toggle de repasse.
- `public/checkout.html` — exibir os dois preços + nota do cartão.

Verificação de `public/*.html`: extrair os `<script>` inline e `node --check`.

---

## Task 1: Função pura cardChargeCents (gross-up)

**Files:**
- Modify: `src/services/pricing.js`
- Test: `test/pricing.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Em `test/pricing.test.js`, adicionar ANTES do último `});` do arquivo (ou no fim, antes de nada — qualquer posição de topo de arquivo serve; basta importar a função). Primeiro, garantir que o `require` no topo do arquivo inclua `cardChargeCents`. O topo atual é:
```js
const { vaultlyFeeCents, buildSplit } = require('../src/services/pricing');
```
Trocar por:
```js
const { vaultlyFeeCents, buildSplit, cardChargeCents } = require('../src/services/pricing');
```
E adicionar o teste:
```js
test('cardChargeCents: gross-up cobre a taxa do cartao (arredonda p/ cima)', () => {
  // P=2700, taxa 1,99% + R$0,49 -> ceil((2700+49)/0.9801) = ceil(2804.81) = 2805
  assert.strictEqual(cardChargeCents(2700), 2805);
});

test('cardChargeCents: apos a taxa, o vendedor recebe ~o preco cheio', () => {
  const charged = cardChargeCents(2700);            // 2805
  const asaasFee = Math.round(charged * 0.0199) + 49; // 56 + 49 = 105
  assert.ok(charged - asaasFee >= 2700);            // vendedor recebe >= P
  assert.ok(charged - asaasFee <= 2702);            // e nao muito acima (centavos de arredondamento)
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `cardChargeCents is not a function` (ou TypeError) nos novos testes.

- [ ] **Step 3: Implementar a função**

Em `src/services/pricing.js`, adicionar a função ANTES do `module.exports`:
```js
// Gross-up do cartao: valor a cobrar para que, apos a taxa do cartao (pct + fixo),
// o vendedor receba o preco cheio. Arredonda p/ cima (vendedor nunca recebe a menos).
function cardChargeCents(priceCents, overrides) {
  const o = overrides || {};
  const pct   = (o.cardPercent != null ? o.cardPercent : parseFloat(process.env.ASAAS_CARD_PERCENT || '1.99')) / 100;
  const fixed = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
  if (!(pct < 1)) return priceCents; // guarda contra config invalida
  return Math.ceil((priceCents + fixed) / (1 - pct));
}
```
E incluir `cardChargeCents` no `module.exports`. O export atual é:
```js
module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit };
```
Trocar por:
```js
module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit, cardChargeCents };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos os testes, incluindo os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add src/services/pricing.js test/pricing.test.js
git commit -m "feat: cardChargeCents — gross-up da taxa do cartao (TDD)"
```

---

## Task 2: Migration — pass_card_fee_to_buyer em seller_accounts

**Files:**
- Modify: `src/models/database.js` (bloco de `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)

- [ ] **Step 1: Adicionar a coluna**

Em `src/models/database.js`, no bloco `// Migracoes incrementais` (o `await client.query(\`...\`)` com vários `ALTER TABLE`), adicionar uma linha (junto das outras, antes do fechamento `` `); ``):
```sql
      ALTER TABLE seller_accounts ADD COLUMN IF NOT EXISTS pass_card_fee_to_buyer BOOLEAN DEFAULT FALSE;
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node -c src/models/database.js`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/models/database.js
git commit -m "feat: coluna pass_card_fee_to_buyer em seller_accounts"
```

---

## Task 3: seller.js — PUT /methods aceita pass_card_fee_to_buyer

**Files:**
- Modify: `src/routes/seller.js` (rota `PUT /methods`)

- [ ] **Step 1: Estender o handler**

Em `src/routes/seller.js`, o handler atual é:
```js
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
```
Substituir o corpo do `try` por:
```js
    const { accept_pix, accept_card, pass_card_fee_to_buyer } = req.body;
    const data = {
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    };
    if (pass_card_fee_to_buyer !== undefined) data.pass_card_fee_to_buyer = !!pass_card_fee_to_buyer;
    const acc = await sellerAccounts.upsert(req.tenantId, data);
    res.json({ success: true, account: acc });
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node -c src/routes/seller.js`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add src/routes/seller.js
git commit -m "feat: PUT /seller/methods salva pass_card_fee_to_buyer (config da loja)"
```

---

## Task 4: checkout.js — dois preços (GET) + gross-up no cartão (POST)

**Files:**
- Modify: `src/routes/checkout.js`

- [ ] **Step 1: Importar cardChargeCents**

Em `src/routes/checkout.js`, a linha:
```js
const { vaultlyFeeCents } = require('../services/pricing');
```
trocar por:
```js
const { vaultlyFeeCents, cardChargeCents } = require('../services/pricing');
```

- [ ] **Step 2: GET retorna os dois preços**

Substituir o handler `GET /:slug` (da linha `router.get('/:slug', ...)` até o `});` que o fecha) por:
```js
router.get('/:slug', async (req, res) => {
  try {
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });
    const acc = await sellerAccounts.findByTenant(product.tenant_id);
    const passFee = !!(acc && acc.pass_card_fee_to_buyer);
    const cardCents = passFee ? cardChargeCents(product.price_cents) : product.price_cents;
    res.json({
      success: true,
      product: {
        slug: product.slug,
        title: product.checkout_title || product.name,
        description: product.checkout_description,
        price_cents: product.price_cents,
        pix_cents: product.price_cents,
        card_cents: cardCents,
        pass_card_fee: passFee,
        accept_pix: product.accept_pix,
        accept_card: product.accept_card
      }
    });
  } catch (err) {
    logger.error('checkout/get: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});
```

- [ ] **Step 3: POST cobra o gross-up no cartão quando ligado**

No handler `POST /:slug`, localizar:
```js
    const amountCents = product.price_cents;
    const feeCents = isFreePlan ? vaultlyFeeCents(amountCents) : 0;
```
e trocar por:
```js
    // Cartao com repasse ligado: cobra o valor com a taxa embutida (gross-up).
    // Pix sempre cobra o valor real. O split ja entrega ao vendedor (cobrado - taxaAsaas) = preco cheio.
    const amountCents = (pm === 'card' && acc.pass_card_fee_to_buyer)
      ? cardChargeCents(product.price_cents)
      : product.price_cents;
    const feeCents = isFreePlan ? vaultlyFeeCents(amountCents) : 0;
```
(O `acc` já foi buscado logo acima neste handler — linha `const acc = await sellerAccounts.findByTenant(product.tenant_id);`. Nada mais muda: `amountCents` flui para `orders.create` e `asaas.createCharge` como hoje.)

- [ ] **Step 4: Verificar sintaxe**

Run: `node -c src/routes/checkout.js`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/routes/checkout.js
git commit -m "feat: checkout retorna pix/card price e cobra gross-up no cartao quando repasse ligado"
```

---

## Task 5: Painel — aba "Loja" + toggle de repasse

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Ler as âncoras**

READ em `public/index.html`:
- A barra de navegação lateral (os itens de aba — busque `onclick="switchTab(` ou `data-tab=`), pra ver o padrão de um item de menu e como as abas-conteúdo (`<div>` por aba) são estruturadas/exibidas.
- A função `switchTab(...)` (e/ou `switchTabById`).
- O card de Venda Direta na aba **Config**: busque `id="cfg-venda-direta-card"` e `id="cfg-venda-direta-body"`.
- As funções `loadVendaDiretaSection`, `renderSellerActive`, `saveSellerMethods`.

- [ ] **Step 2: Criar a aba "Loja" (nav + conteúdo) e mover o card de Venda Direta**

1. Adicionar um item de menu **"Loja"** na navegação, seguindo o padrão dos outros itens (ex.: `<button ... onclick="switchTab('loja', this)">...<i class="ti ti-building-store"></i> Loja</button>` — use o padrão real do arquivo). Posicione-o de forma visível (ex.: perto de "Produtos"/"Config").
2. Criar a aba-conteúdo correspondente. MOVER o card de Venda Direta (`id="cfg-venda-direta-card"` e seu `cfg-venda-direta-body`) da aba Config para dentro da nova aba "Loja". Mantenha os mesmos IDs (as funções `loadVendaDiretaSection` usam `cfg-venda-direta-body`).
3. Em `switchTab` (ou onde as abas são ativadas), quando a aba `loja` for aberta, chamar `loadVendaDiretaSection()`. Se hoje a Config chama `loadConfig()` (que chama `loadVendaDiretaSection()`), remova a chamada de Venda Direta de `loadConfig` e passe-a para o handler da aba "Loja".
4. Mostrar o item de menu "Loja" apenas para planos pagos: ao montar o app (onde o menu é renderizado / em `showApp()`), se `currentUser.plan_id === 'free'`, ocultar o botão "Loja" (ex.: `style.display='none'`).

- [ ] **Step 3: Adicionar o toggle de repasse no estado "conta ativa"**

Em `renderSellerActive(body, account)`, após os toggles de métodos (Pix/cartão), adicionar um terceiro toggle:
```js
    '<div class="toggle-row">' +
      '<div class="toggle-info"><div class="t-title">Repassar a taxa do cartão ao comprador</div><div class="t-desc">No cartão, o comprador paga o valor com a taxa embutida — você recebe o preço cheio. No Pix nada muda.</div></div>' +
      '<button class="toggle' + (account.pass_card_fee_to_buyer ? ' on' : '') + '" id="seller-toggle-passfee" onclick="this.classList.toggle(\'on\');saveSellerMethods()"></button>' +
    '</div>' +
```
(Insira essa string concatenada no ponto certo do innerHTML de `renderSellerActive`, junto dos outros `toggle-row`. Mantenha a sintaxe de concatenação.)

- [ ] **Step 4: saveSellerMethods envia o pass_card_fee_to_buyer**

Em `saveSellerMethods()`, que hoje lê os toggles de Pix/cartão e faz `PUT /api/seller/methods`, incluir o novo toggle. Onde ele monta o body, adicionar a leitura:
```js
  var passBtn = document.getElementById('seller-toggle-passfee');
  var passFee = passBtn ? passBtn.classList.contains('on') : false;
```
e incluir `pass_card_fee_to_buyer: passFee` no objeto enviado no `body: JSON.stringify({ ... })`.

- [ ] **Step 5: Verificar o script e commitar**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: aba Loja consolidando Venda Direta + toggle de repasse da taxa do cartao"
```

---

## Task 6: Página de checkout — dois preços + nota do cartão

**Files:**
- Modify: `public/checkout.html`

- [ ] **Step 1: Ler a página**

READ `public/checkout.html`: a função JS que faz `fetch('/api/checkout/' + slug)` e preenche o preço (`#price`), e a troca de método (`setMethod`). Hoje há um único `#price` mostrando `price_cents`.

- [ ] **Step 2: Mostrar o preço conforme o método selecionado**

Ajustar o JS para guardar `pix_cents` e `card_cents` da resposta e atualizar o preço exibido conforme o método. Concretamente:
1. Na função `load()` (após `const d = await r.json()`), guardar em variáveis de escopo do script:
```js
  window._pixCents = d.product.pix_cents;
  window._cardCents = d.product.card_cents;
  window._passFee = d.product.pass_card_fee;
```
e exibir o preço do método inicial (Pix por padrão) usando `_pixCents`.
2. Em `setMethod(m)` (chamada ao trocar Pix/Cartão), atualizar o `#price` para o valor do método:
```js
  var cents = (m === 'card') ? window._cardCents : window._pixCents;
  document.getElementById('price').textContent = 'R$ ' + (cents/100).toFixed(2).replace('.', ',');
```
3. Quando `window._passFee` for true E o método for cartão, exibir uma nota curta (ex.: criar/atualizar um elemento de aviso): "No cartão, a taxa de processamento é adicionada." Quando Pix, esconder a nota. (Adicione um `<div id="fee-note" style="font-size:11px;color:var(--muted);margin-top:6px;display:none;"></div>` abaixo do preço e controle seu texto/visibilidade em `setMethod`.)

Mantenha o resto do fluxo de pagamento intacto (o POST continua enviando só `method`; o backend decide o valor cobrado).

- [ ] **Step 3: Verificar o script e commitar**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/checkout.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/checkout.html
git commit -m "feat: checkout exibe preco do Pix e do cartao (com taxa quando repasse ligado)"
```

---

## Task 7: Verificação final

- [ ] **Step 1: Testes**

Run: `npm test`
Expected: PASS (todos, incluindo os de `cardChargeCents`).

- [ ] **Step 2: Sintaxe**

Run (backend):
```bash
node -c src/services/pricing.js && node -c src/routes/checkout.js && node -c src/routes/seller.js && node -c src/models/database.js && echo BACKEND_OK
```
Expected: `BACKEND_OK`.

Run (cada HTML — rode o bloco duas vezes, trocando o nome do arquivo):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "index OK" && rm -f _sc.js
node -e "const fs=require('fs');const h=fs.readFileSync('public/checkout.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "checkout OK" && rm -f _sc.js
```
Expected: `index OK` e `checkout OK`.

- [ ] **Step 3: Require-graph**

Run: `node -e "require('./src/routes/checkout'); const p=require('./src/services/pricing'); console.log('ok', typeof p.cardChargeCents);"`
Expected: `ok function`.

- [ ] **Step 4:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- Gross-up (Seção 2 do spec) → Task 1 (`cardChargeCents`). ✅
- Split inalterado → confirmado (Task 4 só muda o `amountCents` cobrado; `createCharge`/`buildSplit` intactos). ✅
- `pass_card_fee_to_buyer` em seller_accounts → Task 2. ✅
- GET dois preços + POST gross-up → Task 4. ✅
- Endpoint salvando o toggle (estender `/methods`) → Task 3. ✅
- Aba "Loja" consolidando Venda Direta + toggle, fora da Config, só pagos → Task 5. ✅
- Página de checkout com dois preços + nota → Task 6. ✅

**Placeholder scan:** as instruções "use o padrão real do arquivo / leia as âncoras" nas Tasks 5/6 são integração com HTML existente (alvo da implementação), não placeholders de lógica — o código novo (toggle, gross-up, leitura de preços) está completo.

**Type consistency:** `cardChargeCents` (Task 1) usado em checkout (Task 4); `pass_card_fee_to_buyer` consistente entre DB (Task 2), seller.js (Task 3), checkout GET/POST (Task 4) e o toggle do painel (Task 5); resposta do GET (`pix_cents`/`card_cents`/`pass_card_fee`) consumida pela página (Task 6). ✅

**Gap conhecido (aceito):** o gross-up usa a taxa de cartão **à vista** configurada; parcelamento com juros não é repassado (fora de escopo). O líquido do vendedor pode ficar 1 centavo acima de P (arredondamento p/ cima, a favor do vendedor).
