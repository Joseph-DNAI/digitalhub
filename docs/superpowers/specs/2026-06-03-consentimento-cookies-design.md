# Spec — Consentimento de cookies/armazenamento

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário

---

## 1. Contexto (realidade atual)

O site **não usa cookies de rastreamento/analytics/marketing**. O backend nunca seta cookie. Auth via **localStorage** (`vaultly_token`, `vaultly_admin_token`) + header `Authorization: Bearer` (o `auth.js` aceita um cookie `vaultly_token` como fallback, mas o front não o cria). Preferência de UI: `vaultly_priv`. CDNs: Google Fonts, Tabler, jsdelivr (sem analytics).

Objetivo: **informar e registrar consentimento** com um banner, **padronizar** a linguagem, deixar **preparado para o futuro** (categorias essencial + opcional) e **atualizar os Termos**.

---

## 2. Arquitetura — arquivo compartilhado

Novo `public/consent.js` **auto-contido** (injeta banner + CSS + lógica), carregado via `<script src="/consent.js" defer></script>` em: `landing.html`, `index.html`, `admin.html`, `termos.html`. DRY (um único lugar). Servido pelo static middleware existente (`/consent.js`).

Cores **hardcoded** (não depende dos tokens CSS de cada página): fundo escuro `#111828`, borda `rgba(255,255,255,0.12)`, laranja `#FF6B35`, texto claro. Classes com prefixo `vc-` para não colidir.

---

## 3. Comportamento

### Estado salvo
`localStorage['vaultly_consent']` = JSON `{ v: 1, essential: true, optional: <bool>, ts: <epoch> }`.
- Se ausente ou `v` diferente do atual → mostra o banner.
- Se presente e válido → não mostra (mas a API fica disponível).

### Banner (rodapé, discreto)
- Texto: "Usamos **armazenamento essencial** (login e preferências) e, com sua permissão, **itens opcionais** para melhorias futuras. Hoje não há rastreamento." + link "Saiba mais" → `/termos#cookies`.
- Botões: **Aceitar todos** (`optional:true`) · **Apenas essenciais** (`optional:false`) · **Personalizar** (abre o painel de toggles).
- Painel "Personalizar": dois itens —
  - **Essencial** — checkbox marcado e **desabilitado** (sempre on; necessário para o serviço).
  - **Opcional (melhorias/analytics)** — checkbox, **desligado por padrão**.
  - Botão **Salvar preferências** → grava `optional` conforme o checkbox.
- Qualquer ação salva o consentimento e esconde o banner.

### API global (gancho pro futuro)
`window.VaultlyConsent = { has(category), open(), get() }`:
- `has('essential')` → sempre `true`. `has('optional')` → o valor salvo (default `false` se nunca consentiu).
- `open()` → reexibe o banner (com os toggles refletindo o estado atual). Usado pelo link "Preferências de cookies".
- `get()` → o objeto de consentimento salvo (ou null).

> Quando adicionar analytics no futuro: checar `window.VaultlyConsent.has('optional')` antes de carregar o script.

---

## 4. Links de reabrir
- **landing.html** (footer): adicionar um link "Preferências de cookies" com `onclick="VaultlyConsent.open()"`.
- **termos.html**: na seção Cookies, um botão/link "Gerenciar preferências" → `VaultlyConsent.open()`.

---

## 5. Termos (`public/termos.html`)
Reescrever a seção **Cookies** (em Privacidade) e/ou adicionar âncora `id="cookies"`:
- Descrever **armazenamento essencial** (login via localStorage, preferências de interface) — necessário para o funcionamento, sem opt-in.
- **Itens opcionais** (melhorias/analytics) — **só com consentimento** (opt-in); **nenhum ativo atualmente**.
- Que o site **não usa cookies de rastreamento/marketing** hoje, e que terceiros (CDNs de fontes/ícones) podem definir armazenamento técnico próprio.
- Como **gerenciar**: link "Preferências de cookies" (reabre o banner) e limpar o armazenamento do navegador.
- Garantir uma âncora `id="cookies"` para o link "Saiba mais".

---

## 6. Fora de escopo
- Cookies/analytics reais (não há; só a estrutura fica pronta).
- Backend (nenhuma mudança; consentimento é client-side).
- Bloquear CDNs de terceiros antes do consentimento (técnico/essencial).

---

## 7. Critérios de sucesso
- Primeira visita (landing/painel/admin/termos): banner aparece; escolher qualquer opção salva e não repete.
- "Personalizar" mostra Essencial (travado) + Opcional (off por padrão); "Salvar preferências" grava.
- `window.VaultlyConsent.has('optional')` reflete a escolha; `open()` reabre.
- Termos descrevem o uso real e o link "Saiba mais"/"Gerenciar preferências" funciona.
- `node --check` nos scripts inline + carga do `consent.js` sem erro de sintaxe.
