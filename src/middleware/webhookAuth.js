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

  const { tenantId } = req.params;

  // Busca secret do tenant
  let secret = null;
  if (tenantId) {
    try {
      const { tenants } = require('../models/database');
      const tenant = await tenants.findById(tenantId);
      if (tenant) {
        secret = platform === 'yampi'
          ? tenant.yampi_webhook_secret
          : tenant.kiwify_webhook_secret;
      }
    } catch (e) {
      logger.error('Erro ao buscar tenant para validacao de webhook: ' + e.message);
    }
  }

  // Fallback para variáveis de ambiente
  if (!secret) {
    secret = platform === 'yampi'
      ? process.env.YAMPI_WEBHOOK_SECRET
      : process.env.KIWIFY_WEBHOOK_SECRET;
  }
  if (!secret) secret = process.env.WEBHOOK_SECRET;

  // Sem secret configurado: libera mas avisa (usuario ainda nao configurou o secret no painel)
  // Seguranca real so e ativada apos o usuario cadastrar o secret em Configuracoes
  if (!secret) {
    logger.warn('Webhook sem secret — passando sem validacao — tenant: ' + tenantId + ' | Configure o Secret em Configuracoes para ativar a validacao HMAC');
    return next();
  }

  // Secret configurado mas sem assinatura no header: bloqueia
  const signature =
    req.headers['x-kiwify-signature'] ||
    req.headers['x-yampi-hmac-sha256'] ||
    req.query?.signature ||
    '';

  if (!signature) {
    logger.warn('Webhook bloqueado: secret configurado mas sem assinatura — platform: ' + platform + ' tenant: ' + tenantId);
    return res.status(401).json({ error: 'Assinatura ausente' });
  }

  try {
    const rawBody = req.rawBody || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigClean = signature.replace('sha256=', '');
    const expBuf   = Buffer.from(expected, 'hex');

    let sigBuf;
    try {
      sigBuf = Buffer.from(sigClean, 'hex');
    } catch (e) {
      sigBuf = Buffer.alloc(0);
    }

    const valid =
      sigBuf.length === expBuf.length &&
      crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      logger.warn('Webhook bloqueado: assinatura invalida — ' + platform + ' — tenant: ' + tenantId);
      return res.status(401).json({ error: 'Assinatura invalida' });
    }

    logger.debug('Assinatura valida — ' + platform + ' — tenant: ' + tenantId);
    next();

  } catch (err) {
    logger.error('Erro na verificacao do webhook: ' + err.message);
    return res.status(500).json({ error: 'Erro interno na validacao' });
  }
}

module.exports = { verifyWebhookSignature, detectPlatform };
