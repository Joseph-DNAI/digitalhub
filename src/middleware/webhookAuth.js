// src/middleware/webhookAuth.js
// Valida assinatura de webhook para Kiwify e Yampi

const crypto = require('crypto');
const logger = require('../config/logger');

// ─── Detecta a plataforma pelo header recebido ────────────────────────────────

function detectPlatform(req) {
  if (req.headers['x-kiwify-signature']) return 'kiwify';
  if (req.headers['x-yampi-hmac-sha256']) return 'yampi';
  // Fallback: tenta pelo path
  if (req.path?.includes('kiwify')) return 'kiwify';
  if (req.path?.includes('yampi')) return 'yampi';
  return 'unknown';
}

// ─── Middleware de autenticação multi-plataforma ──────────────────────────────

function verifyWebhookSignature(req, res, next) {
  const platform = detectPlatform(req);
  req.webhookPlatform = platform;

  if (!process.env.WEBHOOK_SECRET) {
    logger.warn('WEBHOOK_SECRET não configurado — validação desativada!');
    return next();
  }

  let signature = null;

  if (platform === 'kiwify') {
    signature = req.headers['x-kiwify-signature'];
  } else if (platform === 'yampi') {
    signature = req.headers['x-yampi-hmac-sha256'];
  } else {
    // Tenta qualquer header de assinatura conhecido
    signature =
      req.headers['x-kiwify-signature'] ||
      req.headers['x-yampi-hmac-sha256'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['authorization']?.replace('Bearer ', '');
  }

  if (!signature) {
    logger.warn(`Requisição sem assinatura — IP: ${req.ip} — Plataforma: ${platform}`);
    return res.status(401).json({ error: 'Assinatura ausente' });
  }

  try {
    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(500).json({ error: 'Erro interno de configuração' });
    }

    const secret = platform === 'yampi'
      ? (process.env.YAMPI_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET)
      : (process.env.KIWIFY_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET);

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature.replace('sha256=', ''), 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn(`Assinatura inválida — Plataforma: ${platform} — IP: ${req.ip}`);
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    logger.debug(`Assinatura verificada — Plataforma: ${platform}`);
    next();

  } catch (err) {
    logger.error(`Erro ao verificar assinatura: ${err.message}`);
    return res.status(500).json({ error: 'Erro na verificação de assinatura' });
  }
}

module.exports = { verifyWebhookSignature, detectPlatform };
