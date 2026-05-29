# Vaultly — Redesign Frontend Completo

**Data:** 2026-05-29
**Escopo:** Landing page (`/`) + Painel do usuário (`/app`)
**Admin:** Fora do escopo (uso interno)

---

## Decisões de design

| Decisão | Escolha |
|---|---|
| Direção visual | B — Energia Laranja / Brasileiro |
| Painel interno | Neutro escuro + laranja pontual (logo, nav ativo, upgrade CTA) |
| Escopo | Reescrita completa do zero |
| Depoimentos | Removidos (sem fotos reais, não convencem) |

---

## Sistema visual

### Paleta de cores

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0D0F18` | Fundo principal |
| `--bg2` | `#111320` | Cards, sidebar |
| `--bg3` | `#171A2E` | Hover states, inputs |
| `--border` | `rgba(255,255,255,0.07)` | Bordas sutis |
| `--border2` | `rgba(255,255,255,0.12)` | Bordas com mais contraste |
| `--orange` | `#FF6B35` | Primário — CTAs, destaques, logo |
| `--amber` | `#FF9F1C` | Acento quente — números, badges |
| `--text` | `#F8FAFC` | Texto principal |
| `--text2` | `#94A3B8` | Texto secundário |
| `--text3` | `#475569` | Placeholders, labels |
| `--emerald` | `#22C55E` | Sucesso, entregue |
| `--red` | `#EF4444` | Erro, falha |
| `--yellow` | `#F59E0B` | Atenção, retry |

### Tipografia

- **Headlines:** Satoshi (weight 700–900, letter-spacing -0.03em)
- **Corpo:** Inter (weight 400–600)
- **Mono:** JetBrains Mono (labels, código, stats)

### Eliminados por completo

- Gradiente `indigo → cyan` (#6C63FF → #38BDF8) — não aparece mais em nenhuma página
- `backdrop-filter: blur()` em cards — removido (exceto navbar)
- Orbs/blobs flutuantes coloridos de fundo
- `noise` overlay via SVG
- Classe `.grad-text` com gradiente roxo

---

## Landing Page — Nova estrutura

### Seção 1: Hero

**Objetivo:** Comunicar o valor em 3 segundos, gerar o primeiro clique.

- Fundo: `#0D0F18` com grade de pontos sutil (`radial-gradient` mask)
- Sem orbs, sem floating badges, sem browser mockup
- Headline: Satoshi 72px, peso 900, letra-spacing -3%, branco puro
  - Ex: *"Seu produto digital entregue. Automático. Sempre."*
- Subtítulo: Inter 18px, `--text2`, máx 520px de largura
- CTA único: botão laranja sólido, 16px bold — "Criar conta grátis"
- Abaixo do CTA: linha discreta com número fixo (hardcoded, atualizado manualmente) — *"Mais de 3.200 entregas realizadas este mês"* — sem chamada de API
- Sem segundo botão "Ver como funciona" (elimina decisão, foca o clique)

### Seção 2: Problema (nova)

**Objetivo:** Criar empatia antes de vender. Quebrar o padrão de landing que vende antes de conectar.

- Fundo alternado: `#111320`
- Sem grid — layout de uma coluna, texto centrado
- Headline grande: *"Você já perdeu uma venda porque o produto não chegou?"*
- Parágrafo curto: 2–3 frases sobre a dor do infoprodutor manual
- Sem imagem ou ícone — a força é no texto

### Seção 3: Como funciona

**Objetivo:** Mostrar simplicidade do fluxo.

- 3 passos (não 4): Conectar → Cadastrar produto → Vender
- Números `01 / 02 / 03` como elemento visual grande (`--text3`, Satoshi 120px)
- Texto abaixo de cada número, sem ícones coloridos com gradiente
- Linha conectora fina e pontilhada em desktop, oculta em mobile

### Seção 4: Features — Bento Grid

**Objetivo:** Mostrar os diferenciais de forma visual e concreta.

- Layout assimétrico: 1 card largo (span 2) + 4 cards menores
- Cada card tem um mini-demo visual concreto:
  - **Retry automático** → log com 3 linhas mostrando tentativas
  - **HMAC segurança** → `✓ assinatura validada` em verde
  - **BYOK Resend** → campo de input com `re_xxx` mascarado
  - **Multi-plataforma** → dois badges: Kiwify + Yampi lado a lado
  - **Relatórios** → mini sparkline de 7 dias
- Sem ícones com fundo colorido + gradiente — só o demo inline

### Seção 5: Comparativo

- Manter conteúdo atual (Vaultly vs Concorrentes, 7 linhas)
- Reformulação visual: células sem borda lateral, só separador horizontal
- Coluna Vaultly: fundo `rgba(255,107,53,0.06)`, sem badge "Recomendado" infantil
- `✓` em `--emerald`, `✕` em `--text3` (não vermelho — concorrente não precisa parecer ruim)

### Seção 6: Preços

- Estrutura e lógica mantidas (toggle mensal/anual, 4 planos, lógica Starter/Business)
- Visual: cards com `padding: 32px`, mais espaço respirável
- Popular (Basic): borda `--orange` em vez de `--indigo`
- Botões de plano: laranja para o popular, ghost para os demais

### Seção 7: CTA Final

- Fundo: `#FF6B35` sólido (sem gradiente)
- Headline branca, Satoshi 900
- Botão: branco com texto laranja — contraste máximo
- Sem seção de depoimentos antes do CTA

### Modal de autenticação (login + cadastro)

- Overlay com `backdrop-filter: blur(8px)` sobre o fundo (única exceção justificada)
- Card centralizado, `border-radius: 12px`, fundo `--bg2`, borda `--border2`
- Header do modal: sem gradiente colorido — título em branco simples
- Tabs "Criar conta" / "Entrar" como segmentos, não badges coloridos
- Inputs com estilo do painel (focus laranja)
- Botão de submit: laranja sólido
- Fechar com `Esc` ou clique no overlay (já implementado — manter)

### Footer

- Fundo `#09090E` (quase preto)
- Logo horizontal + copyright centrado + links (Termos, Privacidade, Suporte, Entrar)
- Sem seções de links em colunas — clean e direto

---

## Painel do Usuário — Nova estrutura

### Sistema de cores (painel)

O painel usa a paleta base (`--bg`, `--bg2`, `--bg3`) com laranja apenas em:
- Logo na sidebar
- Indicador de item ativo na nav (borda esquerda `--orange`)
- Botão "Fazer upgrade" e CTAs de conversão
- Badge do plano do usuário no footer da sidebar

Tudo mais permanece: emerald para sucesso, red para falha, yellow para atenção.

### Sidebar

- Largura: 220px
- Fundo: `#0B1020` (mais escuro que o conteúdo)
- Logo: imagem horizontal existente
- Nav item ativo: `background rgba(255,107,53,0.08)`, `border-left: 2px solid #FF6B35`
- Footer da sidebar: avatar do usuário, nome, badge do plano em `--amber`, ícone de logout

### Topbar

- Altura: 48px
- Fundo: `rgba(11,16,32,0.8)` + `backdrop-filter: blur(16px)` (exceção ao blur — justificada aqui)
- Conteúdo: indicadores de status à direita (entregas hoje, produtos pendentes)

### Cards

- `border-radius: 10px` (mais quadrado, menos "bubbly")
- Sem `backdrop-filter` nos cards de conteúdo
- Borda: `1px solid --border`
- Hover: `border-color: --border2` — sem `transform: translateY`

### Stat cards

- Mantém skeleton loader + count-up animado (já implementado)
- Remove o `::after` com gradiente no topo — substituído por ícone colorido apenas
- Layout: ícone + label + valor em 3 linhas, sem decoração extra

### Formulários / inputs

- `border-radius: 7px`
- Fundo: `rgba(255,255,255,0.03)`
- Focus: `border-color: --orange`, `box-shadow: 0 0 0 3px rgba(255,107,53,0.15)`

### Tela de login

- Fundo: `--bg` com grade de pontos (mesmo hero)
- Card de login centralizado, sem gradiente no header
- Campos: email + senha, botão laranja, link "Esqueci a senha" (futuro)

---

## Arquivos a criar/substituir

| Arquivo | Ação |
|---|---|
| `public/landing.html` | Substituição completa |
| `public/index.html` | Substituição completa (preservar toda lógica JS) |
| `public/admin.html` | Sem alteração |

---

## Preservação obrigatória

Todo o JavaScript funcional deve ser preservado intacto:

- `doLogin()`, `showApp()`, `doLogout()`
- `loadDashboard()`, `loadProducts()`, `loadDeliveries()`
- `startCheckout()`, `openBillingPortal()`, `setUpgradeBilling()`
- `setBilling()` (landing)
- `countUp()`, `renderSparkline()`
- Todas as funções de webhook, email, config
- IDs de elementos HTML que o JS referencia (manter os mesmos)

---

## O que NÃO está no escopo

- Reescrita de backend
- Novos endpoints de API
- Admin panel (`/admin.html`)
- Funcionalidades novas de produto
