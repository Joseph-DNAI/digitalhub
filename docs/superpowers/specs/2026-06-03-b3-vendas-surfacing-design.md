# Spec — B3: Surfacing da venda direta (aba Vendas + card no Dashboard)

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do Grupo B. Irmãos: B1 (mobile, feito), B2 (Config, feito), B4 (polimentos).

---

## 1. Objetivo

Depois das Features A-D, a venda direta (checkout, pedidos, repasses) é central — mas está **invisível no painel**: o Dashboard mostra só métricas de email e não há tela de pedidos. Adicionar (1) uma rota autenticada de pedidos, (2) uma aba **Vendas** com a lista de pedidos, e (3) um card de **vendas diretas** no Dashboard (faturamento + nº de vendas). Tudo exclusivo de assinante (Free não tem venda direta).

---

## 2. Backend

### 2.1 Model `orders.stats` (`src/models/database.js`)
Adicionar ao model `orders` um método agregado:
```js
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
```
(`queryOne` já está disponível no arquivo.)

### 2.2 Rota `src/routes/orders.js` (nova)
Com `requireAuth`:
- `GET /api/orders` → `{ success: true, orders: await orders.findAll(req.tenantId, 100) }`. (`orders.findAll` já existe e retorna os pedidos com `product_name`, ordenados por `created_at DESC`.)
- `GET /api/orders/stats` → `{ success: true, stats: await orders.stats(req.tenantId) }`.
- Erros → 500 padrão com log.

### 2.3 Registro (`src/server.js`)
- Junto dos outros `express.json()`: `app.use('/api/orders', express.json());`
- Junto dos outros `app.use(... require('./routes/...'))`: `app.use('/api/orders', require('./routes/orders'));`

---

## 3. Aba "Vendas" (`public/index.html`)

### 3.1 Item no menu
Na sidebar, seção "Principal", após o item Produtos:
```html
      <button class="nav-item" onclick="switchTab('vendas',this)"><i class="ti ti-shopping-cart"></i> Vendas</button>
```

### 3.2 Seção
Nova `<div id="tab-vendas" class="section">` (no mesmo padrão de Entregas): page-header "Vendas / pedidos da venda direta" + botão Atualizar (`loadVendas()`), e um `.card` com `.table-wrap` e `<table>`:
- Colunas: **Comprador · Produto · Valor · Método · Status · Data**.
- `<tbody id="orders-table">` com "Carregando..." inicial.

### 3.3 JS
- `loadVendas()`: se `currentUser.plan_id === 'free'`, renderiza um estado "Ative a venda direta na aba Loja para vender pela Vaultly" (sem fetch). Senão `GET /api/orders` e renderiza as linhas; vazio → "Nenhuma venda ainda".
  - Formatação: valor `R$ (amount_cents/100)`; método: `pix`→"Pix", `card`→"Cartão"; status com cor (paid=emerald "Pago", pending=yellow "Pendente", refunded/chargeback=red, failed=red). Data `created_at` (toLocaleDateString pt-BR).
  - Escapar campos de texto do comprador/produto com a função de escape existente (`escAttr` ou equivalente) para evitar HTML injection.
- `switchTab`: adicionar `if (name === 'vendas') loadVendas();`.

---

## 4. Card no Dashboard (`public/index.html`)

- Logo após a `.stats-grid` (e antes do banner de limite / "Últimas entregas"), adicionar um `.card` com `id="dash-vendas-card"` (escondido por padrão `style="display:none;"`):
  - Título "Vendas diretas (mês)".
  - Corpo: **Faturamento** em destaque (`id="dash-fat"`) + sublinha "X vendas no mês · Y hoje" (`id="dash-vendas-sub"`).
- Em `loadDashboard()`: se `currentUser.plan_id !== 'free'`, faz `GET /api/orders/stats`, preenche os campos e mostra o card (`display:block`); para Free, mantém escondido. Erro → mantém escondido (não quebra o dashboard).

---

## 5. Gating e fora de escopo
- Tudo exclusivo de assinante (Free vê estado de upgrade na aba Vendas, e nenhum card no Dashboard).
- Fora de escopo: filtros/paginação de pedidos, detalhe do pedido, reembolso pelo painel, saldo Asaas ao vivo (decidimos faturamento + nº de vendas; "último repasse" fica pra depois).

---

## 6. Critérios de sucesso
- `GET /api/orders` e `GET /api/orders/stats` autenticados retornam os pedidos e agregados do tenant.
- A aba Vendas lista os pedidos (ou estado vazio/upgrade); o Dashboard mostra o card de vendas diretas para assinantes com faturamento e contagem.
- Free não vê o card no Dashboard e vê o CTA de upgrade na aba Vendas.
- `node -c` nos arquivos backend + `node --check` no script do `index.html` passam; suíte existente verde.
