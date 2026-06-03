# Spec — Grupo A: melhorias na landing page

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Escopo: 7 ajustes na `public/landing.html` (revisão de design — Grupo A). Grupos B (dashboard aba-por-aba) e C (ponto vermelho de pendências) virão depois, com specs próprias.

---

## 1. Objetivo

Corrigir e melhorar a landing (`public/landing.html`) em 7 pontos levantados na revisão de design, sem mudança de backend. Arquivo único.

---

## 2. Itens

### 2.1 Preço do Business (dado consistente)
No bloco `const prices`, o valor **mensal** do Business está `247` (que é o preço anual). Corrigir para o valor canônico do banco (`plans` em `database.js`: business = 297):
- `prices.monthly.business`: `247` → `297`.
- `prices.annual.business`: permanece `247` (preço com 2 meses grátis: 297 × 10/12 ≈ 247).
- O default do HTML `id="price-business">247` permanece (o card só aparece no modo anual, onde 247 é o correto).
- Validação de coerência: anual basic 64 (= 77×10/12), pro 122 (= 147×10/12), business 247 (= 297×10/12); economia business = (297−247)×12 = R$600/ano (bate com o `discountBadge`).

### 2.2 Visibilidade dos planos (sem mudança estrutural)
Manter o comportamento atual (4 cards por modo; Starter oculto no anual, Business oculto no mensal). Nenhuma alteração de código necessária além do 2.1. (Decisão: "manter 4 fixos".)

### 2.3 Prova social verificável
Trocar o texto do `.hero-proof` (atual: "Mais de 3.200 entregas realizadas este mês") por:
> **Entrega automática em menos de 3 segundos**

Mantém a bolinha verde (`::before`) e a animação `pulse-dot`.

### 2.4 Menu mobile (hambúrguer)
Hoje, abaixo de 900px, `.nav-links { display: none }` sem alternativa — o usuário perde os links de seção.
- Adicionar um botão `.nav-toggle` (ícone `ti ti-menu-2`) na navbar, **escondido no desktop** e **visível < 900px** (via media query).
- Adicionar um painel `.nav-mobile` (escondido por padrão) que, quando aberto (classe `.open`), aparece abaixo da navbar com: os 4 links de seção (Como funciona, Recursos, Venda direta, Comparativo, Preços), além de "Entrar" e "Começar grátis".
- JS: função `toggleMobileMenu()` que alterna `.open` no painel; clicar em qualquer link fecha o menu.
- O painel usa os mesmos tokens (fundo `--bg2`, borda `--border`, blur), posicionado `position: fixed; top: 64px; left/right: 0`.

### 2.5 Contraste de textos pequenos
- `.hero-proof { color: var(--text3) }` → `var(--text2)`.
- `.footer-links a { color: var(--text3) }` → `var(--text2)`; hover de `var(--text2)` → `var(--text)`.
- `.footer-copy` permanece `--text3` (texto secundário aceitável), mas pode subir para `--text2` (opcional — incluir para consistência).

### 2.6 Comentário morto
Remover a linha `/* placeholder sections — will be filled in Tasks 3-6 */` (atualmente ~linha 167).

### 2.7 Link "Venda direta" no menu
Na `<ul class="nav-links">`, adicionar um item apontando para a seção existente `#venda-direta`, posicionado logo após "Recursos":
```html
<li><a href="#venda-direta">Venda direta</a></li>
```
Incluir o mesmo link no painel mobile (2.4).

---

## 3. Fora de escopo
- Qualquer mudança de backend, preços reais no banco, ou métricas dinâmicas.
- Reestruturar a grade de planos (decidido manter 4 fixos).
- Grupos B e C (specs próprias).

---

## 4. Critérios de sucesso
- Business mensal no código = 297; coerência de preços anual mantida.
- `.hero-proof` mostra "Entrega automática em menos de 3 segundos" com a bolinha.
- Em < 900px, o hambúrguer abre um menu com todos os links + CTAs; em desktop nada muda.
- Textos pequenos (hero-proof, footer-links) com contraste melhor (`--text2`).
- Sem o comentário morto; com o link "Venda direta" no menu (desktop e mobile).
- `node --check` no script inline do `landing.html` passa.
