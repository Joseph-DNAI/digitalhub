# Vaultly Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `public/landing.html` and `public/index.html` do zero com identidade visual laranja/brasileiro, eliminando todos os elementos genéricos de IA, preservando todo o JavaScript funcional existente.

**Architecture:** Dois arquivos HTML auto-contidos (CSS inline + JS inline, sem build step). Landing usa paleta laranja energética. Painel usa dark neutro com laranja pontual. Todo JS é portado verbatim — nenhuma lógica de negócio é alterada.

**Tech Stack:** HTML5, CSS3 (custom properties), JavaScript ES2020 vanilla, Tabler Icons CDN, Google Fonts (Satoshi + Inter + JetBrains Mono)

---

## IDs obrigatórios no index.html (não renomear)

```
admin-nav-section, app, btn-checkout-business, btn-checkout-starter,
btn-manage-sub, btn-save-email, btn-save-webhook, btn-simulate,
cfg-billing-actions, cfg-email-template, cfg-from-address, cfg-from-name,
cfg-kiwify-secret, cfg-plan-name, cfg-plan-sub, cfg-resend-key,
cfg-yampi-alias, cfg-yampi-secret, cfg-yampi-token, confirm-pass,
deliveries-table, deliveries-upgrade-banner, email-status-dot,
email-status-label, email-template-lock, email-template-plan-badge,
kiwify-url-input, limit-warning-banner, log-last-time, log-live-dot,
login-error, login-pass, login-screen, login-user, m-desc, m-editing-id,
m-file, m-kiwify, m-name, m-price, m-status, m-yampi, modal-bg,
modal-title, new-pass, ob-btn-back, ob-btn-next, ob-btn-skip, ob-resend-key,
ob-resend-key-wrap, ob-step-sub, ob-step-title, ob-store-name, ob-summary,
onboarding-modal, platform-import-list, products-grid, products-icon,
products-sub, recent-deliveries, resend-infra-badge, resend-infra-lock,
s-delivered, s-failed, s-products, s-today, save-btn, sim-email,
sim-platform, sim-product-id, sim-product-select, sim-result, sparkline-svg,
stat-failed-card, stat-products-card, tab-dashboard, tb-deliveries-today,
tb-today-count, tb-unmatched, tb-unmatched-count, topbar-btn,
um-card-business, um-card-starter, um-tog-annual, um-tog-monthly,
unmatched-badge, unmatched-list, unmatched-section, upgrade-error,
upgrade-modal, upload-sub, upload-title, url-kiwify, url-yampi,
user-avatar, user-name-label, webhook-log
```

---

## Sistema de Design Tokens

```css
:root {
  /* Backgrounds */
  --bg:      #0D0F18;
  --bg2:     #111320;
  --bg3:     #171A2E;
  --bg4:     #1E2440;

  /* Borders */
  --border:  rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.13);

  /* Brand */
  --orange:  #FF6B35;
  --amber:   #FF9F1C;
  --orange-dim: rgba(255,107,53,0.12);

  /* Status */
  --emerald:     #22C55E;
  --emerald-dim: rgba(34,197,94,0.12);
  --red:         #EF4444;
  --red-dim:     rgba(239,68,68,0.12);
  --yellow:      #F59E0B;
  --yellow-dim:  rgba(245,158,11,0.12);

  /* Text */
  --text:  #F8FAFC;
  --text2: #94A3B8;
  --text3: #475569;

  /* Radius */
  --radius:    10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

---

## Fase 1 — Landing Page

### Task 1: CSS base da landing (tokens, reset, tipografia, navbar, botões)

**Files:**
- Create: `public/landing.html` (novo, começa vazio)

- [ ] **Criar o shell do arquivo com `<head>`, fonts e reset:**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Vaultly — Entrega Automática de Produtos Digitais</title>
<meta name="description" content="Automatize 100% da entrega dos seus produtos digitais. Integre com Kiwify e Yampi em minutos."/>
<link rel="icon" type="image/png" href="/img/logo-icon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"/>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0D0F18; --bg2: #111320; --bg3: #171A2E; --bg4: #1E2440;
  --border: rgba(255,255,255,0.07); --border2: rgba(255,255,255,0.13);
  --orange: #FF6B35; --amber: #FF9F1C; --orange-dim: rgba(255,107,53,0.12);
  --emerald: #22C55E; --red: #EF4444; --yellow: #F59E0B;
  --text: #F8FAFC; --text2: #94A3B8; --text3: #475569;
  --radius: 10px; --radius-lg: 14px; --radius-xl: 20px;
  --shadow: 0 4px 24px rgba(0,0,0,0.4);
  --shadow-lg: 0 16px 48px rgba(0,0,0,0.5);
  --orange-glow: 0 0 40px rgba(255,107,53,0.25);
}

html { scroll-behavior: smooth; }
body {
  background: var(--bg); color: var(--text);
  font-family: 'Inter', sans-serif; font-size: 16px;
  -webkit-font-smoothing: antialiased; overflow-x: hidden;
}
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 99px; }
```

- [ ] **Adicionar CSS do grid de fundo (substitui os orbs):**

```css
/* Grade de pontos sutil — sem orbs/blobs */
.dot-grid {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse 70% 50% at 50% 0%, black 20%, transparent 80%);
}
```

- [ ] **Adicionar CSS da navbar:**

```css
nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 48px; height: 64px;
  background: rgba(13,15,24,0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--border);
  transition: background 0.3s;
}
.nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.logo-mark {
  width: 34px; height: 34px; border-radius: 9px;
  background: var(--orange); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 20px rgba(255,107,53,0.4); flex-shrink: 0;
}
.logo-mark i { color: #fff; font-size: 18px; }
.logo-name {
  font-family: 'Satoshi', sans-serif; font-size: 19px;
  font-weight: 800; letter-spacing: -0.5px; color: var(--text);
}
.nav-links { display: flex; align-items: center; gap: 4px; list-style: none; }
.nav-links a {
  color: var(--text2); text-decoration: none; font-size: 14px;
  font-weight: 500; padding: 6px 14px; border-radius: 7px; transition: all 0.2s;
}
.nav-links a:hover { color: var(--text); background: rgba(255,255,255,0.05); }
.nav-actions { display: flex; align-items: center; gap: 10px; }
```

- [ ] **Adicionar CSS dos botões globais:**

```css
.btn-ghost {
  background: none; border: 1px solid var(--border2); color: var(--text2);
  padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s; font-family: inherit; text-decoration: none;
  display: inline-flex; align-items: center;
}
.btn-ghost:hover { color: var(--text); border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.04); }

.btn-primary {
  background: var(--orange); border: none; color: #fff;
  padding: 9px 22px; border-radius: 8px; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; font-family: inherit;
  display: inline-flex; align-items: center; gap: 7px;
  box-shadow: 0 0 20px rgba(255,107,53,0.3);
}
.btn-primary:hover { background: #FF7A4A; box-shadow: 0 0 32px rgba(255,107,53,0.45); transform: translateY(-1px); }

.btn-hero {
  background: var(--orange); border: none; color: #fff;
  padding: 15px 36px; border-radius: 10px; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: all 0.25s; font-family: inherit;
  display: inline-flex; align-items: center; gap: 10px;
  box-shadow: 0 0 40px rgba(255,107,53,0.4), 0 4px 24px rgba(0,0,0,0.3);
}
.btn-hero:hover { background: #FF7A4A; box-shadow: 0 0 60px rgba(255,107,53,0.55), 0 8px 32px rgba(0,0,0,0.4); transform: translateY(-2px); }
.btn-hero i { font-size: 20px; transition: transform 0.2s; }
.btn-hero:hover i { transform: translateX(3px); }
```

- [ ] **Adicionar container e utilitários:**

```css
.container { max-width: 1140px; margin: 0 auto; padding: 0 24px; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes reveal-anim {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
.reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.55s ease, transform 0.55s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }
.reveal-d1 { transition-delay: 0.08s; }
.reveal-d2 { transition-delay: 0.16s; }
.reveal-d3 { transition-delay: 0.24s; }
.reveal-d4 { transition-delay: 0.32s; }
```

- [ ] **Fechar `</style>` e adicionar HTML do navbar:**

```html
</style>
</head>
<body>
<div class="dot-grid"></div>

<nav id="main-nav">
  <a class="nav-logo" href="/">
    <div class="logo-mark"><i class="ti ti-package"></i></div>
    <span class="logo-name">Vaultly</span>
  </a>
  <ul class="nav-links">
    <li><a href="#como-funciona">Como funciona</a></li>
    <li><a href="#recursos">Recursos</a></li>
    <li><a href="#comparativo">Comparativo</a></li>
    <li><a href="#precos">Preços</a></li>
  </ul>
  <div class="nav-actions">
    <button class="btn-ghost" onclick="openLoginModal()">Entrar</button>
    <button class="btn-primary" onclick="openModal('basic')">
      <i class="ti ti-rocket"></i> Começar grátis
    </button>
  </div>
</nav>
```

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing shell — tokens, navbar, botões base"
```

---

### Task 2: Hero + seção Problema

**Files:**
- Modify: `public/landing.html`

- [ ] **Adicionar CSS do hero:**

```css
.hero {
  position: relative; z-index: 1;
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; padding: 120px 24px 80px; overflow: hidden;
}
.hero h1 {
  font-family: 'Satoshi', sans-serif;
  font-size: clamp(44px, 6vw, 78px); font-weight: 900;
  line-height: 1.05; letter-spacing: -0.035em;
  margin-bottom: 22px; max-width: 860px;
  animation: fadeInUp 0.6s ease both;
}
.hero h1 em {
  font-style: normal; color: var(--orange);
}
.hero > p {
  font-size: clamp(16px, 2vw, 19px); color: var(--text2);
  line-height: 1.6; max-width: 540px; margin-bottom: 40px;
  animation: fadeInUp 0.6s ease 0.1s both;
}
.hero-actions {
  display: flex; align-items: center; gap: 14px;
  flex-wrap: wrap; justify-content: center;
  animation: fadeInUp 0.6s ease 0.2s both;
}
.hero-proof {
  margin-top: 24px; font-size: 13px; color: var(--text3);
  display: flex; align-items: center; gap: 7px;
  animation: fadeInUp 0.6s ease 0.3s both;
}
.hero-proof::before {
  content: ''; display: inline-block;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--emerald); box-shadow: 0 0 8px var(--emerald);
  animation: pulse-dot 2s ease infinite;
}
@keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
```

- [ ] **Adicionar HTML do hero:**

```html
<section class="hero">
  <h1>Seu produto digital entregue.<br><em>Automático. Sempre.</em></h1>
  <p>
    Conecte sua Kiwify ou Yampi em minutos. Cada venda vira uma entrega automática
    — do checkout ao email do cliente em menos de 3 segundos.
  </p>
  <div class="hero-actions">
    <button class="btn-hero" onclick="openModal('basic')">
      Criar conta grátis <i class="ti ti-arrow-right"></i>
    </button>
  </div>
  <p class="hero-proof">
    Mais de 3.200 entregas realizadas este mês &nbsp;·&nbsp; Sem cartão de crédito
  </p>
</section>
```

- [ ] **Adicionar CSS da seção Problema:**

```css
.problem {
  position: relative; z-index: 1;
  padding: 100px 0; background: var(--bg2);
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
}
.problem-inner {
  max-width: 720px; margin: 0 auto; text-align: center; padding: 0 24px;
}
.problem h2 {
  font-family: 'Satoshi', sans-serif;
  font-size: clamp(28px, 4vw, 46px); font-weight: 800;
  letter-spacing: -0.03em; line-height: 1.15; margin-bottom: 24px;
}
.problem h2 span { color: var(--orange); }
.problem p {
  font-size: 18px; color: var(--text2); line-height: 1.7;
}
```

- [ ] **Adicionar HTML da seção Problema:**

```html
<section class="problem">
  <div class="problem-inner">
    <h2 class="reveal">
      Você já perdeu uma venda porque<br>
      <span>o produto não chegou?</span>
    </h2>
    <p class="reveal reveal-d1">
      Enviar arquivo por email manualmente. Copiar link de download. Responder cliente
      às 23h dizendo "já enviei". Para quem vende no automático, isso não deveria existir.
      O Vaultly cuida de tudo enquanto você foca no que importa: vender mais.
    </p>
  </div>
</section>
```

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing hero e secao problema"
```

---

### Task 3: Como Funciona + Bento Grid de Features

**Files:**
- Modify: `public/landing.html`

- [ ] **Adicionar CSS do Como Funciona:**

```css
.hiw { position: relative; z-index: 1; padding: 100px 0; }
.hiw-header { text-align: center; margin-bottom: 72px; }
.section-title {
  font-family: 'Satoshi', sans-serif;
  font-size: clamp(30px, 4vw, 50px); font-weight: 900;
  letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 14px;
}
.section-title em { font-style: normal; color: var(--orange); }
.section-sub { font-size: 17px; color: var(--text2); max-width: 520px; margin: 0 auto; line-height: 1.6; }

.hiw-steps {
  display: flex; align-items: flex-start; justify-content: center;
  gap: 0; position: relative;
}
.hiw-step { flex: 1; max-width: 300px; text-align: center; padding: 0 24px; position: relative; z-index: 1; }
.hiw-num {
  font-family: 'Satoshi', sans-serif; font-size: 96px; font-weight: 900;
  color: rgba(255,255,255,0.04); line-height: 1; margin-bottom: -16px;
  letter-spacing: -4px;
}
.hiw-step h3 {
  font-family: 'Satoshi', sans-serif; font-size: 20px;
  font-weight: 700; margin-bottom: 10px; color: var(--text);
}
.hiw-step p { font-size: 14px; color: var(--text2); line-height: 1.6; }
.hiw-connector {
  width: 80px; flex-shrink: 0; height: 2px;
  background: repeating-linear-gradient(90deg, var(--orange) 0, var(--orange) 6px, transparent 6px, transparent 14px);
  margin-top: 56px; opacity: 0.4;
}
```

- [ ] **Adicionar HTML do Como Funciona (3 passos):**

```html
<section class="hiw" id="como-funciona">
  <div class="container">
    <div class="hiw-header reveal">
      <h2 class="section-title">Da compra ao cliente em<br><em>3 passos</em></h2>
      <p class="section-sub">Zero intervenção manual.</p>
    </div>
    <div class="hiw-steps">
      <div class="hiw-step reveal">
        <div class="hiw-num">01</div>
        <h3>Conecte a plataforma</h3>
        <p>Cole o webhook da Kiwify ou Yampi no painel. Leva 2 minutos.</p>
      </div>
      <div class="hiw-connector"></div>
      <div class="hiw-step reveal reveal-d1">
        <div class="hiw-num">02</div>
        <h3>Cadastre o produto</h3>
        <p>Suba o arquivo PDF ou ebook. O sistema mapeia automaticamente.</p>
      </div>
      <div class="hiw-connector"></div>
      <div class="hiw-step reveal reveal-d2">
        <div class="hiw-num">03</div>
        <h3>Venda e esqueça</h3>
        <p>Cada compra aprovada dispara o envio automaticamente, com retry incluído.</p>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Adicionar CSS do Bento Grid:**

```css
.features { position: relative; z-index: 1; padding: 100px 0; background: var(--bg2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.bento { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: auto auto; gap: 14px; }
.bento-card {
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 28px; position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.bento-card:hover { border-color: var(--border2); transform: translateY(-2px); }
.bento-card.wide { grid-column: span 2; }
.bento-card h3 { font-family: 'Satoshi', sans-serif; font-size: 18px; font-weight: 700; margin-bottom: 10px; }
.bento-card p { font-size: 13px; color: var(--text2); line-height: 1.6; }
/* Mini-demos inline nos cards */
.demo-log { margin-top: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; padding: 10px 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.demo-log .log-line { display: flex; gap: 8px; padding: 3px 0; }
.demo-log .log-ok   { color: var(--emerald); }
.demo-log .log-warn { color: var(--yellow); }
.demo-log .log-info { color: var(--text3); }
.bento-badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(34,197,94,0.1); color: var(--emerald); border: 1px solid rgba(34,197,94,0.2); font-size: 11px; font-weight:600; padding: 3px 9px; border-radius: 99px; margin-top: 14px; }
```

- [ ] **Adicionar HTML do Bento Grid:**

```html
<section class="features" id="recursos">
  <div class="container">
    <div style="margin-bottom:56px;" class="reveal">
      <h2 class="section-title">Tudo que você precisa,<br><em>nada que atrapalha</em></h2>
      <p class="section-sub" style="max-width:480px;">Para infoprodutores que querem escalar sem dor de cabeça técnica.</p>
    </div>
    <div class="bento">
      <!-- Card grande: retry automático -->
      <div class="bento-card wide reveal">
        <h3>Retry automático — zero perda de venda</h3>
        <p>Se o email falhar, o sistema tenta novamente até 3 vezes sozinho. Você nunca fica sabendo porque nunca falha de vez.</p>
        <div class="demo-log">
          <div class="log-line"><span class="log-ok">✓</span><span>Ana Costa — ebook_marketing.pdf — entregue em 1.3s</span></div>
          <div class="log-line"><span class="log-warn">⟳</span><span>Carlos Lima — tentativa 1/3 — aguardando...</span></div>
          <div class="log-line"><span class="log-ok">✓</span><span>Carlos Lima — entregue na 2ª tentativa</span></div>
          <div class="log-line"><span class="log-info">·</span><span>Mariana R. — na fila</span></div>
        </div>
      </div>
      <!-- Card: segurança HMAC -->
      <div class="bento-card reveal reveal-d1">
        <h3>Segurança por assinatura</h3>
        <p>Cada webhook é validado por HMAC-SHA256. Nenhum pedido falso passa.</p>
        <div class="demo-log" style="margin-top:14px;">
          <div class="log-line"><span class="log-ok">✓</span><span>assinatura válida</span></div>
          <div class="log-line"><span class="log-info">·</span><span>pedido: #KW-2847</span></div>
        </div>
        <div class="bento-badge"><i class="ti ti-shield-check"></i> Kiwify &amp; Yampi</div>
      </div>
      <!-- Card: BYOK Resend -->
      <div class="bento-card reveal reveal-d2">
        <h3>Use sua conta Resend</h3>
        <p>Conecte sua API key a partir do plano Basic. Sua reputação, seu domínio.</p>
        <div class="demo-log" style="margin-top:14px;">
          <div class="log-line"><span class="log-ok">✓</span><span>re_••••••••••••</span></div>
          <div class="log-line"><span class="log-info">·</span><span>entregas@seudominio.com</span></div>
        </div>
      </div>
      <!-- Card: multi-plataforma -->
      <div class="bento-card reveal reveal-d1">
        <h3>Kiwify e Yampi nativos</h3>
        <p>Nenhuma configuração extra. Cole o URL e pronto.</p>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <span style="background:rgba(255,107,53,0.1);color:var(--amber);border:1px solid rgba(255,107,53,0.25);font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;">Kiwify</span>
          <span style="background:rgba(255,107,53,0.1);color:var(--amber);border:1px solid rgba(255,107,53,0.25);font-size:12px;font-weight:700;padding:5px 12px;border-radius:6px;">Yampi</span>
        </div>
      </div>
      <!-- Card: logs em tempo real -->
      <div class="bento-card reveal reveal-d2">
        <h3>Logs em tempo real</h3>
        <p>Veja cada entrega acontecer. Filtre por status, plataforma ou período.</p>
        <div class="demo-log" style="margin-top:14px;">
          <div class="log-line"><span style="color:var(--text3);font-size:10px;">14:32:01</span><span class="log-ok">entregue</span></div>
          <div class="log-line"><span style="color:var(--text3);font-size:10px;">14:31:55</span><span class="log-ok">entregue</span></div>
          <div class="log-line"><span style="color:var(--text3);font-size:10px;">14:31:48</span><span class="log-warn">retry #1</span></div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing como-funciona e bento-grid features"
```

---

### Task 4: Comparativo + Preços

**Files:**
- Modify: `public/landing.html`

- [ ] **Adicionar CSS da tabela comparativa:**

```css
.comparison { position: relative; z-index: 1; padding: 100px 0; }
.comparison-header { text-align: center; margin-bottom: 52px; }
.comp-table { width: 100%; border-collapse: collapse; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-xl); overflow: hidden; }
.comp-table thead th { padding: 18px 24px; font-size: 13px; font-weight: 700; border-bottom: 1px solid var(--border); background: var(--bg3); }
.comp-table thead th:first-child { text-align: left; }
.comp-table thead .th-vaultly { background: rgba(255,107,53,0.08); color: var(--orange); border-bottom: 2px solid var(--orange); }
.comp-table thead .th-comp { color: var(--text3); }
.comp-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.15s; }
.comp-table tbody tr:last-child { border-bottom: none; }
.comp-table tbody tr:hover { background: rgba(255,255,255,0.02); }
.comp-table tbody td { padding: 15px 24px; text-align: center; font-size: 14px; }
.comp-table tbody td:first-child { text-align: left; color: var(--text2); }
.comp-table tbody td.vaultly-col { background: rgba(255,107,53,0.04); font-weight: 600; }
.comp-table tbody td.comp-col { color: var(--text3); }
.check { color: var(--emerald); font-size: 18px; }
.cross { color: var(--text3); font-size: 18px; opacity: 0.5; }
.highlight-row td:first-child { color: var(--text); font-weight: 600; }
```

- [ ] **Adicionar HTML do comparativo (manter conteúdo existente, novo estilo):**

```html
<section class="comparison" id="comparativo">
  <div class="container">
    <div class="comparison-header reveal">
      <h2 class="section-title">O que você não encontra<br><em>em mais nenhum lugar</em></h2>
    </div>
    <div class="reveal" style="overflow-x:auto;">
      <table class="comp-table">
        <thead>
          <tr>
            <th style="text-align:left;">Funcionalidade</th>
            <th class="th-vaultly">Vaultly</th>
            <th class="th-comp">Concorrentes</th>
          </tr>
        </thead>
        <tbody>
          <tr class="highlight-row">
            <td>Cobra % sobre cada venda</td>
            <td class="vaultly-col"><i class="ti ti-circle-x cross"></i></td>
            <td class="comp-col"><i class="ti ti-circle-check-filled check"></i></td>
          </tr>
          <tr><td>Entrega automática por email</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-check-filled check"></i></td></tr>
          <tr><td>Retry automático em falhas</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-x cross"></i></td></tr>
          <tr><td>Use sua própria conta de email</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-x cross"></i></td></tr>
          <tr><td>Integração Kiwify e Yampi</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-x cross"></i></td></tr>
          <tr><td>Proteção contra pedidos falsos</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-x cross"></i></td></tr>
          <tr><td>Suporte em português</td><td class="vaultly-col"><i class="ti ti-circle-check-filled check"></i></td><td class="comp-col"><i class="ti ti-circle-x cross"></i></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>
```

- [ ] **Adicionar CSS da seção de preços:**

```css
.pricing { position: relative; z-index: 1; padding: 100px 0; background: var(--bg2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.pricing-header { text-align: center; margin-bottom: 40px; }
.billing-toggle {
  display: flex; align-items: center; justify-content: center;
  background: var(--bg3); border: 1px solid var(--border2);
  border-radius: 99px; padding: 3px; width: fit-content; margin: 0 auto 14px;
}
.toggle-opt {
  padding: 7px 22px; border-radius: 99px; font-size: 14px; font-weight: 600;
  cursor: pointer; color: var(--text3); transition: all 0.2s; user-select: none;
}
.toggle-opt.active { background: var(--orange); color: #fff; box-shadow: 0 2px 8px rgba(255,107,53,0.4); }
.discount-badge {
  display: none; align-items: center; gap: 6px; justify-content: center;
  background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2);
  color: var(--emerald); font-size: 13px; font-weight: 600;
  padding: 7px 16px; border-radius: 99px; width: fit-content; margin: 0 auto 32px;
}
.pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: start; }
.plan-card {
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--radius-xl); padding: 32px;
  transition: all 0.3s; position: relative; overflow: hidden;
}
.plan-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.plan-card.popular {
  border-color: rgba(255,107,53,0.4);
  background: linear-gradient(160deg, rgba(255,107,53,0.06) 0%, var(--bg3) 60%);
  transform: scale(1.03);
}
.plan-card.popular:hover { transform: scale(1.03) translateY(-4px); }
.plan-pop-badge {
  position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
  background: var(--orange); color: #fff;
  font-size: 10px; font-weight: 700; padding: 4px 16px;
  border-radius: 0 0 8px 8px; letter-spacing: 0.06em; text-transform: uppercase;
  white-space: nowrap;
}
.plan-name { font-family: 'Satoshi', sans-serif; font-size: 18px; font-weight: 800; margin-bottom: 6px; }
.plan-price { display: flex; align-items: baseline; gap: 2px; margin-bottom: 4px; }
.plan-price .currency { font-size: 18px; font-weight: 600; color: var(--text2); }
.plan-price .amount { font-family: 'Satoshi', sans-serif; font-size: 40px; font-weight: 900; letter-spacing: -2px; }
.plan-price .period { font-size: 14px; color: var(--text3); padding-bottom: 8px; }
.plan-price-annual { font-size: 12px; color: var(--text3); margin-bottom: 4px; min-height: 18px; }
.plan-original { text-decoration: line-through; }
.plan-save { color: var(--emerald); font-weight: 700; margin-left: 4px; }
.plan-desc { font-size: 13px; color: var(--text2); line-height: 1.5; margin-bottom: 22px; border-top: 1px solid var(--border); padding-top: 16px; }
.plan-features { list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 28px; }
.plan-features li { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--text2); line-height: 1.4; }
.plan-features li i { font-size: 15px; margin-top: 1px; flex-shrink: 0; }
.li-check i { color: var(--emerald); }
.li-cross { opacity: 0.35; }
.btn-plan {
  width: 100%; padding: 13px; border-radius: 9px;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: all 0.25s; font-family: inherit;
  border: none; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-plan-outline {
  background: rgba(255,255,255,0.04); border: 1px solid var(--border2) !important; color: var(--text);
}
.btn-plan-outline:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.22) !important; }
.btn-plan-primary { background: var(--orange); color: #fff; box-shadow: 0 0 28px rgba(255,107,53,0.35); }
.btn-plan-primary:hover { background: #FF7A4A; box-shadow: 0 0 44px rgba(255,107,53,0.5); transform: translateY(-1px); }
```

- [ ] **Adicionar HTML da seção Preços (portar estrutura + IDs existentes):**

```html
<section class="pricing" id="precos">
  <div class="container">
    <div class="pricing-header reveal">
      <h2 class="section-title">Simples, transparente,<br><em>sem surpresas</em></h2>
      <p class="section-sub">Comece grátis e escale conforme seu negócio cresce.</p>
    </div>
    <div class="billing-toggle reveal" id="billingToggle">
      <div class="toggle-opt active" id="toggleMonthly" onclick="setBilling('monthly')">Mensal</div>
      <div class="toggle-opt" id="toggleAnnual" onclick="setBilling('annual')">Anual</div>
    </div>
    <div class="discount-badge reveal" id="discountBadge" style="display:none;">
      <i class="ti ti-tag"></i> Economize até <strong>R$600/ano</strong> no plano Business — 2 meses grátis!
    </div>
    <div class="pricing-grid">
      <!-- FREE -->
      <div class="plan-card reveal">
        <div class="plan-name">Free</div>
        <div class="plan-price"><span class="currency">R$</span><span class="amount" id="price-free">0</span><span class="period">/mês</span></div>
        <div class="plan-price-annual" id="annual-free"></div>
        <p class="plan-desc">Teste a plataforma sem pagar nada.</p>
        <ul class="plan-features">
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 1 produto digital</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 50 entregas por mês</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Kiwify e Yampi</li>
          <li class="li-cross"><i class="ti ti-circle-x"></i> Reenvio automático</li>
        </ul>
        <button class="btn-plan btn-plan-outline" onclick="openModal('free')"><i class="ti ti-rocket"></i> Começar grátis</button>
      </div>
      <!-- STARTER — visível apenas no mensal -->
      <div class="plan-card reveal reveal-d1" id="lp-card-starter">
        <div class="plan-name">Starter</div>
        <div class="plan-price"><span class="currency">R$</span><span class="amount" id="price-starter">37</span><span class="period">/mês</span></div>
        <div class="plan-price-annual" id="annual-starter"></div>
        <p class="plan-desc">Para quem está começando.</p>
        <ul class="plan-features">
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 2 produtos digitais</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 200 entregas por mês</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Reenvio automático</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Email com sua marca</li>
        </ul>
        <button class="btn-plan btn-plan-outline" onclick="openModal('starter')"><i class="ti ti-rocket"></i> Assinar Starter</button>
      </div>
      <!-- BASIC — popular -->
      <div class="plan-card popular reveal reveal-d2">
        <div class="plan-pop-badge">Mais popular</div>
        <div class="plan-name" style="color:var(--orange);">Basic</div>
        <div class="plan-price"><span class="currency">R$</span><span class="amount" id="price-basic">77</span><span class="period">/mês</span></div>
        <div class="plan-price-annual" id="annual-basic"></div>
        <p class="plan-desc">Para quem já vende com consistência.</p>
        <ul class="plan-features">
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 5 produtos digitais</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 1.000 entregas por mês</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> BYOK Resend</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Painel completo + logs</li>
        </ul>
        <button class="btn-plan btn-plan-primary" onclick="openModal('basic')"><i class="ti ti-rocket"></i> Assinar Basic</button>
      </div>
      <!-- PRO -->
      <div class="plan-card reveal reveal-d3">
        <div class="plan-name">Pro</div>
        <div class="plan-price"><span class="currency">R$</span><span class="amount" id="price-pro">147</span><span class="period">/mês</span></div>
        <div class="plan-price-annual" id="annual-pro"></div>
        <p class="plan-desc">Para alto volume sem limitações.</p>
        <ul class="plan-features">
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Produtos ilimitados</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> 5.000 entregas por mês</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Atendimento prioritário</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Painel completo + logs</li>
        </ul>
        <button class="btn-plan btn-plan-outline" onclick="openModal('pro')"><i class="ti ti-stars"></i> Assinar Pro</button>
      </div>
      <!-- BUSINESS — visível apenas no anual -->
      <div class="plan-card reveal reveal-d3" id="lp-card-business" style="display:none;border-color:rgba(255,107,53,0.2);background:linear-gradient(160deg,rgba(255,107,53,0.04) 0%,var(--bg3) 60%);">
        <div class="plan-name" style="color:var(--amber);">Business</div>
        <div class="plan-price"><span class="currency">R$</span><span class="amount" id="price-business">247</span><span class="period">/mês</span></div>
        <div class="plan-price-annual" id="annual-business"></div>
        <p class="plan-desc">Para operações de alto volume com equipe.</p>
        <ul class="plan-features">
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Tudo ilimitado</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Multi-usuário</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> SLA e suporte dedicado</li>
          <li class="li-check"><i class="ti ti-circle-check-filled"></i> Entregas ilimitadas</li>
        </ul>
        <button class="btn-plan btn-plan-outline" onclick="openModal('business')" style="border-color:rgba(255,159,28,0.4);color:var(--amber);"><i class="ti ti-building"></i> Assinar Business</button>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing comparativo e secao precos"
```

---

### Task 5: CTA Final + Footer + Modal de autenticação + CSS responsivo

**Files:**
- Modify: `public/landing.html`

- [ ] **Adicionar CSS do CTA final e footer:**

```css
.cta-final { position: relative; z-index: 1; padding: 100px 0; text-align: center; background: var(--orange); }
.cta-final h2 {
  font-family: 'Satoshi', sans-serif; font-size: clamp(32px, 4vw, 52px);
  font-weight: 900; letter-spacing: -0.03em; margin-bottom: 16px; color: #fff;
}
.cta-final p { font-size: 18px; color: rgba(255,255,255,0.8); max-width: 480px; margin: 0 auto 40px; line-height: 1.6; }
.btn-cta-white {
  background: #fff; color: var(--orange); border: none;
  padding: 15px 36px; border-radius: 10px; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: all 0.25s; font-family: inherit;
  display: inline-flex; align-items: center; gap: 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
}
.btn-cta-white:hover { background: #FFF5F0; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.25); }

footer {
  position: relative; z-index: 1; background: #09090E;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 32px 0;
}
.footer-inner {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 20px;
}
.footer-copy { font-size: 13px; color: var(--text3); }
.footer-links { display: flex; gap: 22px; }
.footer-links a { font-size: 13px; color: var(--text3); text-decoration: none; transition: color 0.2s; }
.footer-links a:hover { color: var(--text2); }
```

- [ ] **Adicionar HTML do CTA final + footer:**

```html
<section class="cta-final">
  <div class="container">
    <h2>Pronto para entregar<br>no automático?</h2>
    <p>Crie sua conta grátis em menos de 2 minutos. Sem cartão de crédito.</p>
    <button class="btn-cta-white" onclick="openModal('basic')">
      Criar conta grátis <i class="ti ti-arrow-right"></i>
    </button>
  </div>
</section>

<footer>
  <div class="container">
    <div class="footer-inner">
      <div>
        <img src="/img/logo-horizontal.png" alt="Vaultly" style="height:40px;width:auto;opacity:0.9;">
      </div>
      <span class="footer-copy">© 2026 Vaultly. Todos os direitos reservados.</span>
      <div class="footer-links">
        <a href="#">Termos</a>
        <a href="#">Privacidade</a>
        <a href="#">Suporte</a>
        <a href="#" onclick="openLoginModal();return false;">Entrar</a>
      </div>
    </div>
  </div>
</footer>
```

- [ ] **Adicionar CSS do modal de autenticação:**

```css
/* Modal auth */
.auth-overlay {
  display: none; position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
  align-items: center; justify-content: center; padding: 20px;
}
.auth-overlay.open { display: flex; }
.auth-box {
  background: var(--bg2); border: 1px solid var(--border2);
  border-radius: var(--radius-xl); width: 100%; max-width: 420px;
  overflow: hidden; box-shadow: var(--shadow-lg);
  animation: fadeInUp 0.3s ease both;
}
.auth-header {
  padding: 28px 28px 0;
  display: flex; align-items: flex-start; justify-content: space-between;
}
.auth-header h2 {
  font-family: 'Satoshi', sans-serif; font-size: 22px;
  font-weight: 800; letter-spacing: -0.5px;
}
.auth-close {
  background: none; border: none; color: var(--text3);
  font-size: 20px; cursor: pointer; padding: 4px;
  border-radius: 6px; transition: color 0.2s;
}
.auth-close:hover { color: var(--text); }
.auth-tabs {
  display: flex; gap: 0; padding: 20px 28px 0;
  border-bottom: 1px solid var(--border);
}
.auth-tab {
  padding: 8px 18px; font-size: 14px; font-weight: 600;
  cursor: pointer; color: var(--text3); border-bottom: 2px solid transparent;
  transition: all 0.2s; margin-bottom: -1px; background: none; border-top: none; border-left: none; border-right: none;
  font-family: inherit;
}
.auth-tab.active { color: var(--orange); border-bottom-color: var(--orange); }
.auth-body { padding: 24px 28px 28px; }
.form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.form-label { font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; }
.form-input {
  background: var(--bg3); border: 1px solid var(--border2);
  color: var(--text); padding: 10px 14px; border-radius: 8px;
  font-size: 14px; font-family: inherit; transition: border-color 0.2s;
  outline: none;
}
.form-input:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(255,107,53,0.15); }
.btn-submit {
  width: 100%; padding: 12px; background: var(--orange); color: #fff;
  border: none; border-radius: 9px; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; font-family: inherit; margin-top: 4px;
}
.btn-submit:hover { background: #FF7A4A; transform: translateY(-1px); }
.auth-error, .auth-success {
  padding: 10px 14px; border-radius: 7px; font-size: 13px;
  margin-bottom: 14px; display: none;
}
.auth-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: var(--red); }
.auth-success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: var(--emerald); }
```

- [ ] **Adicionar HTML do modal de autenticação (preservar IDs e lógica):**

```html
<div id="authOverlay" class="auth-overlay" onclick="if(event.target===this)closeAuthModal()">
  <div class="auth-box">
    <div class="auth-header">
      <h2 id="auth-modal-title">Criar conta grátis</h2>
      <button class="auth-close" onclick="closeAuthModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="auth-tabs">
      <button class="auth-tab active" id="tab-reg" onclick="switchAuthTab('register')">Criar conta</button>
      <button class="auth-tab" id="tab-log" onclick="switchAuthTab('login')">Entrar</button>
    </div>
    <div class="auth-body">
      <!-- Register -->
      <div id="auth-register">
        <div id="msgError" class="auth-error"></div>
        <div id="msgSuccess" class="auth-success"></div>
        <div id="formArea">
          <div class="form-group">
            <label class="form-label">Nome</label>
            <input type="text" id="regName" class="form-input" placeholder="Seu nome completo" autocomplete="name"/>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="regEmail" class="form-input" placeholder="seu@email.com" autocomplete="email"/>
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <div style="position:relative;">
              <input type="password" id="regPassword" class="form-input" placeholder="Mínimo 8 caracteres" style="width:100%;padding-right:40px;" autocomplete="new-password"/>
              <button type="button" onclick="togglePassword()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text3);">
                <i id="eyeIcon" class="ti ti-eye"></i>
              </button>
            </div>
          </div>
          <button class="btn-submit" id="regBtn" onclick="handleRegister()">Criar conta grátis</button>
        </div>
      </div>
      <!-- Login -->
      <div id="auth-login" style="display:none;">
        <div id="login-msg-error" class="auth-error"></div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" id="loginEmail" class="form-input" placeholder="seu@email.com" autocomplete="email" onkeydown="if(event.key==='Enter')handleLogin()"/>
        </div>
        <div class="form-group">
          <label class="form-label">Senha</label>
          <input type="password" id="loginPassword" class="form-input" placeholder="Sua senha" autocomplete="current-password" onkeydown="if(event.key==='Enter')handleLogin()"/>
        </div>
        <button class="btn-submit" id="loginBtn" onclick="handleLogin()">Entrar</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Adicionar CSS responsivo:**

```css
@media (max-width: 900px) {
  nav { padding: 0 20px; }
  .nav-links { display: none; }
  .hiw-steps { flex-direction: column; align-items: center; gap: 32px; }
  .hiw-connector { display: none; }
  .bento { grid-template-columns: 1fr; }
  .bento-card.wide { grid-column: span 1; }
  .pricing-grid { grid-template-columns: repeat(2, 1fr); }
  .plan-card.popular { transform: none; }
}
@media (max-width: 600px) {
  .pricing-grid { grid-template-columns: 1fr; }
  .footer-inner { flex-direction: column; align-items: center; text-align: center; }
}
```

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing cta-final footer e modal auth"
```

---

### Task 6: JavaScript da landing page

**Files:**
- Modify: `public/landing.html`

- [ ] **Copiar verbatim todas as funções JS do arquivo original** (`public/landing.html` antigo). As funções a preservar são:
  - `setBilling(type)` — toggle mensal/anual, atualiza preços, mostra/oculta Starter e Business
  - `openAuthModal()`, `closeAuthModal()`, `closeModal()`, `closeLoginModal()`
  - `switchAuthTab(tab)`
  - `openModal(plan)`
  - `togglePassword()`
  - `handleRegister()`
  - `handleLogin()`
  - Navbar scroll listener

- [ ] **Adicionar scroll-reveal IntersectionObserver:**

```html
<script>
/* Billing Toggle */
let billing = 'monthly';
const prices = {
  monthly: { free: 0, starter: 37, basic: 77, pro: 147, business: 247 },
  annual:  { free: 0, starter: 37, basic: 64, pro: 122, business: 247 }
};

function setBilling(type) {
  billing = type;
  var isAnnual = type === 'annual';
  document.getElementById('toggleMonthly').classList.toggle('active', !isAnnual);
  document.getElementById('toggleAnnual').classList.toggle('active', isAnnual);
  document.getElementById('discountBadge').style.display = isAnnual ? 'flex' : 'none';
  document.getElementById('price-free').textContent     = prices[type].free;
  document.getElementById('price-starter').textContent  = prices[type].starter;
  document.getElementById('price-basic').textContent    = prices[type].basic;
  document.getElementById('price-pro').textContent      = prices[type].pro;
  document.getElementById('price-business').textContent = prices[type].business;
  var annuals = {
    basic:    { orig: 'R$77/mês',  save: 'Economize R$156/ano' },
    pro:      { orig: 'R$147/mês', save: 'Economize R$300/ano' },
    business: { orig: 'R$297/mês', save: 'Economize R$600/ano' }
  };
  ['basic','pro','business'].forEach(function(p) {
    var el = document.getElementById('annual-' + p);
    if (!el) return;
    el.innerHTML = isAnnual
      ? '<span class="plan-original">' + annuals[p].orig + '</span><span class="plan-save">— ' + annuals[p].save + '</span>'
      : '';
  });
  document.getElementById('annual-free').innerHTML    = '';
  document.getElementById('annual-starter').innerHTML = '';
  var starterCard  = document.getElementById('lp-card-starter');
  var businessCard = document.getElementById('lp-card-business');
  if (starterCard)  starterCard.style.display  = isAnnual ? 'none'  : 'block';
  if (businessCard) businessCard.style.display = isAnnual ? 'block' : 'none';
}

/* — Demais funções: copiar verbatim do arquivo original — */
/* openAuthModal, closeAuthModal, switchAuthTab, openModal, togglePassword,
   handleRegister, handleLogin, navbar scroll listener, scroll-reveal observer */

/* Scroll-reveal */
(function() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.07, rootMargin: '0px 0px -48px 0px' });
  document.querySelectorAll('.reveal').forEach(function(el) { obs.observe(el); });
})();

window.addEventListener('scroll', function() {
  document.getElementById('main-nav').style.background =
    window.scrollY > 40 ? 'rgba(13,15,24,0.97)' : 'rgba(13,15,24,0.8)';
});
</script>
</body>
</html>
```

- [ ] **Verificar no browser:** abrir `https://vaultly.digital` após deploy. Confirmar:
  - Navbar fixa e visível
  - Hero sem orbs/floating badges
  - Toggle mensal/anual funciona e oculta/mostra planos corretos
  - Modal de cadastro abre e fecha
  - Scroll-reveal ativo nas seções

- [ ] **Commit:**
```bash
git add public/landing.html
git commit -m "feat: landing JS preservado e scroll-reveal"
```

---

## Fase 2 — Painel do Usuário

### Task 7: CSS base do painel (tokens, layout, sidebar, topbar)

**Files:**
- Create: `public/index.html` (novo, começa vazio — JS copiado só na Task 12)

- [ ] **Criar shell do arquivo com head, fonts e tokens:**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Vaultly — Painel de Controle</title>
<link rel="icon" type="image/png" href="/img/logo-icon.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0B1020; --bg2: #111828; --bg3: #172035; --bg4: #1E2A42;
  --border: rgba(255,255,255,0.06); --border2: rgba(255,255,255,0.11);
  --orange: #FF6B35; --amber: #FF9F1C; --orange-dim: rgba(255,107,53,0.1);
  --emerald: #22C55E; --emerald-dim: rgba(34,197,94,0.12);
  --red: #EF4444; --red-dim: rgba(239,68,68,0.12);
  --yellow: #F59E0B; --yellow-dim: rgba(245,158,11,0.12);
  --text: #F8FAFC; --text2: #94A3B8; --text3: #3D4F6E;
  --radius: 10px; --radius-lg: 14px; --radius-xl: 20px;
}

html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 99px; }
```

- [ ] **Adicionar CSS do layout principal:**

```css
.app { display: flex; height: 100vh; overflow: hidden; position: relative; z-index: 1; }

/* Sidebar */
.sidebar { width: 220px; flex-shrink: 0; background: var(--bg2); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.sidebar-logo { display: flex; align-items: center; padding: 20px 16px 18px; border-bottom: 1px solid var(--border); }
.sidebar-logo img { height: 38px; width: auto; }
.nav-wrap { padding: 14px 10px; flex: 1; overflow-y: auto; }
.nav-section { font-size: 10px; color: var(--text3); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 8px 6px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: var(--radius); cursor: pointer; color: var(--text2);
  font-size: 13px; font-weight: 500; transition: all 0.2s;
  border: none; background: none; width: 100%; text-align: left; margin-bottom: 2px;
}
.nav-item:hover { color: var(--text); background: rgba(255,255,255,0.04); }
.nav-item.active { color: #fff; background: var(--orange-dim); border-left: 2px solid var(--orange); padding-left: 10px; }
.nav-item.active i { color: var(--orange); }
.nav-item i { font-size: 17px; flex-shrink: 0; }
.nav-badge { margin-left: auto; background: var(--red); color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; }

.sidebar-footer { padding: 12px 10px; border-top: 1px solid var(--border); }
.user-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius); background: rgba(255,255,255,0.03); border: 1px solid var(--border); }
.user-avatar { width: 32px; height: 32px; border-radius: 8px; background: var(--orange); display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; font-weight: 700; font-family: 'Satoshi', sans-serif; }
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 12px; font-weight: 600; }
.user-role { font-size: 10px; color: var(--text3); font-family: 'JetBrains Mono', monospace; }
.logout-btn { background: none; border: none; cursor: pointer; color: var(--text3); padding: 4px; transition: color 0.2s; border-radius: 6px; }
.logout-btn:hover { color: var(--red); }
```

- [ ] **Adicionar CSS do main + topbar:**

```css
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.topbar { height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 28px; background: rgba(11,16,32,0.7); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); gap: 8px; }
.content { flex: 1; overflow-y: auto; padding: 28px; }
.section { display: none; }
.section.active { display: block; animation: fadeUp 0.22s ease; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-family: 'Satoshi', sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -0.6px; }
.page-sub { font-size: 12px; color: var(--text2); margin-top: 3px; }
```

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel shell — tokens, layout, sidebar, topbar"
```

---

### Task 8: CSS de componentes (cards, botões, forms, tabelas, badges)

**Files:**
- Modify: `public/index.html`

- [ ] **Adicionar CSS dos stat cards:**

```css
@keyframes skeleton-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 20px; }
.stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 22px; position: relative; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; }
.stat-card:hover { border-color: var(--border2); }
.stat-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 17px; }
.stat-icon.cyan    { background: rgba(56,189,248,0.12); color: #38BDF8; }
.stat-icon.emerald { background: var(--emerald-dim); color: var(--emerald); }
.stat-icon.red     { background: var(--red-dim); color: var(--red); }
.stat-icon.indigo  { background: rgba(99,102,241,0.12); color: #818CF8; }
.stat-icon.orange  { background: var(--orange-dim); color: var(--orange); }
.stat-label { font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; margin-bottom: 5px; }
.stat-val { font-family: 'Satoshi', sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -1px; }
.stat-sub { font-size: 11px; color: var(--text3); margin-top: 3px; }
.stat-val.loading { background: linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%); background-size: 400px 100%; animation: skeleton-shimmer 1.4s ease-in-out infinite; border-radius: 5px; color: transparent !important; min-width: 40px; min-height: 32px; display: inline-block; }
```

- [ ] **Adicionar CSS de cards, botões, forms:**

```css
/* Cards */
.card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 18px; }
.card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.card-title { display: flex; align-items: center; gap: 8px; font-family: 'Satoshi', sans-serif; font-size: 13px; font-weight: 700; }
.card-title i { color: var(--orange); font-size: 16px; }
.card-body { padding: 18px 20px; }
.grad-line { height: 1px; background: linear-gradient(90deg, var(--orange) 0%, transparent 100%); margin: 0; opacity: 0.3; }

/* Botões */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.2s; white-space: nowrap; }
.btn-primary { background: var(--orange); color: #fff; box-shadow: 0 2px 12px rgba(255,107,53,0.3); }
.btn-primary:hover { background: #FF7A4A; box-shadow: 0 4px 20px rgba(255,107,53,0.45); transform: translateY(-1px); }
.btn-ghost { background: rgba(255,255,255,0.04); color: var(--text2); border: 1px solid var(--border2); }
.btn-ghost:hover { color: var(--text); background: rgba(255,255,255,0.08); }
.btn-danger { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,0.25); }
.btn-danger:hover { background: rgba(239,68,68,0.2); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-xs { padding: 3px 7px; font-size: 11px; }

/* Forms */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group.full { grid-column: 1 / -1; }
.form-label { font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; }
.form-input, .form-select, .form-textarea { background: rgba(255,255,255,0.03); border: 1px solid var(--border2); color: var(--text); padding: 9px 12px; border-radius: 7px; font-size: 13px; font-family: inherit; transition: border-color 0.2s; outline: none; width: 100%; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(255,107,53,0.12); }
.form-textarea { resize: vertical; min-height: 80px; }
.form-hint { font-size: 11px; color: var(--text3); }

/* Tabelas */
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; border-bottom: 1px solid var(--border); }
.data-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: rgba(255,255,255,0.02); }

/* Status badges */
.badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; }
.badge-green  { background: var(--emerald-dim); color: var(--emerald); border: 1px solid rgba(34,197,94,0.25); }
.badge-red    { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,0.25); }
.badge-yellow { background: var(--yellow-dim); color: var(--yellow); border: 1px solid rgba(245,158,11,0.25); }
.badge-gray   { background: rgba(255,255,255,0.05); color: var(--text3); border: 1px solid var(--border2); }
.badge-orange { background: var(--orange-dim); color: var(--orange); border: 1px solid rgba(255,107,53,0.25); }

/* Toggle rows */
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--border); }
.toggle-row:last-child { border-bottom: none; }
.toggle-info .t-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.toggle-info .t-desc  { font-size: 12px; color: var(--text2); }
.toggle { width: 40px; height: 22px; border-radius: 99px; background: var(--bg4); border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background 0.2s; }
.toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--text3); transition: all 0.2s; }
.toggle.on { background: var(--orange); }
.toggle.on::after { left: 21px; background: #fff; }

/* Misc */
.status-dot { display: flex; align-items: center; gap: 6px; font-size: 11px; font-family: 'JetBrains Mono', monospace; }
.status-dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--emerald); box-shadow: 0 0 8px var(--emerald); animation: pulse 2s infinite; }
.var-pill { display: inline-flex; align-items: center; background: rgba(99,102,241,0.1); color: #818CF8; border: 1px solid rgba(99,102,241,0.2); border-radius: 5px; padding: 2px 9px; font-size: 11px; font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.15s; user-select: none; }
.var-pill:hover { background: rgba(99,102,241,0.2); }
.upload-zone { border: 2px dashed var(--border2); border-radius: var(--radius-lg); padding: 28px; text-align: center; cursor: pointer; transition: all 0.2s; }
.upload-zone:hover { border-color: var(--orange); background: var(--orange-dim); }
.upload-icon { font-size: 28px; color: var(--text3); margin-bottom: 8px; }
.upload-title { font-weight: 600; margin-bottom: 4px; }
.upload-sub { font-size: 12px; color: var(--text3); }
.pill-active   { background: rgba(34,197,94,0.12); color: var(--emerald); border: 1px solid rgba(34,197,94,0.25); font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
.pill-inactive { background: rgba(255,255,255,0.04); color: var(--text3); border: 1px solid var(--border2); font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
```

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel CSS componentes stat-cards cards botoes forms tabelas"
```

---

### Task 9: Tela de login + estrutura HTML do app

**Files:**
- Modify: `public/index.html`

- [ ] **Fechar `</style>` e adicionar CSS da tela de login:**

```css
/* Login screen */
.login-screen {
  position: fixed; inset: 0; z-index: 500;
  background: var(--bg);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.login-screen::before {
  content: '';
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 80%);
}
.login-card {
  background: var(--bg2); border: 1px solid var(--border2);
  border-radius: var(--radius-xl); padding: 36px;
  width: 100%; max-width: 380px; position: relative; z-index: 1;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}
.login-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
.login-logo-mark { width: 36px; height: 36px; border-radius: 9px; background: var(--orange); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(255,107,53,0.4); }
.login-logo-mark i { color: #fff; font-size: 18px; }
.login-logo-name { font-family: 'Satoshi', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.4px; }
.login-title { font-family: 'Satoshi', sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; }
.login-sub { font-size: 13px; color: var(--text2); margin-bottom: 24px; }
.login-error-msg { padding: 10px 14px; background: var(--red-dim); border: 1px solid rgba(239,68,68,0.3); border-radius: 7px; color: var(--red); font-size: 13px; margin-bottom: 14px; display: none; }
</style>
```

- [ ] **Adicionar HTML da tela de login (preservar IDs `login-screen`, `login-user`, `login-pass`, `login-error`):**

```html
<body>

<!-- LOGIN -->
<div id="login-screen" class="login-screen">
  <div class="login-card">
    <div class="login-logo">
      <div class="login-logo-mark"><i class="ti ti-package"></i></div>
      <span class="login-logo-name">Vaultly</span>
    </div>
    <div class="login-title">Bem-vindo de volta</div>
    <div class="login-sub">Entre com sua conta para acessar o painel</div>
    <div id="login-error" class="login-error-msg"></div>
    <div class="form-group" style="margin-bottom:14px;">
      <label class="form-label">Email</label>
      <input type="email" id="login-user" class="form-input" placeholder="seu@email.com" autocomplete="email" onkeydown="if(event.key==='Enter')doLogin()"/>
    </div>
    <div class="form-group" style="margin-bottom:20px;">
      <label class="form-label">Senha</label>
      <input type="password" id="login-pass" class="form-input" placeholder="Sua senha" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()"/>
    </div>
    <button class="btn btn-primary" style="width:100%;padding:11px;font-size:14px;justify-content:center;" onclick="doLogin()">
      Entrar no painel
    </button>
    <p style="text-align:center;margin-top:16px;font-size:12px;color:var(--text3);">
      Sem conta? <a href="https://vaultly.digital" style="color:var(--orange);text-decoration:none;font-weight:600;">Criar conta grátis</a>
    </p>
  </div>
</div>
```

- [ ] **Adicionar HTML do APP (preservar id="app") com sidebar e topbar:**

```html
<!-- APP -->
<div class="app" id="app" style="display:none;">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <img src="/img/logo-horizontal.png" alt="Vaultly" style="height:38px;width:auto;">
    </div>
    <div class="nav-wrap">
      <div class="nav-section">Principal</div>
      <button class="nav-item active" onclick="switchTab('dashboard',this)"><i class="ti ti-layout-dashboard"></i> Dashboard</button>
      <button class="nav-item" onclick="switchTab('produtos',this)"><i class="ti ti-package"></i> Produtos</button>
      <button class="nav-item" onclick="switchTab('entregas',this)"><i class="ti ti-mail-forward"></i> Entregas</button>
      <div class="nav-section">Sistema</div>
      <button class="nav-item" onclick="switchTab('webhook',this)"><i class="ti ti-webhook"></i> Webhook</button>
      <button class="nav-item" onclick="switchTab('email',this)"><i class="ti ti-mail"></i> Email</button>
      <button class="nav-item" onclick="switchTab('config',this)"><i class="ti ti-settings"></i> Configurações</button>
      <div id="admin-nav-section" style="display:none;">
        <div class="nav-section">Administração</div>
        <a class="nav-item" href="/admin.html" style="text-decoration:none;"><i class="ti ti-shield-check"></i> Painel Admin</a>
      </div>
    </div>
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar" id="user-avatar">A</div>
        <div class="user-info">
          <div class="user-name" id="user-name-label">Usuário</div>
          <div class="user-role" id="user-plan-label" style="color:var(--amber);font-size:10px;font-family:'JetBrains Mono',monospace;"></div>
        </div>
        <button class="logout-btn" onclick="doLogout()" title="Sair"><i class="ti ti-logout" style="font-size:16px;"></i></button>
      </div>
    </div>
  </aside>

  <div class="main">
    <div class="topbar">
      <div id="tb-deliveries-today" style="display:none;align-items:center;gap:5px;background:var(--emerald-dim);border:1px solid rgba(34,197,94,0.2);padding:4px 10px;border-radius:99px;font-size:12px;color:var(--emerald);font-weight:600;cursor:default;" title="Entregas hoje">
        <i class="ti ti-package" style="font-size:13px;"></i>
        <span id="tb-today-count">0</span>
      </div>
      <div id="tb-unmatched" style="display:none;align-items:center;gap:5px;background:var(--yellow-dim);border:1px solid rgba(245,158,11,0.25);padding:4px 10px;border-radius:99px;font-size:12px;color:var(--yellow);font-weight:600;cursor:pointer;" onclick="switchTabById('produtos')">
        <i class="ti ti-alert-triangle" style="font-size:13px;"></i>
        <span id="tb-unmatched-count">0</span> pendentes
      </div>
      <span id="topbar-btn" style="display:none;"></span>
    </div>
    <div class="content">
      <!-- SEÇÕES INSERIDAS NAS TASKS 10-11 -->
    </div>
  </div>
</div>
```

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel login-screen e estrutura HTML app/sidebar/topbar"
```

---

### Task 10: Dashboard, Produtos e Entregas (HTML das seções)

**Files:**
- Modify: `public/index.html`

- [ ] **Adicionar seção Dashboard (preservar todos os IDs obrigatórios):**

```html
<!-- ── DASHBOARD ── -->
<div id="tab-dashboard" class="section active">
  <div class="page-header">
    <div>
      <div class="page-title">Dashboard</div>
      <div class="page-sub">visão geral em tempo real</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="loadDashboard()"><i class="ti ti-refresh"></i> Atualizar</button>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-icon cyan"><i class="ti ti-calendar-stats"></i></div>
      <div class="stat-label">Vendas hoje</div>
      <div class="stat-val loading" id="s-today"> </div>
      <div class="stat-sub">entregas disparadas</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon emerald"><i class="ti ti-circle-check"></i></div>
      <div class="stat-label">Entregues</div>
      <div class="stat-val loading" id="s-delivered"> </div>
      <div class="stat-sub">emails enviados com sucesso</div>
    </div>
    <div class="stat-card" id="stat-failed-card">
      <div class="stat-icon red"><i class="ti ti-alert-triangle"></i></div>
      <div class="stat-label">Falhas</div>
      <div class="stat-val loading" id="s-failed" style="color:var(--red);"> </div>
      <div class="stat-sub">necessitam atenção</div>
    </div>
    <div class="stat-card" id="stat-products-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <div class="stat-icon indigo" id="products-icon"><i class="ti ti-packages"></i></div>
          <div class="stat-label">Produtos</div>
          <div class="stat-val loading" id="s-products"> </div>
          <div class="stat-sub" id="products-sub">cadastrados</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding-top:2px;flex-shrink:0;">
          <div style="font-size:9px;color:var(--text3);font-family:'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;">24h · vendas</div>
          <svg id="sparkline-svg" width="80" height="44" viewBox="0 0 80 44" fill="none" style="display:block;"></svg>
        </div>
      </div>
    </div>
  </div>

  <div id="limit-warning-banner" style="display:none;margin-bottom:16px;"></div>

  <div class="card">
    <div class="card-header">
      <div class="card-title"><i class="ti ti-clock-hour-3"></i> Últimas entregas</div>
    </div>
    <div class="card-body" style="padding:0;">
      <table class="data-table">
        <thead><tr><th>Cliente</th><th>Produto</th><th>Plataforma</th><th>Data</th><th>Status</th></tr></thead>
        <tbody id="recent-deliveries">
          <tr><td colspan="5" style="text-align:center;color:var(--text3);padding:24px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
```

- [ ] **Adicionar seção Produtos (preservar IDs: `products-grid`, `unmatched-section`, `unmatched-list`, `unmatched-badge`, `platform-import-list`):**

Copiar a estrutura do arquivo original, substituindo apenas classes CSS pelos novos tokens (substituir `var(--indigo)` por `var(--orange)`, `var(--cyan)` onde for acento de marca por `var(--orange)` ou `var(--amber)`).

A estrutura HTML das seções Produtos, Entregas e Webhook é extensa e deve ser portada com manutenção dos IDs. O padrão é:

```html
<div id="tab-produtos" class="section">
  <div class="page-header">...</div>
  <!-- conteúdo preservado do original, IDs mantidos -->
</div>
```

- [ ] **Verificação de IDs após copiar:** Executar no browser console após carregar a página:

```javascript
['products-grid','unmatched-section','unmatched-list','platform-import-list',
 'deliveries-table','deliveries-upgrade-banner','webhook-log','recent-deliveries'].forEach(id => {
   if (!document.getElementById(id)) console.error('MISSING ID:', id);
 });
```

Deve retornar sem erros.

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel secoes dashboard produtos entregas"
```

---

### Task 11: Webhook, Email, Config e Onboarding (HTML das seções)

**Files:**
- Modify: `public/index.html`

Seguir o mesmo padrão da Task 10: portar o HTML das seções do arquivo original, mantendo todos os IDs obrigatórios listados no cabeçalho deste documento, substituindo referências visuais de `--indigo`/`--cyan` por `--orange` onde apropriado.

**IDs críticos a preservar nesta task:**
`cfg-kiwify-secret`, `cfg-yampi-secret`, `cfg-yampi-token`, `cfg-yampi-alias`,
`kiwify-url-input`, `url-kiwify`, `url-yampi`, `cfg-from-name`, `cfg-from-address`,
`cfg-resend-key`, `resend-infra-lock`, `resend-infra-badge`, `cfg-email-template`,
`email-template-lock`, `email-template-plan-badge`, `email-status-label`, `email-status-dot`,
`cfg-plan-name`, `cfg-plan-sub`, `cfg-billing-actions`, `new-pass`, `confirm-pass`,
`ob-*` (todos os IDs do onboarding)

- [ ] **Verificação de IDs após copiar:**

```javascript
['cfg-kiwify-secret','cfg-from-name','cfg-resend-key','email-template-lock',
 'cfg-plan-name','onboarding-modal','ob-btn-next','ob-btn-back'].forEach(id => {
   if (!document.getElementById(id)) console.error('MISSING ID:', id);
 });
```

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel secoes webhook email config onboarding"
```

---

### Task 12: Modal de upgrade + Modal de produto

**Files:**
- Modify: `public/index.html`

- [ ] **Copiar verbatim o HTML do upgrade modal** do arquivo original (preservar `id="upgrade-modal"`, `id="um-card-starter"`, `id="um-card-business"`, `id="um-tog-monthly"`, `id="um-tog-annual"`, `id="upgrade-error"`, todos os `btn-checkout-*`).

  Substituir apenas a cor do header de gradiente indigo/cyan para laranja sólido:
  ```html
  <!-- Trocar: background:linear-gradient(135deg,#6C63FF,#38BDF8) -->
  <!-- Por: background:var(--orange) -->
  ```

- [ ] **Copiar verbatim o HTML do modal de produto** (preservar `id="modal-bg"`, `id="modal-title"`, `id="m-name"`, `id="m-file"`, `id="m-editing-id"`, `id="save-btn"`, `id="upload-zone"`).

- [ ] **Verificação final de IDs — rodar no console do browser:**

```javascript
const required = ['upgrade-modal','um-card-starter','um-card-business',
 'um-tog-monthly','um-tog-annual','upgrade-error','btn-checkout-starter',
 'btn-checkout-basic','btn-checkout-pro','btn-checkout-business',
 'modal-bg','modal-title','m-name','m-file','m-editing-id','save-btn'];
required.forEach(id => {
  if (!document.getElementById(id)) console.error('MISSING:', id);
});
```

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel modais upgrade e produto"
```

---

### Task 13: JavaScript do painel — copiar verbatim + verificação funcional

**Files:**
- Modify: `public/index.html`

- [ ] **Adicionar bloco `<script>` com TODO o JavaScript do arquivo original**, copiado verbatim a partir da linha `let authToken = ...` até o fim do `</script>`.

  **Atenção:** copiar todo o bloco sem modificar nenhuma linha de lógica. A única mudança permitida é substituir referências à cor `#6C63FF` (indigo) nos estilos inline gerados dinamicamente por `var(--orange)`.

  Exemplo de linha que precisa de ajuste:
  ```js
  // Original:
  toast.style.cssText = '...background:linear-gradient(135deg,#10B981,#38BDF8)...';
  // Manter igual — é o toast de sucesso de upgrade, cor verde-ciano está correta
  ```

- [ ] **Adicionar auto-login check no final do script (verificar que existe no original):**

```javascript
// Deve existir no original — verificar e manter:
(async function() {
  if (authToken) {
    const me = await apiFetch('/api/auth/me');
    if (me.success) { currentUser = me.user; showApp(); }
    else { authToken = null; localStorage.removeItem('vaultly_token'); }
  }
})();
```

- [ ] **Verificação funcional — testar no browser:**

  1. Abrir `/app` → tela de login aparece (fundo com grade de pontos, card centralizado)
  2. Login com credenciais válidas → app aparece, sidebar com nome do usuário
  3. Dashboard carrega → stat cards exibem skeleton → números contam para cima
  4. Produtos tab → lista ou estado vazio correto
  5. Webhook tab → URLs copiáveis visíveis
  6. Email tab → campo de Resend API key (bloqueado no Free/Starter)
  7. Config tab → card de assinatura com plano atual
  8. Clicar "Fazer upgrade" → modal abre com 3 planos (Starter/Basic/Pro no mensal)
  9. Trocar para Anual no modal → Starter desaparece, Business aparece

- [ ] **Commit:**
```bash
git add public/index.html
git commit -m "feat: painel JS completo preservado — redesign frontend concluido"
```

---

## Checklist final de regressão

Antes de considerar o trabalho concluído, verificar:

- [ ] Paleta laranja aplicada: **zero** ocorrências de `#6C63FF` ou `#38BDF8` nas propriedades visuais da landing
- [ ] Sem orbs/blobs: **zero** ocorrências de `.orb` ou `orbFloat` na landing
- [ ] Sem floating badges no hero: **zero** ocorrências de `.float-badge`
- [ ] Modal de login/cadastro da landing abre e fecha corretamente
- [ ] Toggle mensal/anual da landing oculta/exibe planos corretos
- [ ] Login no painel funcional (`doLogin` disponível, sem SyntaxError no console)
- [ ] Dashboard carrega stats com skeleton e count-up
- [ ] Checkout Stripe funcional: botão abre URL do Stripe
- [ ] Plano do usuário exibido corretamente na sidebar e Config tab
- [ ] Todos os 87 IDs presentes no DOM (rodar script de verificação da Task 12)
