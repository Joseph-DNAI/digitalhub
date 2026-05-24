// src/routes/webhook.js — multi-tenant
// URL do webhook por tenant: /api/webhook/:tenantId/kiwify

const express = require('express');
const router  = express.Router();
const { tenants, webhookLogs } = require('../models/database');
const { processWebhookEvent }  = require('../services/deliveryService');
const { verifyWebhookSignature } = require('../middleware/webhookAuth');
const logger = require('../config/logger');

async function handleWebhook(req, res) {
  const { tenantId } = req.params;
  const platform  = req.webhookPlatform;
  const payload   = req.body;
  const ip        = req.headers['x-forwarded-for'] || req.ip;
  const eventType = payload?.webhook_event_type || payload?.event || 'unknown';

  // Verifica se o tenant existe
  const tenant = await tenants.findById(tenantId);
  if (!tenant) {
    logger.warn(`Webhook para tenant inexistente: ${tenantId}`);
    return res.status(404).json({ error: 'Tenant não encontrado' });
  }

  logger.info(`[${platform.toUpperCase()}][${tenantId.slice(0,8)}] Evento: ${eventType}`);

  res.status(200).json({ received: true, platform, event: eventType });

  await webhookLogs.create(tenantId, {
    platform, event_type: eventType,
    payload: JSON.stringify(payload),
    status: 'received', ip
  });

  setImmediate(async () => {
    try {
      const result = await processWebhookEvent(tenantId, platform, payload);
      if (result?.ignored) { logger.debug(`Evento ignorado: ${result.reason}`); return; }
      logger.info(`✅ Entrega ${result.deliveryId} — ${result.buyerEmail}`);
      await webhookLogs.create(tenantId, {
        platform, event_type: 'delivery.created',
        payload: JSON.stringify(result), status: 'processed', ip
      });
    } catch (err) {
      logger.error(`❌ Erro webhook [${platform}][${tenantId.slice(0,8)}]: ${err.message}`);
      await webhookLogs.create(tenantId, {
        platform, event_type: eventType,
        payload: JSON.stringify({ error: err.message }), status: 'error', ip
      });
    }
  });
}

// Rotas por tenant
router.post('/:tenantId/kiwify', verifyWebhookSignature, (req, res) => {
  req.webhookPlatform = 'kiwify';
  handleWebhook(req, res);
});

router.post('/:tenantId/yampi', verifyWebhookSignature, (req, res) => {
  req.webhookPlatform = 'yampi';
  handleWebhook(req, res);
});

// Health checks
router.get('/:tenantId/kiwify', (req, res) => res.json({ status: 'ok', platform: 'kiwify', tenant: req.params.tenantId }));
router.get('/:tenantId/yampi',  (req, res) => res.json({ status: 'ok', platform: 'yampi',  tenant: req.params.tenantId }));

module.exports = router;
