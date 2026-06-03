# Spec — B1: Responsividade mobile do dashboard

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do Grupo B (revisão do dashboard). Itens irmãos: B2 (toggles falsos do Config), B3 (surfacing da venda direta), B4 (polimentos) — specs próprias depois.

---

## 1. Objetivo

Tornar o painel (`public/index.html`) usável no celular. Hoje não há **nenhum** `@media`: a sidebar fixa de 220px e os grids quebram em telas pequenas. Transformar a sidebar numa **gaveta (drawer)** acionada por hambúrguer, empilhar grids e dar scroll às tabelas. **Desktop não muda.**

---

## 2. Arquitetura

Arquivo único: `public/index.html`. Mudanças: novos blocos `@media (max-width: 860px)` e `@media (max-width: 520px)` no `<style>`; um botão hambúrguer na topbar + um overlay no HTML; duas funções JS + um hook no `switchTab` existente.

Breakpoint principal: **860px** (mobile/tablet pequeno). Secundário: **520px** (stats em 1 coluna).

---

## 3. Sidebar → drawer

### HTML
- Adicionar, na `.topbar`, como **primeiro** filho (à esquerda), um botão:
  ```html
  <button class="topbar-burger" onclick="toggleSidebar()" aria-label="Menu"><i class="ti ti-menu-2"></i></button>
  ```
- Adicionar, dentro de `.app` (irmão de `.sidebar`/`.main`), um overlay:
  ```html
  <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
  ```

### CSS (no `@media (max-width: 860px)`)
- `.sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; transform: translateX(-100%); transition: transform 0.25s ease; }`
- `.sidebar.open { transform: translateX(0); box-shadow: 0 0 40px rgba(0,0,0,0.5); }`
- `.sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 150; background: rgba(0,0,0,0.55); }`
- `.sidebar-overlay.open { display: block; }`
- `.topbar-burger { display: flex; }` (e a topbar passa a `justify-content: space-between`).

### CSS (base, fora do media query)
- `.topbar-burger { display: none; background: none; border: none; color: var(--text); font-size: 22px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }`
- `.sidebar-overlay { display: none; }` (default; só aparece no mobile quando `.open`).

### Comportamento
- `toggleSidebar()` alterna `.open` em `.sidebar` e `#sidebarOverlay` juntos.
- `closeSidebar()` remove `.open` dos dois.
- No fim da função `switchTab(name, el)` (existente), chamar `closeSidebar()` para fechar o drawer ao trocar de aba no mobile (no desktop é inócuo).

---

## 4. Grids e tabelas (no `@media (max-width: 860px)`)

- `.stats-grid { grid-template-columns: repeat(2, 1fr); }`
- `.form-grid { grid-template-columns: 1fr; }`
- `.products-grid { grid-template-columns: 1fr; }`
- `.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }`
- `.page-header { flex-wrap: wrap; gap: 12px; }`
- `.content { padding: 16px; }`
- `.topbar { padding: 0 14px; justify-content: space-between; }`

No `@media (max-width: 520px)`:
- `.stats-grid { grid-template-columns: 1fr; }`

> Nota: `.products-grid` é definido no `<style>` (grid de produtos). A regra mobile sobrescreve para 1 coluna. Se a definição usar `auto-fill/minmax`, a regra `1fr` ainda vale como override no media query.

---

## 5. JS

Adicionar (junto das funções de UI, ex.: perto de `switchTab`):
```js
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  var sb = document.querySelector('.sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}
```
E, no fim de `switchTab(...)`, acrescentar `closeSidebar();`.

---

## 6. Fora de escopo
- Redesenho de qualquer aba (B3/B4).
- Tabelas virarem "cards" no mobile (scroll horizontal é suficiente por ora).
- Mudança de tokens/cores (B4).

---

## 7. Critérios de sucesso
- < 860px: sidebar escondida; hambúrguer abre o drawer com overlay; escolher aba fecha o drawer; overlay fecha ao tocar.
- Grids empilham (stats 2→1, forms/produtos 1 coluna); tabelas com scroll horizontal; sem overflow lateral da página.
- Desktop (> 860px) permanece idêntico ao atual.
- `node --check` no script inline do `index.html` passa.
