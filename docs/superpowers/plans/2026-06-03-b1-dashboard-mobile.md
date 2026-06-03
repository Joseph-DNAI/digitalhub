# B1 — Responsividade mobile do dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o painel (`public/index.html`) usável no celular: sidebar vira drawer com hambúrguer + overlay, grids empilham, tabelas com scroll. Desktop inalterado.

**Architecture:** Edição estática de um único arquivo. Novos blocos `@media (max-width: 860px)` e `@media (max-width: 520px)`; botão hambúrguer na topbar + overlay no HTML; 2 funções JS + hook no `switchTab` existente.

**Tech Stack:** HTML/CSS/JS estático.

---

## Task 1: Mobile do dashboard

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: CSS base (burger + overlay default)**

No `<style>`, logo após a regra `.content { flex: 1; overflow-y: auto; padding: 28px; }` (a regra existente do `.content`), adicionar:
```css
.topbar-burger { display: none; background: none; border: none; color: var(--text); font-size: 22px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
.topbar-burger:hover { background: rgba(255,255,255,0.05); }
.sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 150; background: rgba(0,0,0,0.55); }
```

- [ ] **Step 2: Media query 860px**

No fim do `<style>` (antes de `</style>`), adicionar:
```css
@media (max-width: 860px) {
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; transform: translateX(-100%); transition: transform 0.25s ease; }
  .sidebar.open { transform: translateX(0); box-shadow: 0 0 40px rgba(0,0,0,0.5); }
  .sidebar-overlay.open { display: block; }
  .topbar { padding: 0 14px; justify-content: space-between; }
  .topbar-burger { display: flex; }
  .content { padding: 16px; }
  .page-header { flex-wrap: wrap; gap: 12px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .form-grid { grid-template-columns: 1fr; }
  .products-grid { grid-template-columns: 1fr; }
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
@media (max-width: 520px) {
  .stats-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Hambúrguer na topbar (HTML)**

Na `.topbar` (atual: `<div class="topbar">`), inserir como **primeiro** filho, antes do `<div id="tb-deliveries-today" ...>`:
```html
      <button class="topbar-burger" onclick="toggleSidebar()" aria-label="Menu"><i class="ti ti-menu-2"></i></button>
```

- [ ] **Step 4: Overlay (HTML)**

Logo após o fechamento `</aside>` da sidebar (antes de `<!-- Main -->` / `<div class="main">`), inserir:
```html
  <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
```

- [ ] **Step 5: Funções JS**

No `<script>`, imediatamente antes da função `function switchTab(name, el) {`, adicionar:
```js
function toggleSidebar() {
  var sb = document.querySelector('.sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open');
}
function closeSidebar() {
  var sb = document.querySelector('.sidebar');
  var ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}
```

- [ ] **Step 6: Hook no switchTab**

No fim da função `switchTab`, trocar:
```js
  if (name === 'config')    loadConfig();
}
```
por:
```js
  if (name === 'config')    loadConfig();
  closeSidebar();
}
```

- [ ] **Step 7: Verificar conteúdo + script**

(a) Conteúdo:
```bash
node -e "const h=require('fs').readFileSync('public/index.html','utf8'); const ok = h.includes('topbar-burger') && h.includes('id=\"sidebarOverlay\"') && h.includes('function toggleSidebar') && h.includes('@media (max-width: 860px)') && /closeSidebar\(\);\s*\n\}/.test(h); console.log(ok?'CONTENT_OK':'FALTANDO'); process.exit(ok?0:1);"
```
Expected: `CONTENT_OK`.

(b) Script inline:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat: dashboard responsivo no mobile (sidebar drawer + grids empilhados)"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 9:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §3 sidebar→drawer (CSS fixed/translate, overlay, burger, topbar space-between) → Steps 1, 2, 3, 4. ✅
- §3 comportamento (toggle/close + hook no switchTab) → Steps 5, 6. ✅
- §4 grids/tabelas/spacing (stats 2→1, form/produtos 1col, table-wrap scroll, page-header wrap, content/topbar padding) → Step 2. ✅
- §5 JS → Step 5. ✅
- §7 critérios (verificação de conteúdo + node --check) → Step 7. ✅

**Placeholder scan:** sem TBD; todo CSS/HTML/JS literal.

**Type consistency:** `toggleSidebar`/`closeSidebar` (Step 5) ↔ `id="sidebarOverlay"` (Step 4) ↔ `.sidebar.open`/`.sidebar-overlay.open` (Steps 1,2); `.topbar-burger` (Step 1 CSS) ↔ botão `class="topbar-burger"` (Step 3); `closeSidebar()` chamado no `switchTab` (Step 6). O seletor `.sidebar` casa com `<aside class="sidebar">` existente. ✅

**Gaps conhecidos (aceitos):**
- Tabelas usam scroll horizontal (não viram cards) — suficiente por ora (decisão da spec).
- `.products-grid` usa `auto-fill/minmax` no base; o override `1fr` no media query vale normalmente.
