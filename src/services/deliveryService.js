// src/services/deliveryService.js — multi-tenant
const { products, deliveries, tenants, unmatchedProducts } = require('../models/database');
const { sendProductEmail } = require('./emailService');
const { normalizePayload, isApprovedEvent } = require('./platformAdapter');
const logger = require('../config/logger');

const RETRY_DELAY = parseInt(process.env.RETRY_DELAY_SECONDS||'60') * 1000;

async function processWebhookEvent(tenantId, platform, rawPayload) {
  const normalized = normalizePayload(platform, rawPayload);

  logger.info(`[${platform}][${tenantId.slice(0,8)}] Evento: ${normalized.event} | Comprador: ${normalized.buyerEmail}`);

  if (!isApprovedEvent(platform, normalized.event)) {
    return { ignored: true, reason: `Evento "${normalized.event}" não dispara entrega` };
  }

  if (!normalized.platformProductId || !normalized.buyerEmail) {
    throw new Error(`Dados insuficientes: product_id="${normalized.platformProductId}", email="${normalized.buyerEmail}"`);
  }

  const product = await products.findByPlatformId(tenantId, platform, normalized.platformProductId);
  if (!product) {
    // Salva como produto nao mapeado para o usuario vincular depois
    await unmatchedProducts.upsert(tenantId, {
      platform,
      platform_product_id: normalized.platformProductId,
      last_buyer_email: normalized.buyerEmail,
      last_buyer_name:  normalized.buyerName,
      last_order_id:    normalized.orderId
    });
    logger.warn('Produto nao mapeado salvo: plataforma=' + platform + ', id=' + normalized.platformProductId + ', comprador=' + normalized.buyerEmail);
    return { ignored: true, reason: 'Produto nao mapeado — cadastre o produto e vincule o arquivo no painel', unmapped: true, platformProductId: normalized.platformProductId };
  }
  if (product.status !== 'active') throw new Error('Produto "' + product.name + '" esta inativo');

  const deliveryId = await deliveries.create(tenantId, {
    product_id: product.id, platform,
    platform_order_id: normalized.orderId,
    buyer_name: normalized.buyerName,
    buyer_email: normalized.buyerEmail
  });

  // Busca configurações do tenant para envio de email
  const tenant = await tenants.findById(tenantId);

  await attemptDelivery(deliveryId, product, normalized, tenant);
  return { deliveryId, productName: product.name, buyerEmail: normalized.buyerEmail };
}

async function attemptDelivery(deliveryId, product, normalized, tenant) {
  try {
    await sendProductEmail({
      buyerEmail:    normalized.buyerEmail,
      buyerName:     normalized.buyerName,
      productName:   product.name,
      filePath:      product.file_path,
      fileName:      product.file_name,
      emailTemplate: product.email_template,
      orderId:       normalized.orderId,
      // Usa config do tenant ou fallback do .env
      resendApiKey:  tenant?.resend_api_key || process.env.RESEND_API_KEY || process.env.SMTP_PASS,
      fromName:      tenant?.email_from_name    || process.env.EMAIL_FROM_NAME    || 'Vaultly',
      fromAddress:   tenant?.email_from_address || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'
    });
    await deliveries.updateStatus(deliveryId, 'delivered');
    logger.info(`✅ Email entregue — delivery: ${deliveryId}`);
  } catch (err) {
    logger.error(`❌ Falha — delivery: ${deliveryId} — ${err.message}`);
    await deliveries.updateStatus(deliveryId, 'failed', err.message);
    throw err;
  }
}

async function retryFailedDeliveries(tenantId) {
  const pending = tenantId
    ? await deliveries.findPending(tenantId)
    : await deliveries.findAllPending();

  if (!pending.length) return;
  logger.info(`Reprocessando ${pending.length} entrega(s)...`);

  for (const delivery of pending) {
    const product = await products.findById(delivery.tenant_id, delivery.product_id);
    if (!product) continue;
    const tenant = await tenants.findById(delivery.tenant_id);
    try {
      await attemptDelivery(delivery.id, product, {
        buyerEmail: delivery.buyer_email,
        buyerName:  delivery.buyer_name,
        orderId:    delivery.platform_order_id,
        platform:   delivery.platform
      }, tenant);
    } catch(e) {
      logger.warn(`Retry falhou — ${delivery.id}: ${e.message}`);
    }
  }
}

function startRetryJob() {
  setInterval(() => retryFailedDeliveries(), RETRY_DELAY);
  logger.info(`Job de retry iniciado — intervalo: ${RETRY_DELAY/1000}s`);
}

module.exports = { processWebhookEvent, retryFailedDeliveries, startRetryJob };
