# Checkout personalizável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Checkout com a cara do vendedor (tema claro/escuro + cor de destaque + logo + garantia de 7 dias opcional + selo Vaultly fixo), configurado numa aba "Checkout" por loja.

**Architecture:** Config no `tenants` (reusa `/api/tenants/me`); logo no R2 servida por rota de stream; `checkout.html` aplica a config; aba "Checkout" no painel com preview ao vivo.

**Tech Stack:** Node/Express, PostgreSQL, R2 (multer + storageService), frontends estáticos.

---

## Task 1: DB — colunas de checkout no tenant

**Files:** Modify `src/models/database.js`

- [ ] **Step 1:** No bloco de migrações incrementais (junto dos `ALTER TABLE tenants ...`), adicionar:
```sql
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_theme          TEXT DEFAULT 'dark';
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_accent         TEXT DEFAULT '#FF6B35';
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_logo_key       TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_show_guarantee BOOLEAN DEFAULT TRUE;
```
- [ ] **Step 2:** `node -c src/models/database.js && echo OK` → `OK`. Commit:
```
git add src/models/database.js
git commit -m "feat: colunas de checkout no tenant (theme/accent/logo/guarantee)"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 2: tenants.js — config + upload da logo

**Files:** Modify `src/routes/tenants.js`

- [ ] **Step 1: Imports/multer no topo** (após os requires existentes):
```js
const multer = require('multer');
const path   = require('path');
const { uploadFile, downloadFileBuffer, deleteFile } = require('../services/storageService');
const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
const ACCENTS = ['#FF6B35', '#3B82F6', '#22C55E', '#8B5CF6', '#EC4899', '#111827'];
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename:    (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^a-z0-9._-]/gi,'_'))
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.mimetype);
    cb(ok ? null : new Error('Use PNG, JPG, WEBP ou SVG (max 2MB).'), ok);
  }
});
```

- [ ] **Step 2: GET /me devolve a config** — no objeto `data` do `GET /me`, antes do fechamento, acrescentar (com vírgula na linha anterior):
```js
        checkout_theme:          (tenant && tenant.checkout_theme) || 'dark',
        checkout_accent:         (tenant && tenant.checkout_accent) || '#FF6B35',
        checkout_show_guarantee: tenant ? (tenant.checkout_show_guarantee !== false) : true,
        has_checkout_logo:       !!(tenant && tenant.checkout_logo_key)
```

- [ ] **Step 3: PUT /me valida theme/accent/guarantee** — no `PUT /me`, ANTES do `await tenants.update(...)`, adicionar a validação e inclusão manual (não confiar no array `allowed` para esses):
```js
    if (req.body.checkout_theme !== undefined) {
      if (!['light','dark'].includes(req.body.checkout_theme)) return res.status(400).json({ success: false, error: 'Tema invalido.' });
      updateData.checkout_theme = req.body.checkout_theme;
    }
    if (req.body.checkout_accent !== undefined) {
      if (!ACCENTS.includes(req.body.checkout_accent)) return res.status(400).json({ success: false, error: 'Cor invalida.' });
      updateData.checkout_accent = req.body.checkout_accent;
    }
    if (req.body.checkout_show_guarantee !== undefined) {
      updateData.checkout_show_guarantee = !!req.body.checkout_show_guarantee;
    }
```
> Importante: essa validação vai depois da montagem do `updateData` (do array `allowed`) e antes do `if (Object.keys(updateData).length === 0)`. Mover a checagem de "nenhum campo" para depois destas três inclusões.

- [ ] **Step 4: Upload e remoção da logo** — antes do `module.exports`:
```js
// POST /me/checkout-logo — upload da logo do checkout (multipart, campo 'file')
router.post('/me/checkout-logo', function (req, res) {
  logoUpload.single('file')(req, res, async function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    try {
      const key = await uploadFile(req.file.path, req.file.originalname);
      await tenants.update(req.tenantId, { checkout_logo_key: key });
      res.json({ success: true });
    } catch (e) {
      logger.error('checkout-logo upload: ' + e.message);
      res.status(500).json({ success: false, error: 'Erro ao enviar a logo.' });
    }
  });
});

// DELETE /me/checkout-logo — remove a logo
router.delete('/me/checkout-logo', async (req, res) => {
  try {
    const t = await tenants.findById(req.tenantId);
    if (t && t.checkout_logo_key) { try { await deleteFile(t.checkout_logo_key); } catch (_) {} }
    await tenants.update(req.tenantId, { checkout_logo_key: null });
    res.json({ success: true });
  } catch (e) {
    logger.error('checkout-logo delete: ' + e.message);
    res.status(500).json({ success: false, error: 'Erro ao remover a logo.' });
  }
});
```
> `router.use(requireAuth)` já protege todas as rotas do arquivo. `downloadFileBuffer` é importado aqui mas usado no checkout.js (Task 3); pode remover do import deste arquivo se preferir — não atrapalha.

- [ ] **Step 5:** `node -c src/routes/tenants.js && node -e "require('./src/routes/tenants');console.log('ok')"` → `ok`. Commit:
```
git add src/routes/tenants.js
git commit -m "feat: tenants — config de checkout (GET/PUT validado) + upload/remocao da logo"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 3: checkout.js — config no GET + stream da logo

**Files:** Modify `src/routes/checkout.js`

- [ ] **Step 1: Import do storage** no topo:
```js
const { downloadFileBuffer } = require('../services/storageService');
```

- [ ] **Step 2: GET devolve `checkout`** — no `GET /:slug`, o handler já busca `tenant`. No objeto `product` da resposta, adicionar (com vírgula na linha anterior):
```js
        checkout: {
          theme:          (tenant && tenant.checkout_theme) || 'dark',
          accent:         (tenant && tenant.checkout_accent) || '#FF6B35',
          show_guarantee: tenant ? (tenant.checkout_show_guarantee !== false) : true,
          logo_url:       (tenant && tenant.checkout_logo_key) ? ('/api/checkout/' + product.slug + '/logo') : null
        }
```
> Se a busca do `tenant` estiver dentro de um `try`/ramo, garantir que `tenant` esteja em escopo no ponto da resposta (o GET já o usa para `isFreePlan`).

- [ ] **Step 3: Rota pública da logo** — adicionar (antes do `module.exports`):
```js
// GET /api/checkout/:slug/logo — serve a logo do checkout (stream do R2)
router.get('/:slug/logo', async (req, res) => {
  try {
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).end();
    const tenant = await tenants.findById(product.tenant_id);
    if (!tenant || !tenant.checkout_logo_key) return res.status(404).end();
    const buf = await downloadFileBuffer(tenant.checkout_logo_key);
    const key = tenant.checkout_logo_key.toLowerCase();
    const ct = key.endsWith('.svg') ? 'image/svg+xml' : key.endsWith('.webp') ? 'image/webp' : (key.endsWith('.jpg') || key.endsWith('.jpeg')) ? 'image/jpeg' : 'image/png';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(buf);
  } catch (err) {
    logger.error('checkout logo: ' + err.message);
    res.status(404).end();
  }
});
```
> `products` e `tenants` já estão importados no `checkout.js`.

- [ ] **Step 4:** `node -c src/routes/checkout.js && node -e "require('./src/routes/checkout');console.log('ok')"` → `ok`. Commit:
```
git add src/routes/checkout.js
git commit -m "feat: checkout — config de aparencia no GET + rota /logo (stream R2)"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 4: checkout.html — aplicar tema/cor/logo/garantia + selo Vaultly

**Files:** Modify `public/checkout.html`

- [ ] **Step 1: CSS — variáveis por tema + accent + selos**

No `:root`, garantir variáveis neutras e adicionar classes de tema. Trocar o bloco `:root{...}` por:
```css
  :root{--bg:#0B1020;--bg2:#141A2E;--orange:var(--accent,#FF6B35);--accent:#FF6B35;--text:#E8ECF5;--muted:#8A93A8;--line:#2a3350}
  body.theme-light{--bg:#F1F5F9;--bg2:#FFFFFF;--text:#0F172A;--muted:#64748B;--line:#E2E8F0}
```
E garantir que `.card`, inputs e bordas usem `var(--line)` em vez de cores fixas `#2a3350` onde aparecerem (trocar `#2a3350` por `var(--line)` nas regras de `input`, `.methods button`, `.copy`). O botão `.pay` e o `.price` usam `var(--accent)`.
Adicionar estilos dos selos:
```css
  .seller-logo{display:block;max-height:46px;margin:0 auto 14px;width:auto}
  .guarantee{display:flex;align-items:center;gap:8px;background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.25);color:#16a34a;border-radius:10px;padding:10px 12px;font-size:12px;font-weight:600;margin-top:14px}
  .vaultly-seal{display:flex;align-items:center;justify-content:center;gap:6px;color:var(--muted);font-size:11px;margin-top:18px}
```

- [ ] **Step 2: HTML — logo, garantia, selo**

No topo do `#content` (antes do `<h1 id="title">`), adicionar:
```html
      <img id="seller-logo" class="seller-logo" alt="" style="display:none;"/>
```
Após o `<div class="pix-box ...">` (ou no fim do card, antes do `</div>` que fecha o card), adicionar:
```html
      <div id="guarantee-badge" class="guarantee" style="display:none;"><i class="ti ti-shield-check"></i> Garantia de 7 dias — devolução garantida.</div>
      <div class="vaultly-seal"><i class="ti ti-lock"></i> Pagamento processado com segurança pela <strong style="margin-left:3px;">Vaultly</strong></div>
```
> Adicionar no `<head>` o CSS do Tabler se ainda não houver: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"/>` (verificar; o checkout pode não ter ícones hoje).

- [ ] **Step 3: JS — aplicar a config no load()**

No `load()`, após `var d = await r.json(); if(!d.success){...}`, e antes de preencher o título, adicionar:
```js
  var cfg = d.product.checkout || {};
  if (cfg.theme === 'light') document.body.classList.add('theme-light');
  document.documentElement.style.setProperty('--accent', cfg.accent || '#FF6B35');
  if (cfg.logo_url) { var lg = document.getElementById('seller-logo'); lg.src = cfg.logo_url; lg.style.display = 'block'; }
  var gb = document.getElementById('guarantee-badge'); if (gb && cfg.show_guarantee) gb.style.display = 'flex';
```

- [ ] **Step 4: Verificar script + commit**
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/checkout.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
```
git add public/checkout.html
git commit -m "feat: checkout.html — tema/cor/logo do vendedor + garantia + selo Vaultly"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

---

## Task 5: index.html — aba Checkout + preview

**Files:** Modify `public/index.html`

- [ ] **Step 1: Item no menu** — na seção "Sistema", após o item Loja (`id="nav-loja"`), adicionar:
```html
      <button class="nav-item" id="nav-checkout" onclick="switchTab('checkout',this)"><i class="ti ti-brush"></i> Checkout</button>
```

- [ ] **Step 2: Seção** — adicionar uma nova `<div id="tab-checkout" class="section">` (ex.: após a seção `#tab-loja`):
```html
      <!-- ── CHECKOUT ── -->
      <div id="tab-checkout" class="section">
        <div class="page-header">
          <div><div class="page-title">Checkout</div><div class="page-sub">personalize a aparência do seu checkout</div></div>
          <button class="btn btn-primary btn-sm" onclick="saveCheckoutConfig(this)"><i class="ti ti-device-floppy"></i> Salvar</button>
        </div>
        <div id="checkout-config-body">
          <div style="color:var(--text3);font-size:13px;">Carregando...</div>
        </div>
      </div>
```

- [ ] **Step 3: JS — render, preview e save**

Adicionar (perto de `loadVendaDiretaSection`):
```js
var CK_ACCENTS = ['#FF6B35','#3B82F6','#22C55E','#8B5CF6','#EC4899','#111827'];
var ckCfg = { theme: 'dark', accent: '#FF6B35', show_guarantee: true, has_logo: false };

async function loadCheckoutTab() {
  var body = document.getElementById('checkout-config-body');
  if (!body) return;
  if (currentUser && currentUser.plan_id === 'free') {
    body.innerHTML = '<div style="color:var(--text2);font-size:13px;line-height:1.6;">A personalização do checkout é da venda direta (planos pagos). Faça upgrade para ativar.</div>';
    return;
  }
  try {
    var res = await apiFetch('/api/tenants/me');
    if (res && res.success && res.data) {
      ckCfg.theme = res.data.checkout_theme || 'dark';
      ckCfg.accent = res.data.checkout_accent || '#FF6B35';
      ckCfg.show_guarantee = res.data.checkout_show_guarantee !== false;
      ckCfg.has_logo = !!res.data.has_checkout_logo;
    }
  } catch (e) {}
  renderCheckoutTab();
}

function renderCheckoutTab() {
  var body = document.getElementById('checkout-config-body');
  if (!body) return;
  var swatches = CK_ACCENTS.map(function(c){
    return '<button onclick="ckSetAccent(\'' + c + '\')" title="' + c + '" style="width:30px;height:30px;border-radius:50%;background:' + c + ';border:2px solid ' + (ckCfg.accent===c?'var(--text)':'transparent') + ';cursor:pointer;"></button>';
  }).join('');
  body.innerHTML =
    '<div class="card"><div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
      '<div>' +
        '<div class="form-label" style="margin-bottom:8px;">Tema</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:18px;">' +
          '<button class="btn btn-ghost btn-sm" id="ck-theme-light" onclick="ckSetTheme(\'light\')">Claro</button>' +
          '<button class="btn btn-ghost btn-sm" id="ck-theme-dark" onclick="ckSetTheme(\'dark\')">Escuro</button>' +
        '</div>' +
        '<div class="form-label" style="margin-bottom:8px;">Cor de destaque</div>' +
        '<div style="display:flex;gap:10px;margin-bottom:18px;">' + swatches + '</div>' +
        '<div class="form-label" style="margin-bottom:8px;">Logo (PNG sem fundo recomendado)</div>' +
        '<input type="file" id="ck-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="ckUploadLogo(this)" style="font-size:12px;margin-bottom:6px;" />' +
        (ckCfg.has_logo ? '<div><button class="btn btn-ghost btn-xs" onclick="ckRemoveLogo()"><i class="ti ti-trash"></i> Remover logo</button></div>' : '') +
        '<div class="toggle-row" style="margin-top:16px;"><div class="toggle-info"><div class="t-title">Garantia de 7 dias</div><div class="t-desc">Mostra um selo de garantia no checkout</div></div>' +
          '<button class="toggle' + (ckCfg.show_guarantee?' on':'') + '" id="ck-guarantee" onclick="this.classList.toggle(\'on\');ckCfg.show_guarantee=this.classList.contains(\'on\');ckRenderPreview()"></button></div>' +
      '</div>' +
      '<div><div class="form-label" style="margin-bottom:8px;">Pré-visualização</div><div id="ck-preview"></div></div>' +
    '</div></div>';
  document.getElementById('ck-theme-light').classList.toggle('btn-primary', ckCfg.theme==='light');
  document.getElementById('ck-theme-dark').classList.toggle('btn-primary', ckCfg.theme==='dark');
  ckRenderPreview();
}

function ckSetTheme(t){ ckCfg.theme=t; renderCheckoutTab(); }
function ckSetAccent(c){ ckCfg.accent=c; renderCheckoutTab(); }

function ckRenderPreview() {
  var p = document.getElementById('ck-preview');
  if (!p) return;
  var light = ckCfg.theme==='light';
  var bg = light?'#F1F5F9':'#0B1020', card = light?'#FFFFFF':'#141A2E', text = light?'#0F172A':'#E8ECF5', muted = light?'#64748B':'#8A93A8';
  var logo = ckCfg.has_logo ? '<img src="/api/tenants/checkout-logo-preview?t=' + Date.now() + '" style="max-height:34px;margin:0 auto 10px;display:block;" onerror="this.style.display=\'none\'"/>' : '';
  p.innerHTML =
    '<div style="background:' + bg + ';border-radius:12px;padding:18px;">' +
      '<div style="background:' + card + ';border:1px solid rgba(125,125,125,0.2);border-radius:12px;padding:16px;color:' + text + ';">' +
        logo +
        '<div style="font-weight:700;font-size:15px;">Seu Produto</div>' +
        '<div style="color:' + muted + ';font-size:12px;margin:2px 0 10px;">Descrição do produto</div>' +
        '<div style="font-size:22px;font-weight:800;color:' + ckCfg.accent + ';margin-bottom:12px;">R$ 27,00</div>' +
        '<button style="width:100%;padding:11px;border:0;border-radius:9px;background:' + ckCfg.accent + ';color:#fff;font-weight:700;">Pagar</button>' +
        (ckCfg.show_guarantee ? '<div style="margin-top:10px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#16a34a;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:600;">🛡️ Garantia de 7 dias</div>' : '') +
        '<div style="text-align:center;color:' + muted + ';font-size:10px;margin-top:12px;">🔒 Pagamento seguro pela Vaultly</div>' +
      '</div>' +
    '</div>';
}

async function ckUploadLogo(input) {
  if (!input.files || !input.files[0]) return;
  var fd = new FormData(); fd.append('file', input.files[0]);
  try {
    var res = await fetch('/api/tenants/me/checkout-logo', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken }, body: fd });
    var d = await res.json();
    if (!d.success) throw new Error(d.error || 'Erro');
    ckCfg.has_logo = true; showToast('Logo enviada!', 'success'); renderCheckoutTab();
  } catch (e) { showToast(e.message || 'Erro ao enviar a logo.', 'warn'); }
}
async function ckRemoveLogo() {
  try {
    var res = await apiFetch('/api/tenants/me/checkout-logo', { method: 'DELETE' });
    if (!res.success) throw new Error(res.error || 'Erro');
    ckCfg.has_logo = false; showToast('Logo removida.', 'success'); renderCheckoutTab();
  } catch (e) { showToast(e.message || 'Erro.', 'warn'); }
}
async function saveCheckoutConfig(btn) {
  if (btn) btn.disabled = true;
  try {
    var res = await apiFetch('/api/tenants/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_theme: ckCfg.theme, checkout_accent: ckCfg.accent, checkout_show_guarantee: ckCfg.show_guarantee }) });
    if (!res.success) throw new Error(res.error || 'Erro');
    showToast('Checkout salvo!', 'success');
  } catch (e) { showToast(e.message || 'Erro ao salvar.', 'warn'); }
  finally { if (btn) btn.disabled = false; }
}
```
> O preview da logo usa `/api/tenants/checkout-logo-preview` (rota autenticada de preview no painel) — para simplificar, em vez de criar essa rota, o preview pode só NÃO mostrar a logo (o checkout real mostra). **Simplificação aceita:** remover a linha `var logo = ...` e usar `var logo = '';` no preview (a logo aparece no checkout publicado, não no mini-preview). Isso evita uma rota extra autenticada de imagem.

- [ ] **Step 4: Gating do nav + hook no switchTab**

Em `showApp()`, junto da linha que oculta `nav-loja` para Free, ocultar também `nav-checkout`:
```js
  var navCk = document.getElementById('nav-checkout');
  if (navCk) navCk.style.display = (currentUser && currentUser.plan_id && currentUser.plan_id !== 'free') ? '' : 'none';
```
No `switchTab(name, el)`, adicionar: `if (name === 'checkout') loadCheckoutTab();`

- [ ] **Step 5: Verificar + commit**
```bash
node -e "const h=require('fs').readFileSync('public/index.html','utf8'); const ok=h.includes('id=\"tab-checkout\"')&&h.includes('function loadCheckoutTab')&&h.includes('function ckRenderPreview'); console.log(ok?'CONTENT_OK':'FALTANDO'); process.exit(ok?0:1);"
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
```
git add public/index.html
git commit -m "feat: aba Checkout no painel (tema/cor/logo/garantia + preview ao vivo)"
```
(Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>)

- [ ] **Step 6:** `npm test` (verde) + `node -c` backend. Depois `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:** §2 DB → T1; §3.1 tenants config+logo → T2; §3.2 checkout config+logo stream → T3; §4 checkout.html → T4; §5 aba Checkout → T5. ✅

**Placeholder scan:** sem TBD; código literal. (A "simplificação aceita" do preview de logo é uma decisão explícita, não placeholder.)

**Type consistency:** colunas `checkout_theme/accent/logo_key/show_guarantee` consistentes (DB ↔ tenants GET/PUT ↔ checkout GET); `ACCENTS` allowlist igual no backend (T2) e `CK_ACCENTS` no front (T5); `checkout.logo_url` (T3) consumido no checkout.html (T4); upload `POST /me/checkout-logo` (T2) ↔ `ckUploadLogo` (T5); `downloadFileBuffer`/`uploadFile` do storageService. ✅

**Gaps (aceitos):** preview da logo no painel é omitido (a logo real aparece no checkout publicado) p/ evitar rota de imagem autenticada; logo guardada como key R2 e servida por `/api/checkout/:slug/logo`. Sem testes unitários (I/O/UI).
