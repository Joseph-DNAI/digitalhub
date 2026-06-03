# Grupo A — Melhorias na landing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar os 7 ajustes de design na `public/landing.html` (preço Business, prova social, menu mobile, contraste, comentário morto, link Venda direta).

**Architecture:** Edição estática de um único arquivo (`public/landing.html`). Sem backend, sem banco. O menu mobile adiciona um botão hambúrguer + painel com toggle JS.

**Tech Stack:** HTML/CSS/JS estático.

---

## Task 1: Ajustes na landing

**Files:**
- Modify: `public/landing.html`

- [ ] **Step 1: Preço Business (dado)**

No `const prices`, trocar:
```js
  monthly: { free: 0, starter: 37, basic: 77, pro: 147, business: 247 },
```
por:
```js
  monthly: { free: 0, starter: 37, basic: 77, pro: 147, business: 297 },
```
(O `annual.business` permanece `247`.)

- [ ] **Step 2: Prova social verificável**

Trocar o conteúdo do `.hero-proof`:
```html
  <p class="hero-proof">
    Mais de 3.200 entregas realizadas este mês
  </p>
```
por:
```html
  <p class="hero-proof">
    Entrega automática em menos de 3 segundos
  </p>
```

- [ ] **Step 3: Contraste (CSS)**

(a) Trocar `.hero-proof` color. De:
```css
.hero-proof {
  margin-top: 24px; font-size: 13px; color: var(--text3);
```
para:
```css
.hero-proof {
  margin-top: 24px; font-size: 13px; color: var(--text2);
```
(b) Trocar os links do footer. De:
```css
.footer-links a { font-size: 13px; color: var(--text3); text-decoration: none; transition: color 0.2s; }
.footer-links a:hover { color: var(--text2); }
```
para:
```css
.footer-links a { font-size: 13px; color: var(--text2); text-decoration: none; transition: color 0.2s; }
.footer-links a:hover { color: var(--text); }
```

- [ ] **Step 4: Remover comentário morto**

Remover a linha:
```css
/* placeholder sections — will be filled in Tasks 3-6 */
```

- [ ] **Step 5: Link "Venda direta" no menu (desktop)**

Na `<ul class="nav-links">`, após o item "Recursos", inserir:
```html
    <li><a href="#venda-direta">Venda direta</a></li>
```
Resultado (ordem): Como funciona · Recursos · Venda direta · Comparativo · Preços.

- [ ] **Step 6: CSS do menu mobile**

No CSS, logo após o bloco `.nav-actions { ... }` (a regra existente), adicionar:
```css
.nav-toggle {
  display: none; background: none; border: 1px solid var(--border2); color: var(--text);
  width: 40px; height: 38px; border-radius: 8px; cursor: pointer;
  align-items: center; justify-content: center; font-size: 20px;
}
.nav-mobile {
  display: none; position: fixed; top: 64px; left: 0; right: 0; z-index: 99;
  background: rgba(13,15,24,0.97); backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--border); padding: 16px 20px;
  flex-direction: column; gap: 4px;
}
.nav-mobile.open { display: flex; }
.nav-mobile a { color: var(--text2); text-decoration: none; font-size: 15px; font-weight: 500; padding: 11px 12px; border-radius: 8px; }
.nav-mobile a:hover { color: var(--text); background: rgba(255,255,255,0.05); }
.nav-mobile-actions { display: flex; gap: 10px; margin-top: 8px; }
.nav-mobile-actions button { flex: 1; justify-content: center; }
```
E dentro do `@media (max-width: 900px)`, onde já existe `.nav-links { display: none; }`, acrescentar duas regras no mesmo bloco:
```css
  .nav-toggle { display: flex; }
  .nav-actions { display: none; }
```
(Resultado em mobile: navbar = logo + hambúrguer; CTAs vão para o painel.)

- [ ] **Step 7: HTML do botão + painel mobile**

(a) Dentro de `<nav id="main-nav">`, após o `</div>` de fechamento do `<div class="nav-actions">`, adicionar o botão:
```html
  <button class="nav-toggle" onclick="toggleMobileMenu()" aria-label="Menu"><i class="ti ti-menu-2"></i></button>
```
(b) Logo após `</nav>`, adicionar o painel:
```html
<div class="nav-mobile" id="navMobile">
  <a href="#como-funciona" onclick="closeMobileMenu()">Como funciona</a>
  <a href="#recursos" onclick="closeMobileMenu()">Recursos</a>
  <a href="#venda-direta" onclick="closeMobileMenu()">Venda direta</a>
  <a href="#comparativo" onclick="closeMobileMenu()">Comparativo</a>
  <a href="#precos" onclick="closeMobileMenu()">Preços</a>
  <div class="nav-mobile-actions">
    <button class="btn-ghost" onclick="closeMobileMenu();openLoginModal()">Entrar</button>
    <button class="btn-primary" onclick="closeMobileMenu();openModal('basic')"><i class="ti ti-rocket"></i> Começar grátis</button>
  </div>
</div>
```

- [ ] **Step 8: JS do toggle**

No `<script>`, junto das outras funções do menu (ex.: após `function openLoginModal()`), adicionar:
```js
function toggleMobileMenu() { document.getElementById('navMobile').classList.toggle('open'); }
function closeMobileMenu() { var m = document.getElementById('navMobile'); if (m) m.classList.remove('open'); }
```

- [ ] **Step 9: Verificar**

(a) Conteúdo:
```bash
node -e "const h=require('fs').readFileSync('public/landing.html','utf8'); const ok = h.includes('business: 297') && h.includes('Entrega automática em menos de 3 segundos') && h.includes('id=\"navMobile\"') && h.includes('href=\"#venda-direta\"') && !h.includes('placeholder sections'); console.log(ok?'CONTENT_OK':'FALTANDO'); process.exit(ok?0:1);"
```
Expected: `CONTENT_OK`.

(b) Script inline:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/landing.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

- [ ] **Step 10: Commit**

```bash
git add public/landing.html
git commit -m "feat: landing — preco Business, prova social, menu mobile, contraste e link venda direta"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 11:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2.1 preço Business 247→297 → Step 1. ✅
- §2.2 visibilidade (sem mudança) → coberto (nenhuma alteração). ✅
- §2.3 prova social → Step 2. ✅
- §2.4 menu mobile (CSS + HTML + JS) → Steps 6, 7, 8. ✅
- §2.5 contraste → Step 3. ✅
- §2.6 comentário morto → Step 4. ✅
- §2.7 link Venda direta (desktop + mobile) → Steps 5 e 7b. ✅

**Placeholder scan:** sem TBD; todo o HTML/CSS/JS está literal.

**Type consistency:** `toggleMobileMenu`/`closeMobileMenu` (Step 8) ↔ `id="navMobile"` (Step 7b) ↔ `.nav-mobile.open` (Step 6); `.nav-toggle` (Step 6 CSS) ↔ botão `class="nav-toggle"` (Step 7a); `#venda-direta` (Step 5/7b) aponta para a `<section id="venda-direta">` existente. ✅
