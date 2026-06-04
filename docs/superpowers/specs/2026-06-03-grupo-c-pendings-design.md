# Spec — Grupo C: Ponto vermelho de pendências nas abas

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Escopo: indicador discreto de pendência por aba no painel. Backend (1 rota) + frontend (`index.html`).

---

## 1. Objetivo

Mostrar um **ponto vermelho discreto** no item do menu lateral quando aquela aba tem uma pendência acionável, estilo notificação. Some quando o usuário resolve. Condições (decididas):
- **Produtos** — há produtos não-mapeados (chegaram via webhook sem arquivo vinculado).
- **Entregas** — há entregas com falha.
- **Loja** — assinante com conta de recebimento **ativa mas sem chave de saque** (precisa reativar).

---

## 2. Backend — `GET /api/pendings`

Nova rota `src/routes/pendings.js` (autenticada), registrada no `server.js`. Reaproveita models existentes:
```js
const express = require('express');
const router  = express.Router();
const { unmatchedProducts, deliveries, sellerAccounts } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.get('/', requireAuth, async (req, res) => {
  try {
    const [unmatched, stats, acc] = await Promise.all([
      unmatchedProducts.findAll(req.tenantId).catch(() => []),
      deliveries.stats(req.tenantId).catch(() => ({ failed: 0 })),
      sellerAccounts.findByTenant(req.tenantId).catch(() => null)
    ]);
    const isPaid = !!(req.user && req.user.plan_id !== 'free');
    res.json({ success: true, pendings: {
      produtos: (unmatched || []).length > 0,
      entregas: !!(stats && stats.failed > 0),
      loja:     !!(isPaid && acc && acc.status === 'active' && !acc.asaas_api_key_enc)
    }});
  } catch (err) {
    logger.error('pendings: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
```
Registro no `server.js`:
- `app.use('/api/pendings',  express.json());` (junto dos outros body-parsers)
- `app.use('/api/pendings',  require('./routes/pendings'));` (junto das outras rotas)

> `deliveries.stats` retorna `failed` (count de status='failed', sem testes). `unmatchedProducts.findAll(tenantId)` retorna as linhas não-mapeadas. `sellerAccounts.findByTenant` traz `status` e `asaas_api_key_enc`.

---

## 3. Frontend (`public/index.html`)

### 3.1 CSS — `.nav-dot`
Adicionar:
```css
.nav-dot { display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--red); margin-left: auto; flex-shrink: 0; box-shadow: 0 0 6px rgba(239,68,68,0.7); }
.nav-dot.on { display: inline-block; }
```
(O `.nav-item` é flex com `gap`; `margin-left:auto` empurra o dot para a direita. Quando o item está ativo, o dot continua visível — ok.)

### 3.2 HTML — dots nos itens
Adicionar um `<span class="nav-dot" id="dot-...">` ao final do conteúdo dos itens **Produtos**, **Entregas** e **Loja** (dentro do `<button class="nav-item" ...>`):
- Produtos: `<span class="nav-dot" id="dot-produtos"></span>`
- Entregas: `<span class="nav-dot" id="dot-entregas"></span>`
- Loja: `<span class="nav-dot" id="dot-loja"></span>`

### 3.3 JS
```js
function setNavDot(id, on) { var d = document.getElementById(id); if (d) d.classList.toggle('on', !!on); }

async function loadPendings() {
  try {
    var res = await apiFetch('/api/pendings');
    if (!res || !res.success || !res.pendings) return;
    var p = res.pendings;
    setNavDot('dot-produtos', p.produtos);
    setNavDot('dot-entregas', p.entregas);
    setNavDot('dot-loja',     p.loja);
  } catch (e) {}
}
```
Chamadas:
- Na inicialização do app (depois que o usuário está carregado — onde hoje se dispara `loadDashboard()` na entrada do painel), adicionar `loadPendings();`.
- Ao final de `loadProducts()`, `loadDeliveries()` e `loadVendaDiretaSection()` (sucesso), chamar `loadPendings();` — assim o dot some quando a pendência é resolvida.

---

## 4. Fora de escopo
- Pendência de Webhook/Email (decidido: só Produtos, Entregas, Loja).
- Contadores numéricos / tooltip (só o dot, discreto).
- Polling periódico (atualiza no load e após as ações relevantes).

---

## 5. Critérios de sucesso
- `GET /api/pendings` autenticado retorna os 3 booleanos corretos.
- O dot vermelho aparece nos itens com pendência ao abrir o painel e some ao resolver (após recarregar a aba correspondente).
- Free não vê pendência de Loja.
- `node -c` no backend + `node --check` no script do `index.html` passam; suíte existente verde.
