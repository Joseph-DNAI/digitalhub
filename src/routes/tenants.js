// src/routes/tenants.js
const express = require('express');
const router  = express.Router();
const { tenants } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');
const multer = require('multer');
const { uploadFile, deleteFile } = require('../services/storageService');
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

router.use(requireAuth);

router.get('/me', async (req, res) => {
  try {
    var base = process.env.BASE_URL || 'https://digitalhub-production.up.railway.app';
    var tenant = await tenants.findById(req.tenantId);
    res.json({
      success: true,
      data: {
        tenant_id:              req.tenantId,
        webhook_kiwify:         base + '/api/webhook/' + req.tenantId + '/kiwify',
        webhook_yampi:          base + '/api/webhook/' + req.tenantId + '/yampi',
        kiwify_webhook_secret:  tenant ? tenant.kiwify_webhook_secret : null,
        yampi_webhook_secret:   tenant ? tenant.yampi_webhook_secret  : null,
        email_from_name:        tenant ? tenant.email_from_name       : null,
        email_from_address:     tenant ? tenant.email_from_address    : null,
        has_resend_key:         !!(tenant && tenant.resend_api_key),
        has_kiwify_api_key:     !!(tenant && tenant.kiwify_api_key),
        has_yampi_token:        !!(tenant && tenant.yampi_api_token),
        has_yampi_secret_token: !!(tenant && tenant.yampi_secret_token),
        yampi_store_alias:      tenant ? tenant.yampi_store_alias     : null,
        effective_from_name:    (tenant && tenant.email_from_name)    || process.env.EMAIL_FROM_NAME    || 'Vaultly',
        effective_from_address: (tenant && tenant.email_from_address) || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',
        using_platform_email:   !(tenant && (tenant.resend_api_key || tenant.email_from_address)),
        onboarding_completed:   !!(tenant && tenant.onboarding_completed),
        platforms_enabled:      (tenant && tenant.platforms_enabled) || 'kiwify,yampi',
        has_email_template:     !!(tenant && tenant.email_template),
        email_template:         tenant ? (tenant.email_template || '') : '',
        notify_on_failure:      !!(tenant && tenant.notify_on_failure),
        checkout_theme:          (tenant && tenant.checkout_theme) || 'dark',
        checkout_accent:         (tenant && tenant.checkout_accent) || '#FF6B35',
        checkout_show_guarantee: tenant ? (tenant.checkout_show_guarantee !== false) : true,
        has_checkout_logo:       !!(tenant && tenant.checkout_logo_key)
      }
    });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/me', async (req, res) => {
  try {
    var byokPlans = ['basic', 'pro', 'business'];
    if (req.body.resend_api_key !== undefined && !byokPlans.includes(req.user.plan_id)) {
      return res.status(403).json({ success: false, error: 'Infraestrutura de envio personalizada disponivel a partir do plano Basic' });
    }

    var allowed = [
      'kiwify_webhook_secret', 'yampi_webhook_secret',
      'email_from_name', 'email_from_address', 'resend_api_key',
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
      'kiwify_api_key', 'yampi_api_token', 'yampi_secret_token', 'yampi_store_alias',
      'onboarding_completed', 'platforms_enabled', 'email_template', 'notify_on_failure'
    ];
    var updateData = {};
    allowed.forEach(function(f) {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });
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
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo valido para atualizar' });
    }
    await tenants.update(req.tenantId, updateData);
    logger.info('Tenant ' + req.tenantId + ' atualizado');
    res.json({ success: true, message: 'Configuracoes salvas' });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

module.exports = router;
