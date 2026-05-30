// src/routes/products.js — multi-tenant
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { products, unmatchedProducts, tenants, productFiles } = require('../models/database');
const { uploadFile, deleteFile } = require('../services/storageService');
const { requireAuth, requirePlanLimit } = require('../middleware/auth');
const { fetchYampiProducts, fetchKiwifyProducts } = require('../services/platformApiService');
const logger   = require('../config/logger');

router.use(requireAuth);

const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

// Tipos de arquivo permitidos para produtos digitais
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
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

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-z0-9._-]/gi,'_')}`)
  }),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB||'50') * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo nao permitido. Use PDF, ZIP, EPUB, DOCX, MP3, MP4 ou similares.'));
    }
  }
});

function uploadMw(req, res, next) {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ success: false, error: err.message });
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
    safe.extra_files = (extras || []).map(f => ({ id: f.id, file_name: f.file_name, created_at: f.created_at }));
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requirePlanLimit('product'), uploadMw, async (req, res) => {
  try {
    const { name, description, price, kiwify_id, yampi_id, email_template } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Campo obrigatório: name' });
    if (!kiwify_id && !yampi_id) return res.status(400).json({ success: false, error: 'Informe kiwify_id ou yampi_id' });

    let r2Key = null, fileName = null;
    if (req.file) {
      r2Key    = await uploadFile(req.file.path, req.file.originalname);
      fileName = req.file.originalname;
    }

    const created = await products.create(req.tenantId, {
      name, description: description||null,
      price: parseFloat(price)||0,
      kiwify_id: kiwify_id||null, yampi_id: yampi_id||null,
      email_template: email_template||null,
      file_path: r2Key, file_name: fileName
    });

    // Limpa produtos pendentes que correspondem ao mesmo ID de plataforma
    if (kiwify_id) await unmatchedProducts.deleteByPlatformId(req.tenantId, 'kiwify', kiwify_id);
    if (yampi_id)  await unmatchedProducts.deleteByPlatformId(req.tenantId, 'yampi',  yampi_id);

    const { file_path, ...safe } = created;
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    logger.error(`Erro ao criar produto: ${err.message}`);
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

    if (req.file) {
      if (existing.file_path) { try { await deleteFile(existing.file_path); } catch(e){} }
      updateData.file_path = await uploadFile(req.file.path, req.file.originalname);
      updateData.file_name = req.file.originalname;
    }

    if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);

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
      return res.status(400).json({ success: false, error: 'Limite de ' + MAX_EXTRA_FILES + ' arquivos extras atingido para este produto.' });
    }

    const r2Key = await uploadFile(req.file.path, req.file.originalname);
    const id = await productFiles.create(req.tenantId, req.params.id, r2Key, req.file.originalname);
    res.status(201).json({ success: true, data: { id, file_name: req.file.originalname } });
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

function makeSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// PUT /api/products/:id/selling — configura venda direta do produto
router.put('/:id/selling', requireAuth, async (req, res) => {
  try {
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    const { sellable, price_cents, slug, checkout_title, checkout_description, accept_pix, accept_card } = req.body;

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

    let finalSlug = slug ? makeSlug(slug) : makeSlug(product.name) + '-' + req.params.id.slice(0, 6);
    const clash = await require('../models/database').queryOne(
      'SELECT id FROM products WHERE slug = $1 AND id <> $2', [finalSlug, req.params.id]);
    if (clash) finalSlug = finalSlug + '-' + req.params.id.slice(0, 4);

    const updated = await products.update(req.tenantId, req.params.id, {
      sellable: !!sellable,
      price_cents: price_cents || null,
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

module.exports = router;
