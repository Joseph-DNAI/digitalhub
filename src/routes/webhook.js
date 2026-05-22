// src/routes/webhook.js
// Endpoint único que recebe webhooks de Kiwify e Yampi

const express = require('express');
const router = express.Router();

const { verifyWebhookSignature, detectPlatform } = require('../middleware/webhookAuth');
const { processWebhookEvent } = require('../services/deliveryService');
const { webhookLogs } = require('../models/database');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const payload  = req.body;
  const platform = req.webhookPlatform || detectPlatform(req);
  const ip       = req.headers['x-forwarded-for'] || req.ip;

  // Compatibilidade com payloads novos e antigos
  const eventType =
    payload?.webhook_event_type ||
    payload?.event ||
    payload?.order_status ||
    'unknown';

  logger.info(
    `[${platform.toUpperCase()}] Webhook recebido — evento: ${eventType} — IP: ${ip}`
  );

  // DEBUG TEMPORÁRIO — pode remover depois
  logger.debug(`Payload recebido:\n${JSON.stringify(payload, null, 2)}`);

  // Responde imediatamente para evitar timeout/retry
  res.status(200).json({
    received: true,
    platform,
    event: eventType
  });

  // Salva log do webhook
  webhookLogs.create({
    platform,
    event_type: eventType,
    payload: JSON.stringify(payload),
    status: 'received',
    ip
  });

  // Processa em background
  setImmediate(async () => {
    try {
      const result = await processWebhookEvent(platform, payload);

      if (result?.ignored) {
        logger.debug(`Evento ignorado: ${result.reason}`);
        return;
      }

      logger.info(
        `✅ Entrega ${result.deliveryId} criada — ${result.buyerEmail}`
      );

      webhookLogs.create({
        platform,
        event_type: 'delivery.created',
        payload: JSON.stringify(result),
        status: 'processed',
        ip
      });

    } catch (err) {

      logger.error(
        `❌ Erro ao processar webhook [${platform}]: ${err.message}\n${err.stack}`
      );

      webhookLogs.create({
        platform,
        event_type: eventType,
        payload: JSON.stringify({
          error: err.message,
          stack: err.stack
        }),
        status: 'error',
        ip
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Rotas
// ─────────────────────────────────────────────────────────────

// Endpoint único — pode usar para Kiwify e Yampi
router.post('/', verifyWebhookSignature, handleWebhook);

// Kiwify
router.post('/kiwify', verifyWebhookSignature, (req, res) => {
  req.webhookPlatform = 'kiwify';
  handleWebhook(req, res);
});

// Yampi
router.post('/yampi', verifyWebhookSignature, (req, res) => {
  req.webhookPlatform = 'yampi';
  handleWebhook(req, res);
});

// ─────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'DigitalHub Webhook ativo',
    timestamp: new Date().toISOString()
  });
});

router.get('/kiwify', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'kiwify'
  });
});

router.get('/yampi', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'yampi'
  });
});

module.exports = router;