// src/routes/tenants.js
const express = require('express');
const router  = express.Router();
const { tenants } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

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
        yampi_store_alias:      tenant ? tenant.yampi_store_alias     : null,
        effective_from_name:    (tenant && tenant.email_from_name)    || process.env.EMAIL_FROM_NAME    || 'Vaultly',
        effective_from_address: (tenant && tenant.email_from_address) || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',
        using_platform_email:   !(tenant && (tenant.resend_api_key || tenant.email_from_address)),
        onboarding_completed:   !!(tenant && tenant.onboarding_completed),
        platforms_enabled:      (tenant && tenant.platforms_enabled) || 'kiwify,yampi',
        has_email_template:     !!(tenant && tenant.email_template),
        email_template:         tenant ? (tenant.email_template || '') : ''
      }
    });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/me', async (req, res) => {
  try {
    var allowed = [
      'kiwify_webhook_secret', 'yampi_webhook_secret',
      'email_from_name', 'email_from_address', 'resend_api_key',
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
      'kiwify_api_key', 'yampi_api_token', 'yampi_store_alias',
      'onboarding_completed', 'platforms_enabled', 'email_template'
    ];
    var updateData = {};
    allowed.forEach(function(f) {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });
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

module.exports = router;
