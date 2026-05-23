// src/routes/webhook.js
const express = require('express');
const router  = express.Router();
const { verifyWebhookSignature, detectPlatform } = require('../middleware/webhookAuth');
const { processWebhookEvent } = require('../services/deliveryService');
const { webhookLogs } = require('../models/database');
const logger = require('../config/logger');

async function handleWebhook(req, res) {
  const payload  = req.body;
  const platform = req.webhookPlatform || detectPlatform(req);
  const ip       = req.headers['x-forwarded-for'] || req.ip;
  const eventType = payload?.webhook_event_type || payload?.event || 'unknown';

  logger.info(`[${platform.toUpperCase()}] Webhook recebido — evento: ${eventType} — IP: ${ip}`);

  res.status(200).json({ received: true, platform, event: eventType });

  await webhookLogs.create({ platform, event_type: eventType, payload: JSON.stringify(payload), status: 'received', ip });

  setImmediate(async () => {
    try {
      const result = await processWebhookEvent(platform, payload);
      if (result?.ignored) { logger.debug(`Evento ignorado: ${result.reason}`); return; }
      logger.info(`✅ Entrega ${result.deliveryId} criada — ${result.buyerEmail}`);
      await webhookLogs.create({ platform, event_type: 'delivery.created', payload: JSON.stringify(result), status: 'processed', ip });
    } catch (err) {
      logger.error(`❌ Erro ao processar webhook [${platform}]: ${err.message}\n${err.stack}`);
      await webhookLogs.create({ platform, event_type: eventType, payload: JSON.stringify({ error: err.message }), status: 'error', ip });
    }
  });
}

router.post('/',        verifyWebhookSignature, handleWebhook);
router.post('/kiwify', verifyWebhookSignature, (req, res) => { req.webhookPlatform = 'kiwify'; handleWebhook(req, res); });
router.post('/yampi',  verifyWebhookSignature, (req, res) => { req.webhookPlatform = 'yampi';  handleWebhook(req, res); });

router.get('/',        (req, res) => res.json({ status: 'ok', message: 'DigitalHub Webhook ativo' }));
router.get('/kiwify', (req, res) => res.json({ status: 'ok', platform: 'kiwify' }));
router.get('/yampi',  (req, res) => res.json({ status: 'ok', platform: 'yampi' }));

module.exports = router;
