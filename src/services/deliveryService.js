// src/services/deliveryService.js — multi-tenant
const { products, deliveries, tenants, unmatchedProducts, users, productFiles, queryOne } = require('../models/database');
const { sendProductEmail, sendLimitWarningEmail } = require('./emailService');
const { normalizePayload, isApprovedEvent } = require('./platformAdapter');
const logger = require('../config/logger');

const RETRY_DELAY      = parseInt(process.env.RETRY_DELAY_SECONDS || '60') * 1000;
const FREE_DELAY_MS    = 5 * 60 * 1000; // 5 minutos — planos pagos têm prioridade na fila

async function processWebhookEvent(tenantId, platform, rawPayload, options) {
  const isTest = !!(options && options.isTest);
  const normalized = normalizePayload(platform, rawPayload);

  logger.info('[' + platform + '][' + tenantId.slice(0,8) + ']' + (isTest ? '[TESTE]' : '') + ' Evento: ' + normalized.event + ' | Comprador: ' + normalized.buyerEmail);

  if (!isApprovedEvent(platform, normalized.event)) {
    return { ignored: true, reason: 'Evento "' + normalized.event + '" nao dispara entrega' };
  }

  if (!normalized.platformProductId || !normalized.buyerEmail) {
    throw new Error('Dados insuficientes: product_id="' + normalized.platformProductId + '", email="' + normalized.buyerEmail + '"');
  }

  // Busca tenant e usuário para checar plano
  const tenant = await tenants.findById(tenantId);
  const user   = tenant ? await users.findById(tenant.user_id) : null;
  const isFree = !user || user.plan_id === 'free';

  // ── Restrição de plataforma (plano Free: apenas 1 plataforma) ──────────────
  // Testes internos são livres — não aplicam a restrição de plataforma.
  if (isFree && !isTest) {
    const recentDeliveries = await deliveries.findByTenant(tenantId, 5);
    const usedPlatforms    = [...new Set(recentDeliveries.map(d => d.platform).filter(Boolean))];
    if (usedPlatforms.length > 0 && !usedPlatforms.includes(platform)) {
      logger.warn('Free: plataforma bloqueada — tenant usa ' + usedPlatforms[0] + ', tentativa em ' + platform);
      return {
        ignored: true,
        reason:  'Plano Free permite apenas 1 plataforma (' + usedPlatforms[0] + '). Faca upgrade para usar Kiwify e Yampi ao mesmo tempo.',
        upgrade: true
      };
    }
  }

  const product = await products.findByPlatformId(tenantId, platform, normalized.platformProductId);
  if (!product) {
    await unmatchedProducts.upsert(tenantId, {
      platform,
      platform_product_id: normalized.platformProductId,
      last_buyer_email: normalized.buyerEmail,
      last_buyer_name:  normalized.buyerName,
      last_order_id:    normalized.orderId
    });
    logger.warn('Produto nao mapeado: plataforma=' + platform + ', id=' + normalized.platformProductId);
    return { ignored: true, reason: 'Produto nao mapeado — cadastre no painel', unmapped: true, platformProductId: normalized.platformProductId };
  }
  if (product.status !== 'active') throw new Error('Produto "' + product.name + '" esta inativo');

  const deliveryId = await deliveries.create(tenantId, {
    product_id:        product.id,
    platform,
    platform_order_id: normalized.orderId,
    buyer_name:        normalized.buyerName,
    buyer_email:       normalized.buyerEmail,
    is_test:           isTest
  });

  // ── Delay de entrega (plano Free: fila de baixa prioridade — 5 min) ────────
  // Testes internos entregam na hora para o usuário verificar rapidamente.
  if (isFree && !isTest) {
    logger.info('Free: entrega agendada com atraso de 5min — delivery: ' + deliveryId);
    setTimeout(() => {
      attemptDelivery(deliveryId, product, normalized, tenant, true, user)
        .catch(e => logger.error('Falha na entrega agendada (free): ' + e.message));
    }, FREE_DELAY_MS);
    return { deliveryId, productName: product.name, buyerEmail: normalized.buyerEmail, queued: true };
  }

  // Planos pagos: entrega imediata. Teste no Free mostra branding (igual à entrega real).
  await attemptDelivery(deliveryId, product, normalized, tenant, isFree, user);
  return { deliveryId, productName: product.name, buyerEmail: normalized.buyerEmail };
}

async function attemptDelivery(deliveryId, product, normalized, tenant, showBranding, user) {
  try {
    // Monta a lista de anexos: arquivo principal + extras do combo (Pro+)
    var attachments = [];
    if (product.file_path) attachments.push({ filePath: product.file_path, fileName: product.file_name });
    try {
      var extras = await productFiles.findByProduct(product.tenant_id || (tenant && tenant.id), product.id);
      (extras || []).forEach(function(f) { attachments.push({ filePath: f.file_path, fileName: f.file_name }); });
    } catch (e) { logger.warn('Falha ao buscar arquivos extras: ' + e.message); }

    await sendProductEmail({
      buyerEmail:    normalized.buyerEmail,
      buyerName:     normalized.buyerName,
      productName:   product.name,
      attachments:   attachments,
      filePath:      product.file_path,
      fileName:      product.file_name,
      emailTemplate: product.email_template || (tenant && tenant.email_template) || null,
      orderId:       normalized.orderId,
      resendApiKey:  tenant?.resend_api_key  || process.env.RESEND_API_KEY || process.env.SMTP_PASS,
      fromName:      tenant?.email_from_name    || process.env.EMAIL_FROM_NAME    || 'Vaultly',
      fromAddress:   tenant?.email_from_address || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev',
      showBranding:  showBranding || false
    });
    await deliveries.updateStatus(deliveryId, 'delivered');
    logger.info('Email entregue — delivery: ' + deliveryId);
    if (tenant && user) {
      setImmediate(() => checkLimitWarning(tenant, user).catch(e => logger.warn('checkLimitWarning: ' + e.message)));
    }
  } catch (err) {
    logger.error('Falha — delivery: ' + deliveryId + ' — ' + err.message);
    await deliveries.updateStatus(deliveryId, 'failed', err.message);
    throw err;
  }
}

async function checkLimitWarning(tenant, user) {
  var limit = user.max_deliveries_month;
  if (!limit || limit <= 0) return; // Pro: ilimitado

  var monthKey = new Date().toISOString().slice(0, 7); // ex: "2026-05"

  var row = await queryOne(
    "SELECT COUNT(*) as n FROM deliveries WHERE tenant_id=$1 AND created_at >= date_trunc('month', NOW())",
    [tenant.id]
  );
  var used = parseInt(row ? row.n : 0);
  var pct  = Math.round((used / limit) * 100);

  if (pct < 80) return;

  var tenantFresh = await tenants.findById(tenant.id);
  var upgradeUrl  = process.env.BASE_URL || 'https://vaultly.digital';

  // 95% critical threshold
  if (pct >= 95 && tenantFresh.notif_95_sent_month !== monthKey) {
    await sendLimitWarningEmail({
      userEmail: user.email, userName: user.name,
      planName: user.plan_name || user.plan_id,
      used: used, limit: limit, pct: pct, upgradeUrl: upgradeUrl
    });
    await tenants.update(tenant.id, { notif_95_sent_month: monthKey });
    return;
  }

  // 80% warning threshold (only if not already at critical)
  if (pct >= 80 && pct < 95 && tenantFresh.notif_80_sent_month !== monthKey) {
    await sendLimitWarningEmail({
      userEmail: user.email, userName: user.name,
      planName: user.plan_name || user.plan_id,
      used: used, limit: limit, pct: pct, upgradeUrl: upgradeUrl
    });
    await tenants.update(tenant.id, { notif_80_sent_month: monthKey });
  }
}

async function retryFailedDeliveries(tenantId) {
  const pending = tenantId
    ? await deliveries.findPending(tenantId)
    : await deliveries.findAllPending();

  if (!pending.length) return;
  logger.info('Reprocessando ' + pending.length + ' entrega(s)...');

  for (const delivery of pending) {
    const product = await products.findById(delivery.tenant_id, delivery.product_id);
    if (!product) continue;
    const tenant = await tenants.findById(delivery.tenant_id);
    const user   = tenant ? await users.findById(tenant.user_id) : null;
    const isFree = !user || user.plan_id === 'free';
    try {
      await attemptDelivery(delivery.id, product, {
        buyerEmail: delivery.buyer_email,
        buyerName:  delivery.buyer_name,
        orderId:    delivery.platform_order_id,
        platform:   delivery.platform
      }, tenant, isFree, user);
    } catch (e) {
      logger.warn('Retry falhou — ' + delivery.id + ': ' + e.message);
    }
  }
}

function startRetryJob() {
  setInterval(() => retryFailedDeliveries(), RETRY_DELAY);
  logger.info('Job de retry iniciado — intervalo: ' + (RETRY_DELAY/1000) + 's');
}

module.exports = { processWebhookEvent, retryFailedDeliveries, startRetryJob };
