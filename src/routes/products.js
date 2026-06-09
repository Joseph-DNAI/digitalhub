// src/routes/products.js — multi-tenant
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { products, unmatchedProducts, tenants, productFiles } = require('../models/database');
const { uploadFile, deleteFile, copyFile } = require('../services/storageService');
const { requireAuth } = require('../middleware/auth');
const { fetchYampiProducts, fetchKiwifyProducts } = require('../services/platformApiService');
const { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL } = require('../services/productLimits');
const logger   = require('../config/logger');

router.use(requireAuth);

const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

// Tipos de arquivo permitidos para produtos digitais
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'video/mp4',
  'video/webm'
];

// Extensoes permitidas (defesa extra contra MIME falsificado — bloqueia exe/js/html/svg etc.)
const ALLOWED_EXTENSIONS = [
  '.pdf', '.epub', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.jpg', '.jpeg', '.png', '.gif', '.mp3', '.m4a', '.mp4', '.webm'
];

// Limite TOTAL de anexos por produto (principal + combo), para a entrega por email nao falhar.
// O front mostra 25 MB; o backend deixa uma margem antes de recusar.
const MAX_ATTACH_TOTAL_MB = parseInt(process.env.MAX_ATTACH_TOTAL_MB || '25', 10);
const ATTACH_MARGIN_MB    = parseInt(process.env.ATTACH_MARGIN_MB || '3', 10);
const MAX_TOTAL_BYTES     = (MAX_ATTACH_TOTAL_MB + ATTACH_MARGIN_MB) * 1024 * 1024; // ex.: 28 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-z0-9._-]/gi,'_')}`)
  }),
  // Nenhum arquivo isolado pode exceder o total permitido.
  limits: { fileSize: MAX_TOTAL_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.match(/\.[^.\/\\]+$/) || [''])[0].toLowerCase();
    if (ALLOWED_MIMETYPES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo nao permitido. Use PDF, EPUB, DOCX, XLSX, PPTX, TXT, imagem, MP3 ou MP4.'));
    }
  }
});

function uploadMw(req, res, next) {
  upload.single('file')(req, res, err => {
    if (err) {
      var msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo acima do limite total de ' + MAX_ATTACH_TOTAL_MB + ' MB por produto.'
        : err.message;
      return res.status(400).json({ success: false, error: msg });
    }
    next();
  });
}

router.get('/', async (req, res) => {
  try {
    const all = (await products.findAll(req.tenantId)).map(({ file_path, ...p }) => p);
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await products.findById(req.tenantId, req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    const { file_path, ...safe } = p;
    // Inclui arquivos extras do combo (sem expor o file_path interno)
    const extras = await productFiles.findByProduct(req.tenantId, req.params.id);
    safe.extra_files = (extras || []).map(f => ({ id: f.id, file_name: f.file_name, file_size: f.file_size, created_at: f.created_at }));
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verifica se algum ID de plataforma ja pertence a OUTRO produto (unicidade por tenant)
async function idConflictMessage(tenantId, kiwifyId, yampiId, selfId) {
  if (kiwifyId) {
    const e = await products.findByKiwifyId(tenantId, kiwifyId);
    if (e && e.id !== selfId) return 'Ja existe um produto com este ID Kiwify: "' + (e.name || '') + '". Cada ID so pode pertencer a um produto.';
  }
  if (yampiId) {
    const e = await products.findByYampiId(tenantId, yampiId);
    if (e && e.id !== selfId) return 'Ja existe um produto com este ID Yampi: "' + (e.name || '') + '". Cada ID so pode pertencer a um produto.';
  }
  return null;
}

router.post('/', uploadMw, async (req, res) => {
  try {
    const { name, description, price, kiwify_id, yampi_id, email_template, confirm_evict } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Campo obrigatório: name' });

    // Unicidade dos IDs de plataforma
    const conflict = await idConflictMessage(req.tenantId, kiwify_id, yampi_id, null);
    if (conflict) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(409).json({ success: false, error: conflict });
    }

    // Teto global anti-abuso (ativos + inativos). Se cheio: descarta o inativo mais antigo
    // (com confirmacao) ou bloqueia se todos estiverem ativos.
    const total = await products.count(req.tenantId);
    if (atGlobalCap(total, MAX_PRODUCTS_TOTAL)) {
      const oldest = await products.findOldestInactive(req.tenantId);
      if (!oldest) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        return res.status(409).json({ success: false,
          error: 'Voce atingiu o limite de ' + MAX_PRODUCTS_TOTAL + ' produtos e todos estao ativos. Desative ou apague algum para cadastrar.' });
      }
      if (confirm_evict !== 'true' && confirm_evict !== true) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        return res.status(200).json({ success: false, needs_evict: true,
          evict_product: { id: oldest.id, name: oldest.name, since: oldest.created_at },
          error: 'Limite de ' + MAX_PRODUCTS_TOTAL + ' produtos atingido.' });
      }
      // confirmado: apaga o mais antigo inativo (e seu arquivo no storage, se houver)
      if (oldest.file_path) { try { await deleteFile(oldest.file_path); } catch (_) {} }
      await products.delete(req.tenantId, oldest.id);
    }

    let r2Key = null, fileName = null, fileSize = null;
    if (req.file) {
      r2Key    = await uploadFile(req.file.path, req.file.originalname);
      fileName = req.file.originalname;
      fileSize = req.file.size;
    }

    // Status inicial: ativo se ha espaco no limite de ativos do plano; senao inativo.
    const activeCount = await products.countActive(req.tenantId);
    const status = initialStatus(activeCount, req.user.max_products);

    const created = await products.create(req.tenantId, {
      name, description: description || null,
      price: parseFloat(price) || 0,
      kiwify_id: kiwify_id || null, yampi_id: yampi_id || null,
      email_template: email_template || null,
      file_path: r2Key, file_name: fileName, file_size: fileSize,
      status: status
    });

    if (kiwify_id) await unmatchedProducts.deleteByPlatformId(req.tenantId, 'kiwify', kiwify_id);
    if (yampi_id)  await unmatchedProducts.deleteByPlatformId(req.tenantId, 'yampi',  yampi_id);

    const { file_path, ...safe } = created;
    res.status(201).json({ success: true, data: safe, status: status });
  } catch (err) {
    logger.error('Erro ao criar produto: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /bulk — edicao em massa (desconto%, preco fixo, remover promo, ativar/desativar)
router.post('/bulk', async (req, res) => {
  try {
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    const { ids, action, value } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, error: 'Selecione ao menos um produto.' });
    if (ids.length > 200) return res.status(400).json({ success: false, error: 'Maximo de 200 produtos por vez.' });

    const list = await products.findByIds(req.tenantId, ids);
    let updated = 0, skipped = 0;

    if (action === 'discount') {
      const pct = parseFloat(value);
      if (!(pct > 0 && pct <= 95)) return res.status(400).json({ success: false, error: 'Desconto deve ser entre 1% e 95%.' });
      for (const p of list) {
        const base = p.price_cents || Math.round((parseFloat(p.price) || 0) * 100);
        const promo = Math.round(base * (1 - pct / 100));
        if (base < MIN || promo < MIN) { skipped++; continue; }
        await products.update(req.tenantId, p.id, { promo_price_cents: promo });
        updated++;
      }
    } else if (action === 'set_price') {
      const reais = parseFloat(String(value).replace(',', '.'));
      if (!(reais > 0)) return res.status(400).json({ success: false, error: 'Informe um preco valido.' });
      const cents = Math.round(reais * 100);
      for (const p of list) {
        if (p.sellable && cents < MIN) { skipped++; continue; }
        const data = { price: reais, price_cents: cents };
        if (p.promo_price_cents && p.promo_price_cents >= cents) data.promo_price_cents = null;
        await products.update(req.tenantId, p.id, data);
        updated++;
      }
    } else if (action === 'clear_promo') {
      for (const p of list) { await products.update(req.tenantId, p.id, { promo_price_cents: null }); updated++; }
    } else if (action === 'status') {
      const target = value === 'active' ? 'active' : 'inactive';
      if (target === 'inactive') {
        for (const p of list) { await products.update(req.tenantId, p.id, { status: 'inactive' }); updated++; }
      } else {
        let activeCount = await products.countActive(req.tenantId);
        for (const p of list) {
          if (p.status === 'active') { updated++; continue; }
          if (!canActivate(activeCount, req.user.max_products)) { skipped++; continue; }
          await products.update(req.tenantId, p.id, { status: 'active' });
          activeCount++; updated++;
        }
      }
    } else {
      return res.status(400).json({ success: false, error: 'Acao invalida.' });
    }

    let message = updated + ' produto(s) atualizado(s)';
    if (skipped) message += ' · ' + skipped + ' ignorado(s)';
    res.json({ success: true, updated, skipped, message });
  } catch (err) {
    logger.error('products/bulk: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', uploadMw, async (req, res) => {
  try {
    const existing = await products.findById(req.tenantId, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Produto não encontrado' });

    const updateData = {};
    ['name','description','price','kiwify_id','yampi_id','email_template','status'].forEach(f => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });

    // Unicidade dos IDs de plataforma (ignorando o proprio produto)
    const conflict = await idConflictMessage(req.tenantId, updateData.kiwify_id, updateData.yampi_id, req.params.id);
    if (conflict) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(409).json({ success: false, error: conflict });
    }

    if (req.file) {
      // Trava de total: novo arquivo principal + combo existente nao podem passar do limite
      const comboBytes = await productFiles.totalSize(req.tenantId, req.params.id);
      if (req.file.size + comboBytes > MAX_TOTAL_BYTES) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false,
          error: 'O total de anexos passaria de ' + MAX_ATTACH_TOTAL_MB + ' MB (combo atual ocupa ' + (comboBytes/1024/1024).toFixed(1) + ' MB). Use um arquivo menor.' });
      }
      if (existing.file_path) { try { await deleteFile(existing.file_path); } catch(e){} }
      updateData.file_path = await uploadFile(req.file.path, req.file.originalname);
      updateData.file_name = req.file.originalname;
      updateData.file_size = req.file.size;
    }

    if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);

    // Ativar pelo editor tambem respeita o limite de ativos do plano.
    if (updateData.status === 'active' && existing.status !== 'active') {
      const activeCount = await products.countActive(req.tenantId);
      if (!canActivate(activeCount, req.user.max_products)) {
        return res.status(403).json({ success: false, needs_upgrade: true,
          error: 'Limite de produtos ativos do seu plano atingido. Faca upgrade ou desative outro produto.' });
      }
    }

    const updated = await products.update(req.tenantId, req.params.id, updateData);

    // Limpa produtos pendentes que correspondem ao mesmo ID de plataforma
    if (updateData.kiwify_id) await unmatchedProducts.deleteByPlatformId(req.tenantId, 'kiwify', updateData.kiwify_id);
    if (updateData.yampi_id)  await unmatchedProducts.deleteByPlatformId(req.tenantId, 'yampi',  updateData.yampi_id);

    const { file_path, ...safe } = updated;
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/duplicate — cria uma copia do produto (sem os IDs de plataforma; copia arquivo e combo)
router.post('/:id/duplicate', async (req, res) => {
  try {
    const src = await products.findById(req.tenantId, req.params.id);
    if (!src) return res.status(404).json({ success: false, error: 'Produto nao encontrado' });

    const total = await products.count(req.tenantId);
    if (atGlobalCap(total, MAX_PRODUCTS_TOTAL)) {
      return res.status(409).json({ success: false, error: 'Limite de ' + MAX_PRODUCTS_TOTAL + ' produtos atingido. Apague ou desative algum antes de duplicar.' });
    }

    // Copia o arquivo principal no R2 (se houver)
    let newKey = null;
    if (src.file_path) { try { newKey = await copyFile(src.file_path, src.file_name || 'arquivo'); } catch (e) { logger.error('duplicate copyFile: ' + e.message); } }

    const activeCount = await products.countActive(req.tenantId);
    const status = initialStatus(activeCount, req.user.max_products);

    const created = await products.create(req.tenantId, {
      name: (src.name || 'Produto') + ' (cópia)',
      description: src.description || null,
      price: src.price || 0,
      kiwify_id: null, yampi_id: null,             // IDs nao sao duplicados
      email_template: src.email_template || null,
      file_path: newKey, file_name: src.file_name || null, file_size: src.file_size || null,
      status: status
    });

    // Copia os arquivos do combo, se houver
    try {
      const extras = await productFiles.findByProduct(req.tenantId, req.params.id);
      for (const f of (extras || [])) {
        try {
          const k = await copyFile(f.file_path, f.file_name || 'arquivo');
          await productFiles.create(req.tenantId, created.id, k, f.file_name, f.file_size);
        } catch (e) { logger.error('duplicate combo: ' + e.message); }
      }
    } catch (e) { logger.error('duplicate combo list: ' + e.message); }

    const { file_path, ...safe } = created;
    res.status(201).json({ success: true, data: safe, status: status });
  } catch (err) {
    logger.error('Erro ao duplicar produto: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await products.findById(req.tenantId, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Produto nao encontrado' });
    if (existing.file_path) { try { await deleteFile(existing.file_path); } catch(e){} }
    // Remove tambem os arquivos extras do combo do storage
    const extras = await productFiles.findByProduct(req.tenantId, req.params.id);
    for (const f of (extras || [])) { try { await deleteFile(f.file_path); } catch(e){} }
    await products.delete(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Combo: arquivos extras (Pro+) ────────────────────────────────────────────

const COMBO_PLANS  = ['pro', 'business'];
const MAX_EXTRA_FILES = 8; // até 8 extras (9 arquivos no total) — protege o limite de tamanho do email

function requireComboPlan(req, res, next) {
  if (!COMBO_PLANS.includes(req.user.plan_id)) {
    return res.status(403).json({ success: false, error: 'Combo de arquivos disponível a partir do plano Pro. Faça upgrade para anexar mais de um arquivo por produto.' });
  }
  next();
}

// POST /:id/files — adiciona um arquivo extra ao produto
router.post('/:id/files', requireComboPlan, uploadMw, async (req, res) => {
  try {
    const product = await products.findById(req.tenantId, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

    const count = await productFiles.count(req.tenantId, req.params.id);
    if (count >= MAX_EXTRA_FILES) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: 'Limite de ' + MAX_EXTRA_FILES + ' arquivos extras atingido para este produto.' });
    }

    // Trava de total: principal + combo existente + novo arquivo nao podem passar do limite
    const usedBytes = (parseInt(product.file_size, 10) || 0) + await productFiles.totalSize(req.tenantId, req.params.id);
    if (req.file.size + usedBytes > MAX_TOTAL_BYTES) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false,
        error: 'O total de anexos passaria de ' + MAX_ATTACH_TOTAL_MB + ' MB (ja usados ' + (usedBytes/1024/1024).toFixed(1) + ' MB). Use um arquivo menor.' });
    }

    const r2Key = await uploadFile(req.file.path, req.file.originalname);
    const id = await productFiles.create(req.tenantId, req.params.id, r2Key, req.file.originalname, req.file.size);
    res.status(201).json({ success: true, data: { id, file_name: req.file.originalname, file_size: req.file.size } });
  } catch (err) {
    logger.error('Erro ao adicionar arquivo extra: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id/files/:fileId — remove um arquivo extra
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    const f = await productFiles.findById(req.tenantId, req.params.fileId);
    if (!f) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
    try { await deleteFile(f.file_path); } catch(e){}
    await productFiles.delete(req.tenantId, req.params.fileId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Produtos nao mapeados (capturados via webhook) ───────────────────────────

router.get('/unmatched/list', async (req, res) => {
  try {
    const list = await unmatchedProducts.findAll(req.tenantId);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Descarta um produto nao mapeado (usuario decidiu ignorar)
router.delete('/unmatched/:id', async (req, res) => {
  try {
    await unmatchedProducts.delete(req.tenantId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Importar produtos da plataforma via API ──────────────────────────────────

router.get('/platform-list/:platform', async (req, res) => {
  try {
    const tenant = await tenants.findById(req.tenantId);
    const platform = req.params.platform;
    let list = [];

    if (platform === 'yampi') {
      list = await fetchYampiProducts(tenant.yampi_store_alias, tenant.yampi_api_token, tenant.yampi_secret_token);
    } else if (platform === 'kiwify') {
      list = await fetchKiwifyProducts(tenant.kiwify_api_key);
    } else {
      return res.status(400).json({ success: false, error: 'Plataforma invalida: ' + platform });
    }

    res.json({ success: true, data: list });
  } catch (err) {
    logger.error('Erro ao importar da plataforma: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const { sellerAccounts } = require('../models/database');

// Codigo aleatorio curto e url-safe (sem caracteres ambiguos) — vira o link do checkout.
function makeCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// PUT /api/products/:id/selling — configura venda direta do produto
router.put('/:id/selling', requireAuth, async (req, res) => {
  try {
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    const { sellable, price_cents, checkout_title, checkout_description, accept_pix, accept_card } = req.body;

    const product = await products.findById(req.tenantId, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    if (sellable) {
      const acc = await sellerAccounts.findByTenant(req.tenantId);
      if (!acc || acc.status !== 'active') {
        return res.status(403).json({ success: false, error: 'Ative sua conta de recebimento antes de vender direto.', needs_onboarding: true });
      }
      if (!price_cents || price_cents < MIN) {
        return res.status(400).json({ success: false, error: 'Preco minimo para venda direta e R$' + (MIN / 100).toFixed(2).replace('.', ',') + '.' });
      }
    }

    // Valor promocional (opcional): MIN <= promo < price_cents
    let promoCents = null;
    if (sellable && req.body.promo_price_cents) {
      promoCents = parseInt(req.body.promo_price_cents, 10);
      if (!Number.isInteger(promoCents) || promoCents < MIN) {
        return res.status(400).json({ success: false, error: 'Valor promocional minimo e R$' + (MIN / 100).toFixed(2).replace('.', ',') + '.' });
      }
      if (promoCents >= price_cents) {
        return res.status(400).json({ success: false, error: 'O valor promocional deve ser menor que o preco.' });
      }
    }

    // Link estavel: mantem o codigo ja existente; gera um aleatorio unico na 1a ativacao.
    let finalSlug = product.slug;
    if (!finalSlug) {
      const db = require('../models/database');
      do { finalSlug = makeCode(); } while (await db.queryOne('SELECT id FROM products WHERE slug = $1', [finalSlug]));
    }

    const updated = await products.update(req.tenantId, req.params.id, {
      sellable: !!sellable,
      price_cents: price_cents || null,
      promo_price_cents: promoCents,
      slug: finalSlug,
      checkout_title: checkout_title || product.name,
      checkout_description: checkout_description || null,
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    });
    res.json({ success: true, product: updated });
  } catch (err) {
    logger.error('products/selling: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// PUT /api/products/:id/status — ativa/desativa o produto (ativos contam no limite do plano)
router.put('/:id/status', async (req, res) => {
  try {
    const want = req.body.status === 'active' ? 'active' : 'inactive';
    const product = await products.findById(req.tenantId, req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    if (want === 'active' && product.status !== 'active') {
      const activeCount = await products.countActive(req.tenantId);
      if (!canActivate(activeCount, req.user.max_products)) {
        return res.status(403).json({ success: false, needs_upgrade: true,
          error: 'Limite de produtos ativos do seu plano atingido. Faca upgrade ou desative outro produto.' });
      }
    }
    const updated = await products.update(req.tenantId, req.params.id, { status: want });
    const { file_path, ...safe } = updated;
    res.json({ success: true, data: safe });
  } catch (err) {
    logger.error('products/status: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/products/bulk — cria varios produtos a partir de itens JSON (import CSV).
// Itens: [{ name, price (reais, opcional), description (opcional) }]. Sem arquivo (entra depois).
// Respeita o teto global e o limite de ativos. NAO faz eviction (para nao apagar em massa).
router.post('/bulk', express.json(), async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, error: 'Nenhum item para importar.' });

    let total = await products.count(req.tenantId);
    let activeCount = await products.countActive(req.tenantId);
    const createdList = [];
    let skipped = 0;

    for (const it of items) {
      const name = (it && it.name ? String(it.name) : '').trim();
      if (!name) { skipped++; continue; }
      if (atGlobalCap(total, MAX_PRODUCTS_TOTAL)) { skipped++; continue; }

      const status = initialStatus(activeCount, req.user.max_products);
      const priceReais = parseFloat(String(it.price || '0').replace(',', '.')) || 0;
      const created = await products.create(req.tenantId, {
        name,
        description: it.description ? String(it.description) : null,
        price: priceReais,
        status: status
      });
      createdList.push({ id: created.id, name: created.name, status: created.status });
      total++;
      if (status === 'active') activeCount++;
    }

    res.status(201).json({ success: true, created: createdList.length, skipped: skipped, items: createdList });
  } catch (err) {
    logger.error('products/bulk: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao importar.' });
  }
});

module.exports = router;
