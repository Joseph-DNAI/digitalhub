# Spec — Checkout personalizável (por loja)

> Data: 2026-06-05
> Status: aprovado no brainstorming, aguardando revisão final do usuário

---

## 1. Objetivo

Dar ao vendedor um checkout com a cara dele, pra passar confiança: escolher **tema** (claro/escuro) + **cor de destaque** (paleta curada), anexar a **logo** (PNG sem fundo, no topo), exibir a **garantia de 7 dias** (lateral, opcional) e um **selo Vaultly fixo e discreto** no rodapé (segurança). Config **por loja** (vale para todos os checkouts), numa nova aba **Checkout** no painel.

---

## 2. Modelo de dados (`tenants`, em `src/models/database.js`)

Config guardada no tenant (sempre existe; reusa `/api/tenants/me`). Migrações:
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_theme          TEXT DEFAULT 'dark';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_accent         TEXT DEFAULT '#FF6B35';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_logo_key       TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_show_guarantee BOOLEAN DEFAULT TRUE;
```

**Paleta curada (allowlist) de cor de destaque:** `#FF6B35` (laranja), `#3B82F6` (azul), `#22C55E` (verde), `#8B5CF6` (roxo), `#EC4899` (rosa), `#111827` (grafite). **Temas:** `light` | `dark`.

---

## 3. Backend — config + logo

### 3.1 Rota tenants (`src/routes/tenants.js`)
- `GET /me`: incluir no `data`: `checkout_theme`, `checkout_accent`, `checkout_show_guarantee` (bool) e `has_checkout_logo: !!checkout_logo_key`.
- `PUT /me`: aceitar `checkout_theme` (validar ∈ {light,dark}), `checkout_accent` (validar ∈ allowlist), `checkout_show_guarantee` (bool). **Validação:** se `checkout_theme`/`checkout_accent` vierem com valor fora do permitido, retornar 400. (Para isso, validar ANTES de montar `updateData`; não usar o caminho `allowed` genérico para esses dois — validar e setar manualmente.)
- `POST /me/checkout-logo` (multipart, `requireAuth`): usa `multer` (disco) + `storageService.uploadFile(path, originalname)` → grava o `key` em `checkout_logo_key`. Aceitar só imagens (`image/png|jpeg|webp|svg+xml`), máx ~2MB. Resp `{ success:true }`.
- `DELETE /me/checkout-logo` (`requireAuth`): limpa `checkout_logo_key` (e best-effort `deleteFile`). Resp `{ success:true }`.

### 3.2 Servir a logo + config no checkout (`src/routes/checkout.js`)
- `GET /:slug` (existente): incluir na resposta a config do tenant: `checkout: { theme, accent, show_guarantee, logo_url }`, onde `logo_url` = (tenant.checkout_logo_key ? '/api/checkout/' + slug + '/logo' : null).
- `GET /:slug/logo` (novo, público): acha o produto → tenant → se `checkout_logo_key`, `storageService.downloadFileBuffer(key)` e responde com o buffer + `Content-Type` adequado (inferir por extensão do key; default `image/png`) + cache curto. Se não houver, 404.

---

## 4. Frontend — `public/checkout.html` (aplicar a personalização)

Hoje o checkout é dark fixo. Passar a:
- **Tema:** definir as variáveis CSS por tema (light/dark) e aplicar conforme `checkout.theme`.
  - Dark: `--bg:#0B1020; --bg2:#141A2E; --text:#E8ECF5; --muted:#8A93A8; --line:#2a3350`.
  - Light: `--bg:#F1F5F9; --bg2:#FFFFFF; --text:#0F172A; --muted:#64748B; --line:#E2E8F0`.
- **Cor de destaque:** `--accent` = `checkout.accent` (botão pagar, preço, foco). Texto do botão sempre branco.
- **Logo do vendedor:** se `checkout.logo_url`, exibir no topo (acima do título), altura ~40-48px, centralizado; senão mantém o logo Vaultly atual.
- **Garantia de 7 dias:** se `checkout.show_guarantee`, um selo (ícone escudo + "Garantia de 7 dias — devolução garantida") na lateral/abaixo do card.
- **Selo Vaultly (fixo, discreto):** no rodapé do card: ícone de cadeado + "Pagamento processado com segurança pela **Vaultly**" (sempre visível; substitui/realça o texto de rodapé atual).
- Aplicar tudo no `load()` (que já busca `GET /api/checkout/:slug`).

---

## 5. Frontend — aba "Checkout" no painel (`public/index.html`)

- **Nav:** novo item **Checkout** (`switchTab('checkout')`), em "Sistema" perto da Loja. Gating: planos pagos (igual Loja). Free vê aviso de upgrade.
- **Seção `#tab-checkout`:**
  - **Tema:** dois toggles/botões (Claro / Escuro).
  - **Cor de destaque:** 6 swatches clicáveis (a selecionada fica com contorno).
  - **Logo:** input file (sugerir "PNG sem fundo") + preview da logo atual + botão remover. Upload via `POST /api/tenants/me/checkout-logo`.
  - **Garantia de 7 dias:** toggle (mostrar/ocultar).
  - **Preview ao vivo:** um mini-card que reflete tema+cor+logo+garantia em tempo real (montado em JS; não precisa ser o checkout real).
  - **Salvar:** botão que faz `PUT /api/tenants/me` com theme/accent/show_guarantee (a logo salva no upload). Toast de sucesso.
- `loadCheckoutTab()` busca `GET /api/tenants/me` e popula os controles + preview. `switchTab` chama em `'checkout'`.

---

## 6. Fora de escopo
- Personalização por produto (decidido: por loja).
- Fontes/CSS custom, cores fora da paleta, posição do selo Vaultly (fixo).
- Domínio próprio no checkout.

---

## 7. Critérios de sucesso
- O vendedor escolhe tema + cor + logo + garantia na aba Checkout, com preview ao vivo, e salva.
- O checkout público reflete a config (tema, cor, logo do vendedor, selo de garantia se ligado) e mostra o selo Vaultly fixo no rodapé.
- Cor/tema fora da allowlist são rejeitados no backend.
- A logo é servida publicamente via `/api/checkout/:slug/logo`.
- `node -c` backend + `node --check` nos scripts inline/checkout passam; suíte verde.
