// src/routes/products.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { products } = require('../models/database');
const logger  = require('../config/logger');

const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_PATH),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
    cb(null, `${Date.now()}_${safe}`);
  }
});

// Aceita qualquer arquivo — validação feita depois
const upload = multer({ 
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024 }
});

// POST /api/products — aceita com ou sem arquivo
router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      logger.error(`Erro multer: ${err.message}`);
      return res.status(400).json({ success: false, error: `Erro no upload: ${err.message}` });
    }

    try {
      const { name, description, price, kiwify_id, yampi_id, email_template } = req.body;

      logger.info(`Criando produto: name=${name}, kiwify_id=${kiwify_id}, yampi_id=${yampi_id}, arquivo=${req.file?.originalname || 'nenhum'}`);

      if (!name) {
        return res.status(400).json({ success: false, error: 'Campo obrigatório: name' });
      }
      if (!kiwify_id && !yampi_id) {
        return res.status(400).json({ success: false, error: 'Informe ao menos kiwify_id ou yampi_id' });
      }

      const created = products.create({
        name,
        description:    description    || null,
        price:          parseFloat(price) || 0,
        kiwify_id:      kiwify_id      || null,
        yampi_id:       yampi_id       || null,
        email_template: email_template || null,
        file_path:      req.file ? req.file.path      : null,
        file_name:      req.file ? req.file.originalname : null
      });

      logger.info(`✅ Produto criado: ${created.id}`);
      const { file_path, ...safe } = created;
      res.status(201).json({ success: true, data: safe });

    } catch (err) {
      logger.error(`Erro ao criar produto: ${err.message}\n${err.stack}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });
});

// GET /api/products
router.get('/', (req, res) => {
  try {
    const all = products.findAll().map(({ file_path, ...p }) => p);
    res.json({ success: true, data: all });
  } catch (err) {
    logger.error(`Erro ao listar: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  try {
    const p = products.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    const { file_path, ...safe } = p;
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });

    try {
      const existing = products.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, error: 'Produto não encontrado' });

      const updateData = {};
      ['name', 'description', 'price', 'kiwify_id', 'yampi_id', 'email_template', 'status'].forEach(f => {
        if (req.body[f] !== undefined) updateData[f] = req.body[f];
      });

      if (req.file) {
        if (existing.file_path && fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
        updateData.file_path = req.file.path;
        updateData.file_name = req.file.originalname;
      }

      if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);

      const updated = products.update(req.params.id, updateData);
      const { file_path, ...safe } = updated;
      res.json({ success: true, data: safe });

    } catch (err) {
      logger.error(`Erro ao atualizar: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });
});

// DELETE /api/products/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = products.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Produto não encontrado' });
    if (existing.file_path && fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
    products.delete(req.params.id);
    res.json({ success: true, message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
