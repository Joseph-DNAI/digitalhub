# Feature C — Simulador de taxas/recebimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao vendedor um simulador na aba Loja que, a partir de um valor de venda, mostra quanto ele recebe (sem repasse) e quanto o comprador paga / ele recebe (com repasse) em Pix e cartão 1x/2x/3x.

**Architecture:** A matemática vive no `pricing.js` (fonte única, igual ao checkout) numa função pura `feeSimulation`. Um endpoint `GET /api/seller/fee-simulator` expõe o cálculo; o painel renderiza uma tabela de 2 colunas com debounce no input.

**Tech Stack:** Node.js 20, Express, `node:test`, frontend estático `public/index.html`.

---

## File Structure
- `src/services/pricing.js` — `feeSimulation(amountCents, overrides)` (puro) + teste.
- `src/routes/seller.js` — `GET /fee-simulator` (reusa `feeSimulation`).
- `public/index.html` — card simulador na aba Loja (`feeSimulatorCard`, `loadFeeSimulator`, `renderFeeSimulator`, `onSimInput`).

Verificação do `index.html`: extrair scripts inline + `node --check`.

---

## Task 1: pricing.js — `feeSimulation` (TDD)

**Files:**
- Modify: `src/services/pricing.js`
- Test: `test/pricing.test.js`

- [ ] **Step 1: Escrever os testes**

Em `test/pricing.test.js`, trocar o require do topo para incluir `feeSimulation`:
```js
const { vaultlyFeeCents, buildSplit, cardChargeCents, anticipationFeeCents, installmentOptions, feeSimulation } = require('../src/services/pricing');
```
E acrescentar no fim do arquivo:
```js
test('feeSimulation: Pix recebe o valor cheio e ha MAX_INSTALLMENTS itens de cartao', () => {
  const sim = feeSimulation(10000);
  assert.strictEqual(sim.amount_cents, 10000);
  assert.strictEqual(sim.pix.seller_cents, 10000);
  assert.strictEqual(sim.card.length, 3);
  assert.deepStrictEqual(sim.card.map(function (c) { return c.n; }), [1, 2, 3]);
});

test('feeSimulation: sem repasse desconta taxa; com repasse comprador paga mais e vendedor recebe ~cheio', () => {
  const sim = feeSimulation(10000);
  for (const c of sim.card) {
    assert.ok(c.sem_repasse_seller_cents < 10000, 'sem repasse deve descontar taxa');
    assert.ok(c.com_repasse_buyer_cents > 10000, 'com repasse o comprador paga o gross-up');
    assert.ok(c.com_repasse_seller_cents >= 10000, 'com repasse o vendedor recebe ao menos o preco');
    assert.ok(c.com_repasse_seller_cents <= 10002, 'arredondamento de poucos centavos');
  }
});

test('feeSimulation: mais parcelas = mais antecipacao', () => {
  const sim = feeSimulation(10000);
  assert.ok(sim.card[0].sem_repasse_seller_cents > sim.card[1].sem_repasse_seller_cents);
  assert.ok(sim.card[1].sem_repasse_seller_cents > sim.card[2].sem_repasse_seller_cents);
  assert.ok(sim.card[0].com_repasse_buyer_cents < sim.card[2].com_repasse_buyer_cents);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `feeSimulation is not a function`.

- [ ] **Step 3: Implementar em `src/services/pricing.js`**

Antes do `module.exports`, adicionar:
```js
// Simulador de recebimento (puro). Para uma venda de amountCents (plano pago, sem taxa
// Vaultly), retorna o liquido do vendedor no Pix e, para cada parcela do cartao (1..MAX),
// os dois cenarios: sem repasse (vendedor absorve) e com repasse (comprador paga o gross-up).
function feeSimulation(amountCents, overrides) {
  const o = overrides || {};
  const max = Math.max(1, parseInt(o.maxInstallments != null ? o.maxInstallments : (process.env.MAX_INSTALLMENTS || '3'), 10));
  const card = [];
  for (let n = 1; n <= max; n++) {
    const semRepasse = Math.max(0, amountCents - asaasFeeCents('card', amountCents, Object.assign({ installments: n }, o)));
    const buyer = cardChargeCents(amountCents, n, o);
    const split = buildSplit({ amountCents: buyer, sellerWalletId: 'sim', method: 'card', chargeVaultlyFee: false, installments: n, overrides: o });
    const sellerCom = Math.round((split[0] && split[0].fixedValue ? split[0].fixedValue : 0) * 100);
    card.push({
      n: n,
      sem_repasse_seller_cents: semRepasse,
      com_repasse_buyer_cents: buyer,
      com_repasse_seller_cents: sellerCom
    });
  }
  return { amount_cents: amountCents, pix: { seller_cents: amountCents }, card: card };
}
```
E incluir `feeSimulation` no `module.exports` (a linha atual termina com `..., installmentOptions };` → acrescentar `, feeSimulation`):
```js
module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit, cardChargeCents, anticipationFeeCents, anticipPercent, installmentOptions, feeSimulation };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos + os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add src/services/pricing.js test/pricing.test.js
git commit -m "feat: pricing — feeSimulation (simulador de recebimento, TDD)"
```

---

## Task 2: seller.js — endpoint `GET /fee-simulator`

**Files:**
- Modify: `src/routes/seller.js`

- [ ] **Step 1: Importar feeSimulation**

No topo de `src/routes/seller.js`, após `const { encrypt, decrypt } = require('../services/crypto');`, adicionar:
```js
const { feeSimulation } = require('../services/pricing');
```

- [ ] **Step 2: Adicionar o endpoint**

Antes do `module.exports = router;`, adicionar:
```js
// GET /api/seller/fee-simulator?amount_cents=X — simula taxas/recebimento (consulta)
router.get('/fee-simulator', requireAuth, async (req, res) => {
  try {
    const amount = parseInt(req.query.amount_cents, 10);
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    if (!Number.isInteger(amount) || amount < MIN || amount > 100000000) {
      return res.status(400).json({ success: false, error: 'Valor invalido para simulacao.' });
    }
    res.json({ success: true, simulation: feeSimulation(amount) });
  } catch (err) {
    logger.error('seller/fee-simulator: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node -c src/routes/seller.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add src/routes/seller.js
git commit -m "feat: endpoint GET /api/seller/fee-simulator (simulador de recebimento)"
```

---

## Task 3: index.html — card simulador na aba Loja

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Renderizar o card e disparar o load em `renderSellerActive`**

Em `public/index.html`, na função `renderSellerActive`, a última linha do `body.innerHTML` é `sellerFeesNote();` (após o toggle "Recebimento rapido"). Trocar:
```js
    sellerFeesNote();
}
```
por (apenas a ocorrência dentro de `renderSellerActive`, não a de `renderSellerUpgrade`):
```js
    sellerFeesNote() + feeSimulatorCard();
  loadFeeSimulator();
}
```
> Observação: há duas ocorrências de `sellerFeesNote();` no arquivo. A correta é a que está em `renderSellerActive` (logo após o bloco `'<button class="btn btn-ghost btn-sm" onclick="enableFastPayout(this)">...'`). NÃO altere a de `renderSellerUpgrade`. Para garantir unicidade, use como âncora o bloco completo:
> ```js
>      '<button class="btn btn-ghost btn-sm" onclick="enableFastPayout(this)"><i class="ti ti-bolt"></i> Ativar</button>' +
>     '</div>' +
>     sellerFeesNote();
> }
> ```
> trocando só esse `sellerFeesNote();` + `}` pelo novo conteúdo acima.

- [ ] **Step 2: Adicionar as funções do simulador**

Logo após a função `sellerFeesNote()` (que termina com `}` antes de `function escAttr`), adicionar:
```js
// Card do simulador de recebimento (aba Loja)
function feeSimulatorCard() {
  return '<div style="margin-top:16px;padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;">' +
    '<div style="font-weight:700;font-size:13px;margin-bottom:4px;"><i class="ti ti-calculator" style="color:var(--orange);"></i> Simulador de recebimento</div>' +
    '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Veja quanto voce recebe e quanto o comprador paga em cada forma de pagamento.</div>' +
    '<label class="form-label">Valor da venda</label>' +
    '<input type="text" class="form-input" id="sim-amount" value="R$ 100,00" inputmode="numeric" style="max-width:180px;" oninput="onSimInput()" />' +
    '<div id="sim-result" style="margin-top:12px;"></div>' +
  '</div>';
}

var _simTimer = null;
function onSimInput() {
  if (_simTimer) clearTimeout(_simTimer);
  _simTimer = setTimeout(loadFeeSimulator, 400);
}

function simAmountCents() {
  var raw = (document.getElementById('sim-amount') || {}).value || '';
  var digits = String(raw).replace(/\D/g, '');
  return parseInt(digits || '0', 10);
}

function simBRL(cents) { return 'R$ ' + (cents / 100).toFixed(2).replace('.', ','); }

async function loadFeeSimulator() {
  var el = document.getElementById('sim-result');
  if (!el) return;
  var cents = simAmountCents();
  if (!cents || cents < 900) { el.innerHTML = '<span style="font-size:12px;color:var(--text3);">Informe um valor a partir de R$ 9,00.</span>'; return; }
  el.innerHTML = '<span style="font-size:12px;color:var(--text3);">Calculando...</span>';
  try {
    var res = await apiFetch('/api/seller/fee-simulator?amount_cents=' + cents);
    if (!res.success) throw new Error(res.error || 'Erro');
    renderFeeSimulator(res.simulation);
  } catch (e) {
    el.innerHTML = '<span style="font-size:12px;color:var(--red);">Nao foi possivel simular agora.</span>';
  }
}

function renderFeeSimulator(sim) {
  var el = document.getElementById('sim-result');
  if (!el) return;
  var rows = '<tr><td style="padding:6px 8px;">Pix</td>' +
    '<td style="padding:6px 8px;color:var(--emerald);">' + simBRL(sim.pix.seller_cents) + '</td>' +
    '<td style="padding:6px 8px;color:var(--text2);">' + simBRL(sim.pix.seller_cents) + '</td></tr>';
  for (var i = 0; i < sim.card.length; i++) {
    var c = sim.card[i];
    rows += '<tr>' +
      '<td style="padding:6px 8px;">Cartao ' + c.n + 'x</td>' +
      '<td style="padding:6px 8px;color:var(--emerald);">' + simBRL(c.sem_repasse_seller_cents) + '</td>' +
      '<td style="padding:6px 8px;color:var(--text2);">' + simBRL(c.com_repasse_buyer_cents) + ' &rarr; ' + simBRL(c.com_repasse_seller_cents) + '</td>' +
    '</tr>';
  }
  el.innerHTML =
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Venda de <strong>' + simBRL(sim.amount_cents) + '</strong></div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="color:var(--text3);font-size:10px;text-transform:uppercase;">' +
        '<th style="text-align:left;padding:6px 8px;">Metodo</th>' +
        '<th style="text-align:left;padding:6px 8px;">Sem repasse (voce recebe)</th>' +
        '<th style="text-align:left;padding:6px 8px;">Com repasse (comprador paga &rarr; voce recebe)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5;">Pix: recebe na hora, sem taxa. Cartao: recebimento rapido via antecipacao automatica. Valores ilustrativos; as taxas do banco podem variar.</div>';
}
```

- [ ] **Step 3: Verificar o script**

Run:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: aba Loja — simulador de recebimento (Pix/cartao 1x-3x, com e sem repasse)"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Testes + sintaxe**

Run:
```bash
npm test
node -c src/services/pricing.js && node -c src/routes/seller.js && echo BACKEND_OK
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo "index OK" && rm -f _sc.js
```
Expected: testes PASS, `BACKEND_OK`, `index OK`.

- [ ] **Step 2:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2 `feeSimulation` puro (Pix + cartão 1..MAX, dois cenários) → Task 1. ✅
- §3 endpoint `GET /api/seller/fee-simulator` com validação (min/teto) → Task 2. ✅
- §4 card no painel (input, debounce, tabela 2 colunas, estados, nota) → Task 3. ✅
- §6 critérios (números batem com o checkout pois reusa pricing.js; testes; 400 em entrada inválida; card trata loading/erro) → Tasks 1–3. ✅

**Placeholder scan:** sem TBD/itens vagos; todo passo tem código completo e comandos exatos.

**Type consistency:** `feeSimulation(amountCents, overrides)` retorna `{ amount_cents, pix:{seller_cents}, card:[{n, sem_repasse_seller_cents, com_repasse_buyer_cents, com_repasse_seller_cents}] }` — consumido igual no endpoint (Task 2) e no `renderFeeSimulator` (Task 3). `feeSimulation` definido na Task 1 e importado na Task 2. `loadFeeSimulator`/`feeSimulatorCard` definidos e chamados em `renderSellerActive` (Task 3). ✅

**Gaps conhecidos (aceitos):**
- O simulador mostra sempre os dois cenários (não lê o toggle real) — decisão de produto da spec.
- Tolerância de arredondamento `com_repasse_seller_cents <= amountCents + 2` no teste cobre o gross-up `ceil` + `round` da taxa.
