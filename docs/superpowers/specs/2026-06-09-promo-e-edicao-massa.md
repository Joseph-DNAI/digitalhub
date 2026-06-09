# Spec — Preço promocional + edição em massa

> Data: 2026-06-09
> Status: aprovado no brainstorming (4 ações em massa + checkbox no card)

---

## 1. Objetivo

(A) **Preço promocional** por produto: além do "Preço" (original), um campo opcional "Valor promocional" (< Preço). No checkout, mostra o original **riscado** + o promocional como valor atual; a cobrança usa o promocional.

(B) **Edição em massa**: selecionar vários produtos (checkbox no card + barra de ação flutuante) e aplicar de uma vez: **desconto %**, **preço fixo**, **remover promoção**, **ativar/desativar**.

---

## 2. Modelo de dados (`products`)

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price_cents INTEGER;
```
- `price_cents` = preço regular (original).
- `promo_price_cents` = promocional (opcional). Regra: `MIN ≤ promo_price_cents < price_cents` (MIN = `DIRECT_MIN_PRICE_CENTS`, default 900).
- **Preço efetivo (cobrado)** = `promo_price_cents || price_cents`.

---

## 3. Backend

### 3.1 `/selling` (PUT `/api/products/:id/selling`)
- Aceitar `promo_price_cents` no body.
- Validação: se vier valor "truthy" → exigir `>= MIN` **e** `< price_cents` (senão 400). Se vier null/0/'' → grava `null` (sem promo).
- Incluir `promo_price_cents` no `products.update`.

### 3.2 Bulk (novo: POST `/api/products/bulk`)
Body: `{ ids: string[], action: 'discount'|'set_price'|'clear_promo'|'status', value }`.
- Valida `ids` não vazio (máx 200) e que todos pertencem ao tenant.
- **discount**: `value` = pct (1–95). Para cada produto: `base = price_cents || round(price*100)`; `promo = round(base*(1 - pct/100))`. Aplica só se `base >= MIN` e `promo >= MIN`; senão conta em `skipped`. Grava `promo_price_cents`.
- **set_price**: `value` = reais (number > 0). Para cada: `price = value`, `price_cents = round(value*100)`. Se o produto é `sellable` e `price_cents < MIN` → skip. Se `promo_price_cents` existente ≥ novo `price_cents` → zera promo.
- **clear_promo**: `promo_price_cents = null` em todos.
- **status**: `value` = 'active'|'inactive'.
  - 'inactive': aplica direto.
  - 'active': respeita o limite de ativos do plano — ativa em ordem até o limite; o que exceder conta em `skipped`. (usa `canActivate`/`countActive`).
- Resposta: `{ success:true, updated:N, skipped:M, message }`.
- Implementação: pode iterar e usar `products.update` por item (volume pequeno). Sem transação obrigatória.

### 3.3 Checkout (`/api/checkout/:slug`)
- `GET`: calcular `eff = promo_price_cents || price_cents`. Retornar:
  - `pix_cents = eff`, `card_cents` a partir de `eff`, `installments` a partir de `eff`.
  - `compare_at_cents = promo_price_cents ? price_cents : null` (valor original p/ riscar).
  - manter `price_cents` (eff) e demais campos.
- `POST` (cobrança): `amountCents` deve usar `eff` no lugar de `product.price_cents` (inclusive no gross-up do cartão e na checagem de MIN).

---

## 4. Frontend — `public/checkout.html`
- Se `compare_at_cents` vier: mostrar o **original riscado** acima/ao lado do preço atual.
  - Ex.: `<span class="old">R$ 100,00</span> <span class="price">R$ 80,00</span>` + selo "−20%".
- O preço atual segue sendo `pix_cents` (efetivo). Estilo `.old{ text-decoration:line-through; color:var(--muted); font-size:16px; }`.

---

## 5. Frontend — `public/index.html`

### 5.1 Campo "Valor promocional" no modal de produto
- Ao lado de "Preço" (hoje full-width), virar 2 colunas: **Preço** + **Valor promocional (opcional)**.
- `id="m-promo"`, hint "menor que o preço; aparece riscado no checkout".
- Validação no `saveProduct`: se preenchido, exigir `0 < promo < preço` (senão erro no modal).
- Enviar `promo_price_cents` no PUT `/selling` (junto do `price_cents`). No `editProduct`, popular `m-promo` a partir de `p.promo_price_cents`.
- Espelhar o mesmo campo no **modal de venda** (`openSelling`), se existir campo de preço lá.

### 5.2 Seleção + barra de ação
- **Checkbox** em cada card (canto superior). Estado em `var bulkSelected = new Set()`.
- `toggleBulk(id, checkboxEl)` adiciona/remove e re-renderiza a barra.
- **Barra flutuante** (`#bulk-bar`, fixed no rodapé) visível quando `bulkSelected.size > 0`:
  - "N selecionados" + botões: **Desconto %**, **Preço fixo**, **Remover promo**, **Ativar**, **Desativar**, **Limpar seleção**.
  - Desconto%/Preço abrem um mini-prompt (pode ser `prompt()` simples ou um popover) para o valor.
- Cada ação chama `POST /api/products/bulk`, depois `loadProducts()` + toast com `updated`/`skipped`.
- Seleção limpa após a ação. Persistir seleção entre re-renders da lista (re-marca os checkboxes via `bulkSelected`).

### 5.3 Badge de promo no card
- Se `p.promo_price_cents`: mostrar preço com original riscado + promocional, e um badge "Promo −X%".

---

## 6. Fora de escopo
- Agendar início/fim da promoção (data).
- Cupons.
- Bulk em ID de plataforma / arquivos.

---

## 7. Critérios de sucesso
- Cadastrar/editar produto com "Valor promocional" (< preço); checkout mostra original riscado + promocional; cobra o promocional.
- Promo inválido (≥ preço, ou < R$9) é rejeitado no front e no backend.
- Selecionar vários produtos e aplicar desconto %, preço fixo, remover promo, ativar/desativar — com contagem de aplicados/pulados.
- Ativar em massa respeita o limite de ativos do plano.
- `node -c` backend + `node --check` scripts + suíte verde.
