# Feature B — Antecipação do cartão + parcelamento (até 3x) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Somar o custo de antecipação do cartão (1,15% à vista / 1,6%/mês parcelado) na taxa publicada e no gross-up, e oferecer parcelamento até 3x no checkout, com antecipação automática na subconta Asaas.

**Architecture:** Toda a matemática nova é pura em `src/services/pricing.js` (TDD). `asaasService` monta cobrança parcelada (`installmentCount`/`totalValue`) e habilita a antecipação automática na subconta (best-effort). `checkout.js` expõe as opções de parcela e valida a escolha; `checkout.html` mostra o seletor. A antecipação **só vale para cartão**; Pix não muda.

**Tech Stack:** Node.js 20, Express, PostgreSQL, `node:test`, Asaas API v3, frontends estáticos `public/*.html`.

---

## File Structure
- `src/services/pricing.js` — `anticipPercent`, `anticipationFeeCents`, `installmentOptions`; `asaasFeeCents`/`buildSplit`/`cardChargeCents` passam a considerar `installments` (+ testes).
- `src/services/asaasService.js` — `buildChargePayload` com parcelamento; `enableAutoAnticipation(apiKey)` (+ teste do payload parcelado).
- `src/routes/checkout.js` — GET devolve `installments`; POST aceita/valida `installments`.
- `src/routes/seller.js` — onboarding chama `enableAutoAnticipation` (best-effort) + endpoint de re-trigger.
- `public/checkout.html` — seletor de parcelas no cartão.
- `public/index.html` — `sellerFeesNote()` reflete antecipação; botão "ativar recebimento rápido" na aba Loja.
- `.env.example` — `ANTICIP_AVISTA_PERCENT`, `ANTICIP_PARCELADO_PERCENT`, `MAX_INSTALLMENTS`, `MIN_PARCELA_CENTS`.

Verificação de `*.html`: extrair scripts inline + `node --check`.

---

## Task 1: pricing.js — antecipação + parcelas (TDD)

**Files:**
- Modify: `src/services/pricing.js`
- Test: `test/pricing.test.js`

- [ ] **Step 1: Escrever os testes novos + ajustar os existentes**

Em `test/pricing.test.js`, trocar o require do topo para incluir as funções novas:
```js
const { vaultlyFeeCents, buildSplit, cardChargeCents, anticipationFeeCents, installmentOptions } = require('../src/services/pricing');
```

**Ajustar** o teste existente do split de cartão (a antecipação à vista de 1,15% agora também é descontada). Trocar:
```js
test('buildSplit desconta taxa Asaas (cartao) e taxa Vaultly do liquido do vendedor', () => {
  // amount 10000c, vaultlyFee 159c, asaasCard 1,99%+R$0,49 = 248c -> vendedor 10000-159-248 = 9593 = R$95,93
  const split = buildSplit({ amountCents: 10000, sellerWalletId: 'w_seller', method: 'card' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 95.93 }
  ]);
});
```
por:
```js
test('buildSplit (cartao a vista) desconta Asaas + antecipacao 1,15% + taxa Vaultly', () => {
  // amount 10000c: vaultly 159, asaas 1,99%+49 = 248, antecip a vista 1,15% = 115
  // vendedor 10000-159-248-115 = 9478 = R$94,78
  const split = buildSplit({ amountCents: 10000, sellerWalletId: 'w_seller', method: 'card' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 94.78 }
  ]);
});
```

**Ajustar** os dois testes do `cardChargeCents` (à vista passa a embutir 1,15%). Trocar:
```js
test('cardChargeCents: gross-up cobre a taxa do cartao (arredonda p/ cima)', () => {
  // P=2700, taxa 1,99% + R$0,49 -> ceil((2700+49)/0.9801) = ceil(2804.81) = 2805
  assert.strictEqual(cardChargeCents(2700), 2805);
});

test('cardChargeCents: apos a taxa, o vendedor recebe ~o preco cheio', () => {
  const charged = cardChargeCents(2700);              // 2805
  const asaasFee = Math.round(charged * 0.0199) + 49;  // 56 + 49 = 105
  assert.ok(charged - asaasFee >= 2700);
  assert.ok(charged - asaasFee <= 2702);
});
```
por:
```js
test('cardChargeCents a vista: gross-up cobre cartao 1,99%+R$0,49 + antecipacao 1,15%', () => {
  // P=2700, pctTotal=(1,99+1,15)/100=0,0314 -> ceil((2700+49)/0,9686)=ceil(2838,32)=2839
  assert.strictEqual(cardChargeCents(2700, 1), 2839);
});

test('cardChargeCents a vista: apos taxa do cartao + antecipacao o vendedor recebe ~o preco cheio', () => {
  const charged = cardChargeCents(2700, 1);                       // 2839
  const asaasFee = Math.round(charged * 0.0199) + 49;             // 57 + 49 = 106
  const anticip  = Math.round(charged * 0.0115);                  // 33
  assert.ok(charged - asaasFee - anticip >= 2700);
  assert.ok(charged - asaasFee - anticip <= 2702);
});
```

**Adicionar** os testes novos (antecipação por parcela + parcelas e opções):
```js
test('anticipationFeeCents: 1x=1,15%, 2x=2,40%, 3x=3,20% sobre R$100,00', () => {
  assert.strictEqual(anticipationFeeCents(10000, 1), 115); // 1,15%
  assert.strictEqual(anticipationFeeCents(10000, 2), 240); // 1,6% * 1,5 = 2,40%
  assert.strictEqual(anticipationFeeCents(10000, 3), 320); // 1,6% * 2,0 = 3,20%
});

test('anticipationFeeCents: sem parcelas informadas trata como a vista (1x)', () => {
  assert.strictEqual(anticipationFeeCents(10000), 115);
});

test('cardChargeCents 3x embute 1,99%+R$0,49 + antecipacao 3,20%', () => {
  // P=10000, pctTotal=(1,99+3,20)/100=0,0519 -> ceil((10000+49)/0,9481)=ceil(10599,1)=10600
  assert.strictEqual(cardChargeCents(10000, 3), 10600);
});

test('installmentOptions sem repasse: preco fixo, respeita minimo por parcela', () => {
  // R$10,00, min R$5,00: 1x(1000), 2x(500) ok; 3x(334) < 500 -> nao oferece
  const opts = installmentOptions({ priceCents: 1000, passFee: false, maxInstallments: 3, minParcelaCents: 500 });
  assert.deepStrictEqual(opts, [
    { n: 1, total_cents: 1000, parcela_cents: 1000 },
    { n: 2, total_cents: 1000, parcela_cents: 500 }
  ]);
});

test('installmentOptions com repasse: total cresce com as parcelas (gross-up por N)', () => {
  // R$50,00 com repasse: total 1x < total 2x < total 3x
  const opts = installmentOptions({ priceCents: 5000, passFee: true, maxInstallments: 3, minParcelaCents: 500 });
  assert.strictEqual(opts.length, 3);
  assert.ok(opts[0].total_cents < opts[1].total_cents);
  assert.ok(opts[1].total_cents < opts[2].total_cents);
  assert.strictEqual(opts[0].total_cents, cardChargeCents(5000, 1));
  assert.strictEqual(opts[2].total_cents, cardChargeCents(5000, 3));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `anticipationFeeCents is not a function` / `installmentOptions is not a function`.

- [ ] **Step 3: Implementar em `src/services/pricing.js`**

(a) Adicionar, após `feeConfig`, as funções de antecipação:
```js
// Config das taxas de antecipacao do cartao (mensais). Configuravel por env.
function anticipConfig(overrides) {
  const o = overrides || {};
  const avista = o.anticipAvistaPercent != null
    ? o.anticipAvistaPercent
    : parseFloat(process.env.ANTICIP_AVISTA_PERCENT || '1.15');
  const parcelado = o.anticipParceladoPercent != null
    ? o.anticipParceladoPercent
    : parseFloat(process.env.ANTICIP_PARCELADO_PERCENT || '1.6');
  return { avista, parcelado };
}

// Percentual de antecipacao (numero, ex.: 1.15) para N parcelas.
// A vista (N<=1) = taxa a vista; parcelado = taxa mensal * (N+1)/2 (media de meses adiantados).
function anticipPercent(installments, overrides) {
  const n = Math.max(1, parseInt(installments || 1, 10));
  const { avista, parcelado } = anticipConfig(overrides);
  if (n <= 1) return avista;
  return parcelado * (n + 1) / 2;
}

// Custo da antecipacao do cartao, em centavos, para amountCents em N parcelas.
function anticipationFeeCents(amountCents, installments, overrides) {
  return Math.round(amountCents * (anticipPercent(installments, overrides) / 100));
}
```

(b) Em `asaasFeeCents`, somar a antecipação no ramo do cartão. Trocar o bloco `if (method === 'card') { ... }` por:
```js
  if (method === 'card') {
    const pct   = o.cardPercent    != null ? o.cardPercent    : parseFloat(process.env.ASAAS_CARD_PERCENT || '1.99');
    const fixed = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
    const base  = Math.round(amountCents * (pct / 100)) + fixed;
    return base + anticipationFeeCents(amountCents, o.installments, o);
  }
```

(c) Em `buildSplit`, aceitar `installments` e repassar para `asaasFeeCents`. Trocar a assinatura/corpo:
```js
function buildSplit({ amountCents, sellerWalletId, method, chargeVaultlyFee, installments, overrides }) {
  const feeCents     = (chargeVaultlyFee === false) ? 0 : vaultlyFeeCents(amountCents, overrides);
  const gatewayCents = asaasFeeCents(method, amountCents, Object.assign({ installments: installments }, overrides || {}));
  const sellerCents  = Math.max(0, amountCents - feeCents - gatewayCents);
  return [{ walletId: sellerWalletId, fixedValue: centsToReais(sellerCents) }];
}
```

(d) Trocar `cardChargeCents` para receber `installments` e embutir a antecipação no denominador:
```js
// Gross-up do cartao: valor a cobrar para que, apos cartao (pct + fixo) E antecipacao(N),
// o vendedor receba o preco cheio. Arredonda p/ cima (vendedor nunca recebe a menos).
function cardChargeCents(priceCents, installments, overrides) {
  const o = overrides || {};
  const cardPct = (o.cardPercent != null ? o.cardPercent : parseFloat(process.env.ASAAS_CARD_PERCENT || '1.99'));
  const fixed   = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
  const pctTotal = (cardPct + anticipPercent(installments, o)) / 100;
  if (!(pctTotal < 1)) return priceCents;
  return Math.ceil((priceCents + fixed) / (1 - pctTotal));
}
```

(e) Adicionar `installmentOptions` (puro), antes do `module.exports`:
```js
// Monta as opcoes de parcela para o checkout. Sempre inclui 1x. Para N>1, para de
// oferecer quando o valor da parcela cai abaixo do minimo (parcelas maiores so diminuem).
// Com repasse ligado, o total cresce com N (gross-up por parcela); sem repasse, total = preco.
function installmentOptions({ priceCents, passFee, maxInstallments, minParcelaCents, overrides }) {
  const max = Math.max(1, parseInt(maxInstallments != null ? maxInstallments : (process.env.MAX_INSTALLMENTS || '3'), 10));
  const minParcela = parseInt(minParcelaCents != null ? minParcelaCents : (process.env.MIN_PARCELA_CENTS || '500'), 10);
  const out = [];
  for (let n = 1; n <= max; n++) {
    const total = passFee ? cardChargeCents(priceCents, n, overrides) : priceCents;
    const parcela = Math.ceil(total / n);
    if (n > 1 && parcela < minParcela) break;
    out.push({ n: n, total_cents: total, parcela_cents: parcela });
  }
  return out;
}
```

(f) Exportar as novas funções. Trocar o `module.exports`:
```js
module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit, cardChargeCents, anticipationFeeCents, anticipPercent, installmentOptions };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos, incluindo os ajustados e os novos).

- [ ] **Step 5: Commit**

```bash
git add src/services/pricing.js test/pricing.test.js
git commit -m "feat: pricing — antecipacao do cartao (1x/2x/3x) + installmentOptions (TDD)"
```

---

## Task 2: asaasService — cobrança parcelada + antecipação automática

**Files:**
- Modify: `src/services/asaasService.js`
- Test: `test/asaasService.test.js`

- [ ] **Step 1: Teste do payload parcelado**

Em `test/asaasService.test.js`, adicionar:
```js
test('buildChargePayload cartao 3x usa installmentCount + totalValue (sem value)', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'card', amountCents: 10600,
    description: 'Curso', sellerWalletId: 'w_s', dueDate: '2026-06-01', installments: 3
  });
  assert.strictEqual(p.billingType, 'CREDIT_CARD');
  assert.strictEqual(p.installmentCount, 3);
  assert.strictEqual(p.totalValue, 106);
  assert.strictEqual(p.value, undefined);
});

test('buildChargePayload cartao 1x mantem value unico', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'card', amountCents: 2839,
    description: 'Curso', sellerWalletId: 'w_s', dueDate: '2026-06-01', installments: 1
  });
  assert.strictEqual(p.value, 28.39);
  assert.strictEqual(p.installmentCount, undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `p.installmentCount` é `undefined` (esperado 3).

- [ ] **Step 3: Implementar**

(a) Trocar `buildChargePayload` por:
```js
function buildChargePayload(d) {
  const value = Math.round(d.amountCents) / 100;
  const n = Math.max(1, parseInt(d.installments || 1, 10));
  const payload = {
    customer: d.customerId,
    billingType: d.method === 'card' ? 'CREDIT_CARD' : 'PIX',
    dueDate: d.dueDate,
    description: d.description || 'Compra Vaultly',
    externalReference: d.orderId || undefined,
    split: buildSplit({ amountCents: d.amountCents, sellerWalletId: d.sellerWalletId, method: d.method, chargeVaultlyFee: d.chargeVaultlyFee, installments: n })
  };
  if (d.method === 'card' && n >= 2) {
    payload.installmentCount = n;
    payload.totalValue = value;
  } else {
    payload.value = value;
  }
  return payload;
}
```

(b) Adicionar `enableAutoAnticipation` (best-effort; roda na subconta com a apiKey dela). Colocar perto das outras chamadas HTTP, antes do `module.exports`:
```js
// Habilita a antecipacao automatica do cartao na subconta (recebimento rapido).
// Best-effort: contas novas podem exigir aprovacao do Asaas; nunca deve quebrar o fluxo.
// GATE (sandbox): confirmar o endpoint/flag exato da antecipacao automatica.
async function enableAutoAnticipation(apiKey) {
  return request('POST', '/anticipations/config', { automaticAnticipationEnabled: true }, apiKey);
}
```

(c) Incluir `enableAutoAnticipation` no `module.exports`.

> **Gate de validação (sandbox):** confirmar contra https://docs.asaas.com (1) o endpoint/campo real da antecipação automática — ajustar `'/anticipations/config'` e o corpo se divergir; (2) o payload de cobrança parcelada (`installmentCount` + `totalValue`) e o retorno. O `buildChargePayload` é puro e testado; só os shapes do Asaas podem precisar de ajuste fino.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/asaasService.js test/asaasService.test.js
git commit -m "feat: asaasService — cobranca parcelada (installmentCount/totalValue) + enableAutoAnticipation"
```

---

## Task 3: checkout.js — opções de parcela (GET) + validação (POST)

**Files:**
- Modify: `src/routes/checkout.js`

- [ ] **Step 1: GET devolve `installments`**

No topo, trocar o require de pricing:
```js
const { vaultlyFeeCents, cardChargeCents, installmentOptions } = require('../services/pricing');
```
No handler `GET /:slug`, logo após calcular `cardCents`, montar a lista de parcelas e incluí-la na resposta. Trocar:
```js
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
```
por:
```js
    const cardCents = passFee ? cardChargeCents(product.price_cents, 1) : product.price_cents;
    const installments = installmentOptions({ priceCents: product.price_cents, passFee: passFee }).map(function (o) {
      return {
        n: o.n,
        total_cents: o.total_cents,
        parcela_cents: o.parcela_cents,
        label: o.n === 1
          ? '1x de R$ ' + (o.parcela_cents / 100).toFixed(2).replace('.', ',') + ' (a vista)'
          : o.n + 'x de R$ ' + (o.parcela_cents / 100).toFixed(2).replace('.', ',')
      };
    });
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
        installments: installments,
        accept_pix: product.accept_pix,
        accept_card: product.accept_card
      }
    });
```

- [ ] **Step 2: POST aceita e valida `installments`**

No `POST /:slug`, na desestruturação do body, incluir `installments`:
```js
    const { buyer_name, buyer_email, buyer_doc, method, card, installments } = req.body;
```
Após definir `pm` e validar aceite de método (logo após as duas checagens de `accept_pix`/`accept_card`), adicionar a normalização/validação de parcelas:
```js
    const MAX_INSTALL = parseInt(process.env.MAX_INSTALLMENTS || '3', 10);
    let nInstall = parseInt(installments || 1, 10);
    if (!Number.isInteger(nInstall) || nInstall < 1) nInstall = 1;
    if (pm === 'pix') nInstall = 1;                 // Pix nao parcela
    if (nInstall > MAX_INSTALL) return res.status(400).json({ success: false, error: 'Numero de parcelas acima do maximo permitido.' });
```
Trocar o cálculo de `amountCents` para considerar as parcelas:
```js
    const amountCents = (pm === 'card' && acc.pass_card_fee_to_buyer && !isFreePlan)
      ? cardChargeCents(product.price_cents, nInstall)
      : product.price_cents;
```
Validar o mínimo por parcela (depois de calcular `amountCents`):
```js
    const MIN_PARCELA = parseInt(process.env.MIN_PARCELA_CENTS || '500', 10);
    if (pm === 'card' && nInstall > 1 && Math.ceil(amountCents / nInstall) < MIN_PARCELA) {
      return res.status(400).json({ success: false, error: 'Valor de parcela abaixo do minimo.' });
    }
```
Passar `installments` para `createCharge`. Trocar a chamada:
```js
    const charge = await asaas.createCharge({
      customerId, method: pm, amountCents,
      description: product.checkout_title || product.name,
      sellerWalletId: acc.asaas_wallet_id,
      chargeVaultlyFee: isFreePlan,
      installments: nInstall,
      dueDate, orderId,
      card: pm === 'card' ? card : undefined,
      remoteIp: req.headers['x-forwarded-for'] || req.ip
    });
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/checkout.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/checkout.js
git commit -m "feat: checkout expoe opcoes de parcela (GET) e cobra parcelado validando minimo (POST)"
```

---

## Task 4: checkout.html — seletor de parcelas

**Files:**
- Modify: `public/checkout.html`

- [ ] **Step 1: Adicionar o seletor no HTML do cartão**

Em `public/checkout.html`, dentro de `<div id="card-fields" class="hidden">`, ANTES do `<label>Número do cartão</label>`, inserir:
```html
        <label>Parcelas</label><select id="cc_installments"></select>
```

- [ ] **Step 2: Popular o seletor no `load()` e atualizar o total ao trocar parcela**

No `load()`, após `window._passFee = d.product.pass_card_fee;`, guardar as parcelas:
```js
  window._installments = d.product.installments || [{ n:1, total_cents: d.product.card_cents, parcela_cents: d.product.card_cents, label:'1x' }];
```

No `setMethod(m)`, ao entrar no cartão, preencher o `<select>` e usar o total da parcela selecionada. Trocar o corpo atual de `setMethod` por:
```js
function setMethod(m){
  method = m;
  document.querySelectorAll('#methods button').forEach(b=>b.classList.toggle('active', b.dataset.m===m));
  $('card-fields').classList.toggle('hidden', m!=='card');
  if (m === 'card') {
    var sel = $('cc_installments');
    if (sel && !sel.dataset.filled) {
      sel.innerHTML = (window._installments || []).map(function(o){ return '<option value="'+o.n+'">'+o.label+'</option>'; }).join('');
      sel.dataset.filled = '1';
      sel.onchange = updateCardTotal;
    }
    updateCardTotal();
  } else {
    if (window._pixCents != null) $('price').textContent = 'R$ ' + (window._pixCents/100).toFixed(2).replace('.', ',');
    var note0 = $('fee-note'); if (note0) note0.style.display = 'none';
  }
}

function selectedInstallments(){
  var sel = $('cc_installments');
  var n = sel ? parseInt(sel.value || '1', 10) : 1;
  return (window._installments || []).find(function(o){ return o.n === n; }) || { n:1, total_cents: window._cardCents };
}

function updateCardTotal(){
  var opt = selectedInstallments();
  if (opt && opt.total_cents != null) {
    $('price').textContent = 'R$ ' + (opt.total_cents/100).toFixed(2).replace('.', ',');
  }
  var note = $('fee-note');
  if (note) {
    if (window._passFee) { note.textContent = 'No cartao, a taxa de processamento e a antecipacao estao incluidas no valor.'; note.style.display = 'block'; }
    else { note.style.display = 'none'; }
  }
}
```

- [ ] **Step 3: Enviar `installments` no POST**

No handler do botão `$('pay')`, no objeto `body`, e somente no ramo `if(method==='card')`, incluir as parcelas. Logo após `if(method==='card'){`, adicionar:
```js
    body.installments = selectedInstallments().n;
```

- [ ] **Step 4: Verificar o script e commitar**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/checkout.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/checkout.html
git commit -m "feat: checkout.html — seletor de parcelas (1x-3x) no cartao com total dinamico"
```

---

## Task 5: index.html — texto de taxas com antecipação + botão recebimento rápido

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Atualizar `sellerFeesNote()`**

Em `public/index.html`, na função `sellerFeesNote()`, trocar o bloco do cartão. Localizar:
```js
      '<div style="flex:1;min-width:170px;"><strong style="color:var(--orange);"><i class="ti ti-credit-card"></i> Cartao</strong><br>Taxa do cartao (~1,99% + R$0,49), recebimento em alguns dias e possibilidade de estorno/chargeback.</div>' +
```
e trocar por:
```js
      '<div style="flex:1;min-width:170px;"><strong style="color:var(--orange);"><i class="ti ti-credit-card"></i> Cartao</strong><br>A vista: 1,99% + R$0,49 + 1,15% (antecipacao). Parcelado: + antecipacao por parcela (2x +2,40%, 3x +3,20%). Com antecipacao automatica voce recebe em ~1-2 dias. Sujeito a estorno/chargeback.</div>' +
```

- [ ] **Step 2: Botão "ativar recebimento rapido" em `renderSellerActive`**

Em `renderSellerActive(body, account)`, logo antes de `sellerFeesNote();` (o fechamento do innerHTML), inserir uma linha de toggle/ação:
```js
    '<div class="toggle-row">' +
      '<div class="toggle-info"><div class="t-title">Recebimento rapido (antecipacao automatica)</div><div class="t-desc">Recebe o cartao em ~1-2 dias em vez de ~30. A taxa de antecipacao ja esta refletida nas taxas acima.</div></div>' +
      '<button class="btn btn-ghost btn-sm" onclick="enableFastPayout(this)"><i class="ti ti-bolt"></i> Ativar</button>' +
    '</div>' +
```

- [ ] **Step 3: Função `enableFastPayout`**

Perto de `saveSellerMethods()`, adicionar:
```js
async function enableFastPayout(btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;display:inline-block;"></i> Ativando...'; }
  try {
    var res = await apiFetch('/api/seller/enable-anticipation', { method: 'POST' });
    if (!res.success) throw new Error(res.error || 'Erro');
    showToast('Recebimento rapido ativado (ou ja estava ativo).', 'success');
    if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Ativado'; }
  } catch (e) {
    showToast(e.message || 'Nao foi possivel ativar agora. Tente mais tarde.', 'warn');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-bolt"></i> Ativar'; }
  }
}
```

- [ ] **Step 4: Verificar o script e commitar**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

```bash
git add public/index.html
git commit -m "feat: painel — taxas do cartao com antecipacao + botao recebimento rapido"
```

---

## Task 6: seller.js — habilitar antecipação no onboarding + endpoint de re-trigger

**Files:**
- Modify: `src/routes/seller.js`

- [ ] **Step 1: Best-effort no onboarding**

Em `src/routes/seller.js`, no `POST /onboarding`, logo após o `sellerAccounts.upsert(...)` que grava a subconta recém-criada (o que tem `asaas_api_key_enc`), e antes do `res.status(201)`, adicionar (best-effort, nunca quebra o onboarding):
```js
    if (created.apiKey) {
      try { await asaas.enableAutoAnticipation(created.apiKey); }
      catch (e) { logger.warn('Antecipacao automatica nao habilitada agora (tenant ' + req.tenantId.slice(0, 8) + '): ' + e.message); }
    }
```

- [ ] **Step 2: Endpoint de re-trigger**

Adicionar, antes do `module.exports`, um endpoint que reativa a antecipação usando a apiKey guardada (descriptografada):
```js
// POST /api/seller/enable-anticipation — (re)habilita a antecipacao automatica da subconta
router.post('/enable-anticipation', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    if (!acc || !acc.asaas_api_key_enc) {
      return res.status(409).json({ success: false, error: 'Conta de recebimento sem chave para antecipacao. Reative a conta.' });
    }
    const apiKey = decrypt(acc.asaas_api_key_enc);
    await asaas.enableAutoAnticipation(apiKey);
    res.json({ success: true });
  } catch (err) {
    logger.error('seller/enable-anticipation: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel ativar a antecipacao. ' + err.message });
  }
});
```
No topo do arquivo, garantir o import do `decrypt` (a Feature A já importou `encrypt`; trocar para incluir `decrypt`):
```js
const { encrypt, decrypt } = require('../services/crypto');
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/seller.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seller.js
git commit -m "feat: habilita antecipacao automatica no onboarding + endpoint de re-trigger"
```

---

## Task 7: Env + verificação final

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Documentar envs**

Em `.env.example`, no bloco do Asaas (após `ASAAS_CARD_FEE_CENTS=49`), adicionar:
```
# Antecipacao do cartao + parcelamento (Feature B)
ANTICIP_AVISTA_PERCENT=1.15     # % de antecipacao a vista (ao mes)
ANTICIP_PARCELADO_PERCENT=1.6   # % de antecipacao parcelado (ao mes)
MAX_INSTALLMENTS=3              # teto de parcelas no checkout
MIN_PARCELA_CENTS=500           # valor minimo por parcela (R$5,00)
```

- [ ] **Step 2: Testes**

Run: `npm test`
Expected: PASS (pricing incl. antecipação/installmentOptions, asaasService incl. parcelado, etc.).

- [ ] **Step 3: Sintaxe + scripts**

Run:
```bash
node -c src/services/pricing.js && node -c src/services/asaasService.js && node -c src/routes/checkout.js && node -c src/routes/seller.js && echo BACKEND_OK
node -e "const fs=require('fs');for(const f of ['public/index.html','public/checkout.html']){const h=fs.readFileSync(f,'utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);require('child_process').execSync('node --check _sc.js');}console.log('html OK');" && rm -f _sc.js
```
Expected: `BACKEND_OK` e `html OK`.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: env da Feature B (antecipacao + parcelamento)"
```

- [ ] **Step 5:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2 matemática (anticipationFeeCents, integração asaasFee/buildSplit/cardChargeCents) → Task 1. ✅
- §3 checkout (GET installments, POST validação, min por parcela, max 3) → Task 1 (`installmentOptions`) + Task 3 + Task 4. ✅
- §4 Asaas (cobrança parcelada `installmentCount`/`totalValue`, antecipação automática) → Task 2 + Task 6. ✅
- §5 taxa exibida ao vendedor → Task 5. ✅
- §6 envs → Task 7. ✅
- §7 gating por plano (gross-up só pago + repasse; Free inalterado) → Task 3 (mantém `!isFreePlan`). ✅

**Placeholder scan:** os "gates de validação (sandbox)" da Task 2 são pontos de confirmação dos shapes do Asaas (endpoint de antecipação e cobrança parcelada), não placeholders de lógica — o código está completo e roda; só os shapes podem precisar de ajuste.

**Type consistency:** `cardChargeCents(priceCents, installments, overrides)` usado com `installments` em Task 1/3/`installmentOptions`; `installmentOptions({priceCents, passFee, ...})` retorna `{n,total_cents,parcela_cents}`, consumido em Task 3 (label) e Task 4 (select); `buildSplit({..., installments})` recebido em Task 2 (`buildChargePayload`); `enableAutoAnticipation(apiKey)` definido em Task 2, usado em Task 6; `installments` propagado checkout→createCharge→buildChargePayload→buildSplit. ✅

**Gaps conhecidos (aceitos):**
- O endpoint exato da antecipação automática do Asaas é confirmado no sandbox (Task 2 gate); o código é best-effort e não quebra o checkout.
- Cartão à vista agora embute 1,15% (antecipação) — os testes existentes do `pricing.js` foram ajustados para refletir isso (Task 1).
