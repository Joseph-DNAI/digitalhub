// src/routes/tenants.js
// Configurações do tenant (webhook secrets, email, etc)

const express = require('express');
const router  = express.Router();
const { tenants } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(requireAuth);

// GET /api/tenants/me — dados do tenant atual
router.get('/me', async (req, res) => {
  try {
    const base = process.env.BASE_URL || `https://digitalhub-production.up.railway.app`;
    const tenant = await tenants.findById(req.tenantId);
    res.json({
      success: true,
      data: {
        tenant_id:              req.tenantId,
        webhook_kiwify:         `${base}/api/webhook/${req.tenantId}/kiwify`,
        webhook_yampi:          `${base}/api/webhook/${req.tenantId}/yampi`,
        kiwify_webhook_secret:  tenant?.kiwify_webhook_secret || null,
        yampi_webhook_secret:   tenant?.yampi_webhook_secret  || null,
        email_from_name:        tenant?.email_from_name        || null,
        email_from_address:     tenant?.email_from_address     || null,
        has_resend_key:         !!tenant?.resend_api_key,
        has_kiwify_api_key:     !!tenant?.kiwify_api_key,
        has_yampi_token:        !!tenant?.yampi_api_token,
        yampi_store_alias:      tenant?.yampi_store_alias      || null
      }
    });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tenants/me — atualiza configurações
router.put('/me', async (req, res) => {
  try {
    const allowed = [
      'kiwify_webhook_secret', 'yampi_webhook_secret',
      'email_from_name', 'email_from_address', 'resend_api_key',
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
      'kiwify_api_key', 'yampi_api_token', 'yampi_store_alias'
    ];
    const updateData = {};
    allowed.forEach(f => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo válido para atualizar' });
    }

    await tenants.update(req.tenantId, updateData);
    logger.info(`Tenant ${req.tenantId} atualizado`);
    res.json({ success: true, message: 'Configurações salvas' });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
