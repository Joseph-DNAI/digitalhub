// src/routes/products.js — multi-tenant
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { products, unmatchedProducts, tenants } = require('../models/database');
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
    await products.delete(req.tenantId, req.params.id);
    res.json({ success: true, message: 'Produto removido' });
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
      list = await fetchYampiProducts(tenant.yampi_store_alias, tenant.yampi_api_token);
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

module.exports = router;
