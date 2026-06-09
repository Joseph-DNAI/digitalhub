# Preço promocional + edição em massa — Plano

> Executar por tasks. Spec: `docs/superpowers/specs/2026-06-09-promo-e-edicao-massa.md`.
> Co-Author em todo commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

**Goal:** preço promocional por produto (original riscado no checkout) + edição em massa (desconto%, preço fixo, remover promo, ativar/desativar) com seleção por checkbox.

**Arch:** coluna `promo_price_cents`; efetivo = `promo || price_cents`; checkout usa efetivo e expõe `compare_at_cents`. Bulk via `POST /api/products/bulk`.

---

## Task 1 — DB
`src/models/database.js`: no bloco de ALTERs (após `file_size`):
```sql
      ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price_cents INTEGER;
```
Add helper em `products`:
```js
  async findByIds(tenantId, ids) {
    if (!ids || !ids.length) return [];
    return query('SELECT * FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[])', [tenantId, ids]);
  },
```
Verif: `node -c src/models/database.js`. Commit.

## Task 2 — Backend: /selling promo + bulk + checkout efetivo
`src/routes/products.js`:

(2a) Em `PUT /:id/selling`, ler `promo_price_cents` do body e validar antes do update:
```js
    let promoCents = null;
    if (sellable && req.body.promo_price_cents) {
      promoCents = parseInt(req.body.promo_price_cents, 10);
      if (!Number.isInteger(promoCents) || promoCents < MIN) {
        return res.status(400).json({ success: false, error: 'Valor promocional minimo e R$' + (MIN/100).toFixed(2).replace('.', ',') + '.' });
      }
      if (promoCents >= price_cents) {
        return res.status(400).json({ success: false, error: 'O valor promocional deve ser menor que o preco.' });
      }
    }
```
e incluir `promo_price_cents: promoCents` no objeto do `products.update`.

(2b) Novo endpoint **antes** de `router.delete('/:id'...)` (e antes de `/:id/duplicate` tudo bem):
```js
// POST /bulk — edicao em massa
router.post('/bulk', async (req, res) => {
  try {
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: 'Selecione ao menos um produto.' });
    if (ids.length > 200) return res.status(400).json({ success: false, error: 'Maximo de 200 produtos por vez.' });

    const list = await products.findByIds(req.tenantId, ids);
    let updated = 0, skipped = 0;

    if (action === 'discount') {
      const pct = parseFloat(value);
      if (!(pct > 0 && pct <= 95)) return res.status(400).json({ success: false, error: 'Desconto deve ser entre 1% e 95%.' });
      for (const p of list) {
        const base = p.price_cents || Math.round((parseFloat(p.price) || 0) * 100);
        const promo = Math.round(base * (1 - pct / 100));
        if (base < MIN || promo < MIN) { skipped++; continue; }
        await products.update(req.tenantId, p.id, { promo_price_cents: promo });
        updated++;
      }
    } else if (action === 'set_price') {
      const reais = parseFloat(String(value).replace(',', '.'));
      if (!(reais > 0)) return res.status(400).json({ success: false, error: 'Informe um preco valido.' });
      const cents = Math.round(reais * 100);
      for (const p of list) {
        if (p.sellable && cents < MIN) { skipped++; continue; }
        const data = { price: reais, price_cents: cents };
        if (p.promo_price_cents && p.promo_price_cents >= cents) data.promo_price_cents = null;
        await products.update(req.tenantId, p.id, data);
        updated++;
      }
    } else if (action === 'clear_promo') {
      for (const p of list) { await products.update(req.tenantId, p.id, { promo_price_cents: null }); updated++; }
    } else if (action === 'status') {
      const target = value === 'active' ? 'active' : 'inactive';
      if (target === 'inactive') {
        for (const p of list) { await products.update(req.tenantId, p.id, { status: 'inactive' }); updated++; }
      } else {
        let activeCount = await products.countActive(req.tenantId);
        for (const p of list) {
          if (p.status === 'active') { updated++; continue; }
          if (!canActivate(activeCount, req.user.max_products)) { skipped++; continue; }
          await products.update(req.tenantId, p.id, { status: 'active' });
          activeCount++; updated++;
        }
      }
    } else {
      return res.status(400).json({ success: false, error: 'Acao invalida.' });
    }

    let message = updated + ' produto(s) atualizado(s)';
    if (skipped) message += ' · ' + skipped + ' ignorado(s)';
    res.json({ success: true, updated, skipped, message });
  } catch (err) {
    logger.error('products/bulk: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
```
> `canActivate` já está importado no topo. Rota é POST `/bulk` — fica antes de `/:id/duplicate`? Não importa (paths diferentes), mas **deve vir antes de qualquer** `/:param` POST genérico. Como só há `POST /`, `POST /:id/files`, `POST /:id/duplicate`, o `/bulk` não colide. Colocar logo após `POST /` para clareza.

(2c) Checkout `src/routes/checkout.js` GET: calcular efetivo e expor compare:
```js
    const eff = product.promo_price_cents || product.price_cents;
```
Trocar nos cálculos: `cardChargeCents(product.price_cents,1)` → `cardChargeCents(eff,1)`; `cardCents = passFee ? ... : eff`; `installmentOptions({ priceCents: eff, ... })`; `pix_cents: eff`; `price_cents: eff`. Adicionar no objeto `product`:
```js
        compare_at_cents: product.promo_price_cents ? product.price_cents : null,
```

(2d) Checkout POST: trocar `product.price_cents` por `eff` no `amountCents` e no MIN. Adicionar no topo do handler (após achar product):
```js
    const eff = product.promo_price_cents || product.price_cents;
```
e usar `eff` em `cardChargeCents(eff, nInstall)` e no fallback `: eff`; a checagem MIN usa `eff`.

Verif: `node -c src/routes/products.js src/routes/checkout.js` + `require`. Commit.

## Task 3 — checkout.html (preço riscado)
`public/checkout.html`:
- CSS: `.old{text-decoration:line-through;color:var(--muted);font-size:16px;margin-right:8px;} .promo-badge{display:inline-block;background:rgba(34,197,94,.12);color:#16a34a;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;margin-left:8px;}`
- HTML: antes de `<div class="price" id="price">`, um `<div id="compare-row" style="display:none;"></div>` (ou inserir struck dentro). Simplest: trocar a linha do preço para conter um `<span id="old-price" class="old" style="display:none;"></span>` + o valor.
- JS no `load()` após setar `_pixCents`:
```js
  if (d.product.compare_at_cents) {
    var op = $('old-price'); if (op) { op.textContent = 'R$ ' + (d.product.compare_at_cents/100).toFixed(2).replace('.', ','); op.style.display = 'inline'; }
    var pct = Math.round((1 - d.product.pix_cents / d.product.compare_at_cents) * 100);
    var pb = $('promo-badge'); if (pb && pct > 0) { pb.textContent = '-' + pct + '%'; pb.style.display = 'inline-block'; }
  }
```
HTML do preço:
```html
      <div class="price"><span id="old-price" class="old" style="display:none;"></span><span id="price"></span><span id="promo-badge" class="promo-badge" style="display:none;"></span></div>
```
> Atenção: hoje o preço é `<div class="price" id="price">` e o JS faz `$('price').textContent`. Ao mudar para spans, manter `id="price"` no span do valor atual. Verificar as 2 linhas que escrevem em `$('price')` (load e no setMethod) — continuam funcionando pois `price` agora é o span.
Verif: extrair scripts + `node --check`. Commit.

## Task 4 — index.html: campo promocional
`public/index.html`:
- Modal criar: transformar o grupo do Preço (full) em 2 colunas e adicionar `m-promo`:
```html
      <div class="form-group">
        <label class="form-label">Preço (R$)</label>
        <input type="number" class="form-input" id="m-price" placeholder="97.00" step="0.01" />
        <div class="form-hint">mín. R$9,00 p/ vender direto</div>
      </div>
      <div class="form-group">
        <label class="form-label">Valor promocional (R$) <span style="color:var(--text3);font-size:10px;">opcional</span></label>
        <input type="number" class="form-input" id="m-promo" placeholder="—" step="0.01" />
        <div class="form-hint">menor que o preço; aparece riscado no checkout</div>
      </div>
```
(remover o hint antigo de baixo do m-price único).
- `saveProduct`: validar promo e enviar no `/selling`. Onde monta o body do `/selling` (sellable), antes:
```js
      var promoStr = (document.getElementById('m-promo').value || '').replace(',', '.');
      var promoCents = promoStr ? Math.round(parseFloat(promoStr) * 100) : 0;
      if (promoCents && promoCents >= priceCents) { showToast('O valor promocional deve ser menor que o preço.', 'warn'); }
```
e adicionar `promo_price_cents: promoCents || null` no JSON do `/selling`.
- `editProduct`: `document.getElementById('m-promo').value = p.promo_price_cents ? (p.promo_price_cents/100).toFixed(2) : '';`
- `openModal`: limpar `m-promo` (`document.getElementById('m-promo').value='';`).
- Modal de venda (`openSelling`/`saveSelling`): adicionar `selling-promo` ao lado de `selling-price`, popular em openSelling (`p.promo_price_cents`), e enviar `promo_price_cents` no saveSelling (com validação < preço).
- **Badge no card**: onde mostra o preço "À venda por", se `p.promo_price_cents`, mostrar `<s>R$ original</s> R$ promo` + `-X%`.
Verif: scripts + `node --check`. Commit.

## Task 5 — index.html: seleção + barra de ação
`public/index.html`:
- `var bulkSelected = new Set();`
- Checkbox no card (canto sup. esq., perto do ícone): `<input type="checkbox" onclick="toggleBulk('${p.id}',this)" ${bulkSelected.has(p.id)?'checked':''} ... title="Selecionar">`.
- Após `renderTable`/render do grid, re-aplicar `checked` via `bulkSelected`.
- Barra fixa `#bulk-bar` (já no HTML, fixed bottom, `display:none`): "N selecionados" + botões Desconto%, Preço, Remover promo, Ativar, Desativar, Limpar.
- Funções:
```js
function toggleBulk(id, el){ if(el.checked) bulkSelected.add(id); else bulkSelected.delete(id); renderBulkBar(); }
function clearBulk(){ bulkSelected.clear(); renderBulkBar(); loadProducts(); }
function renderBulkBar(){ var bar=document.getElementById('bulk-bar'); if(!bar) return; var n=bulkSelected.size; bar.style.display=n?'flex':'none'; var c=document.getElementById('bulk-count'); if(c) c.textContent=n+' selecionado'+(n>1?'s':''); }
async function bulkAction(action){
  var n=bulkSelected.size; if(!n) return;
  var value=null;
  if(action==='discount'){ value=prompt('Desconto % (1 a 95):'); if(value===null) return; }
  if(action==='set_price'){ value=prompt('Novo preço (R$) para os selecionados:'); if(value===null) return; }
  if(action==='status_active') { action='status'; value='active'; }
  if(action==='status_inactive'){ action='status'; value='inactive'; }
  if((action==='discount'||action==='set_price') && (value==='' || value==null)) return;
  try{
    var res=await apiFetch('/api/products/bulk',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: Array.from(bulkSelected), action: action, value: value }) });
    if(!res.success) throw new Error(res.error||'Erro');
    showToast(res.message||'Atualizado!', 'success');
    bulkSelected.clear();
    await loadProducts();
  }catch(e){ showToast(e.message||'Erro na edição em massa.', 'warn'); }
}
```
- Barra HTML (inserir antes de `</body>` ou no fim do `#tab-products`):
```html
<div id="bulk-bar" style="display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:60;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);flex-wrap:wrap;">
  <span id="bulk-count" style="font-size:12px;font-weight:700;"></span>
  <button class="btn btn-ghost btn-sm" onclick="bulkAction('discount')"><i class="ti ti-discount"></i> Desconto %</button>
  <button class="btn btn-ghost btn-sm" onclick="bulkAction('set_price')"><i class="ti ti-tag"></i> Preço</button>
  <button class="btn btn-ghost btn-sm" onclick="bulkAction('clear_promo')"><i class="ti ti-eraser"></i> Remover promo</button>
  <button class="btn btn-ghost btn-sm" onclick="bulkAction('status_active')"><i class="ti ti-player-play"></i> Ativar</button>
  <button class="btn btn-ghost btn-sm" onclick="bulkAction('status_inactive')"><i class="ti ti-player-pause"></i> Desativar</button>
  <button class="btn btn-ghost btn-sm" onclick="clearBulk()" title="Limpar seleção"><i class="ti ti-x"></i></button>
</div>
```
Verif: scripts + `node --check`. Commit.

## Task 6 — suíte + finalizar
`npm test` verde; `node -c` backend. Merge no main + push.

---

## Self-review
- Spec §2 DB→T1; §3.1→T2a; §3.2→T2b; §3.3→T2c/d; §4→T3; §5.1→T4; §5.2/5.3→T4/T5. ✅
- Efetivo = `promo||price_cents` consistente em GET e POST do checkout. ✅
- `promo_price_cents` validado (< price, ≥ MIN) no /selling e no front; bulk discount respeita MIN; bulk activate respeita limite. ✅
- Sem placeholders; nomes de IDs (`m-promo`, `selling-promo`, `bulk-bar`) consistentes entre HTML e JS. ✅
