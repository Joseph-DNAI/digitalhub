# Spec — B4: Polimentos do dashboard

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do Grupo B (último item). Tudo em `public/index.html`, sem backend.

---

## 1. Objetivo

Quatro polimentos cosméticos no painel, todos em `public/index.html`:
1. Ícones Tabler no lugar dos emoji de plataforma (Webhook).
2. FAQ com perguntas de venda direta (Suporte).
3. 4º stat-card (Produtos) consistente com os outros 3.
4. Chip de uso do plano na topbar.

---

## 2. Itens

### 2.1 Ícones no Webhook
Nos cabeçalhos dos acordeões Kiwify e Yampi, trocar:
- `<span style="font-size:18px;">🟢</span>` (Kiwify) → `<i class="ti ti-circle-filled" style="color:var(--emerald);font-size:14px;"></i>`
- `<span style="font-size:18px;">🔵</span>` (Yampi) → `<i class="ti ti-circle-filled" style="color:#38BDF8;font-size:14px;"></i>`

### 2.2 FAQ de venda direta (Suporte)
No card "Perguntas frequentes" (acordeões `wh-accordion`), adicionar 3 itens novos ao final da lista (mesma marcação dos existentes: `wh-accordion` > `wh-acc-header` (com `onclick="this.parentElement.classList.toggle('open')"`) + `wh-acc-body`):
- **"Como recebo o dinheiro das minhas vendas?"** → "Na venda direta, o valor cai na sua conta de recebimento e é repassado automaticamente a cada 2 horas, via Pix, para a chave CPF/CNPJ que você declarou na aba Loja."
- **"Quais são as taxas da venda direta?"** → "No Pix você recebe sem taxa por venda. No cartão há a taxa de processamento (1,99% + R$0,49) e a antecipação (a partir de 1,15%). Detalhes na página de Termos."
- **"Posso parcelar no cartão?"** → "Sim, em até 3x. Você pode optar por repassar a taxa do cartão ao comprador na aba Loja — assim você recebe o preço cheio."

(Os dois primeiros itens existentes ficam; estes entram depois deles. O último item atual tem `border-top` — manter o padrão de `border-top:1px solid var(--border)` nos novos.)

### 2.3 Stat-card consistente
O 4º stat-card (Produtos) hoje envolve o conteúdo num `<div style="display:flex;...">` com o sparkline à direita, diferente dos outros 3 (que têm `stat-icon`/`stat-label`/`stat-val`/`stat-sub` como filhos diretos). Reestruturar para:
- O `.stat-card` recebe `position:relative`.
- Os filhos diretos voltam a ser `stat-icon` → `stat-label` → `stat-val` → `stat-sub` (igual aos outros).
- O sparkline (rótulo "24h · vendas" + `<svg id="sparkline-svg">`) vira um bloco `position:absolute; top:14px; right:14px;` (sutil, canto superior direito), preservando o `id="sparkline-svg"` para o JS que o desenha continuar funcionando.

### 2.4 Chip de uso do plano na topbar
- Na `.topbar`, adicionar (perto do `tb-deliveries-today`) um chip escondido por padrão:
  ```html
  <div id="tb-plan-usage" style="display:none;align-items:center;gap:5px;background:rgba(255,255,255,0.04);border:1px solid var(--border2);padding:4px 10px;border-radius:99px;font-size:12px;color:var(--text2);font-weight:600;" title="Entregas usadas este mês"><i class="ti ti-gauge" style="font-size:13px;"></i> <span id="tb-plan-usage-text"></span></div>
  ```
- Em `loadDashboard()`, no ramo `if (statsRes.success)`, preencher o chip a partir de `statsRes.data.delivery_month` e `statsRes.data.max_deliveries_month`:
  - Se `max_deliveries_month` for `-1` (ilimitado): texto = `<delivery_month> este mês`.
  - Senão: texto = `<delivery_month>/<max_deliveries_month> este mês`.
  - Mostrar o chip (`display:flex`).
  (Os campos `delivery_month` e `max_deliveries_month` já vêm de `/api/deliveries/stats`.)

---

## 3. Fora de escopo
- Backend (nenhum).
- Barras de progresso / cores de alerta no chip de uso (texto simples por ora).

---

## 4. Critérios de sucesso
- Webhook sem emoji (ícones Tabler coloridos).
- FAQ com 3 perguntas de venda direta funcionando (acordeão abre/fecha).
- 4º stat-card alinhado aos outros, com o sparkline no canto e ainda desenhado pelo JS.
- Topbar mostra o uso de entregas do mês ao abrir o Dashboard.
- `node --check` no script do `index.html` passa; suíte existente verde.
