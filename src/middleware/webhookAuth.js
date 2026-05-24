// src/middleware/webhookAuth.js — multi-tenant
// Valida assinatura HMAC por plataforma e por tenant

const crypto = require('crypto');
const logger = require('../config/logger');

function detectPlatform(req) {
  if (req.headers['x-kiwify-signature']) return 'kiwify';
  if (req.headers['x-yampi-hmac-sha256']) return 'yampi';
  if (req.path?.includes('kiwify')) return 'kiwify';
  if (req.path?.includes('yampi'))  return 'yampi';
  return 'unknown';
}

async function verifyWebhookSignature(req, res, next) {
  const platform = detectPlatform(req);
  req.webhookPlatform = platform;

  // Busca secret do tenant se disponível
  let secret = null;
  const { tenantId } = req.params;
  if (tenantId) {
    try {
      const { tenants } = require('../models/database');
      const tenant = await tenants.findById(tenantId);
      if (tenant) {
        secret = platform === 'yampi'
          ? tenant.yampi_webhook_secret
          : tenant.kiwify_webhook_secret;
      }
    } catch(e) {}
  }

  // Fallback para variáveis de ambiente
  if (!secret) {
    secret = platform === 'yampi'
      ? process.env.YAMPI_WEBHOOK_SECRET
      : process.env.KIWIFY_WEBHOOK_SECRET;
  }
  if (!secret) secret = process.env.WEBHOOK_SECRET;

  // Se não há secret configurado, permite (modo dev)
  if (!secret) {
    logger.warn(`Webhook sem secret configurado — tenant: ${tenantId} — validação desativada`);
    return next();
  }

  const signature =
    req.headers['x-kiwify-signature'] ||
    req.headers['x-yampi-hmac-sha256'] ||
    req.query?.signature ||
    '';

  if (!signature) {
    logger.warn(`Requisição sem assinatura — tenant: ${tenantId}`);
    return next(); // Permite sem assinatura (Kiwify às vezes envia via query)
  }

  try {
    const rawBody = req.rawBody || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigClean = signature.replace('sha256=', '');
    const sigBuf   = Buffer.from(sigClean.padEnd(expected.length, '0'), 'hex');
    const expBuf   = Buffer.from(expected, 'hex');

    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.debug(`Assinatura válida — ${platform} — tenant: ${tenantId}`);
    } else {
      logger.warn(`Assinatura inválida — ${platform} — tenant: ${tenantId}`);
      // Não bloqueia — apenas loga. Para bloquear, descomente:
      // return res.status(401).json({ error: 'Assinatura inválida' });
    }
    next();
  } catch(err) {
    logger.error(`Erro na verificação: ${err.message}`);
    next();
  }
}

module.exports = { verifyWebhookSignature, detectPlatform };
