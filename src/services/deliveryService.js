// src/services/deliveryService.js
const { products, deliveries } = require('../models/database');
const { sendProductEmail } = require('./emailService');
const { normalizePayload, isApprovedEvent } = require('./platformAdapter');
const logger = require('../config/logger');

const RETRY_DELAY = parseInt(process.env.RETRY_DELAY_SECONDS||'60') * 1000;

async function processWebhookEvent(platform, rawPayload) {
  const normalized = normalizePayload(platform, rawPayload);

  logger.info(`[${platform.toUpperCase()}] Evento: ${normalized.event} | Pedido: ${normalized.orderId} | Comprador: ${normalized.buyerEmail}`);

  if (!isApprovedEvent(platform, normalized.event)) {
    return { ignored: true, reason: `Evento "${normalized.event}" não dispara entrega` };
  }

  if (!normalized.platformProductId || !normalized.buyerEmail) {
    throw new Error(`Dados insuficientes: product_id="${normalized.platformProductId}", email="${normalized.buyerEmail}"`);
  }

  const product = await products.findByPlatformId(platform, normalized.platformProductId);
  if (!product) throw new Error(`Produto não cadastrado: plataforma=${platform}, id=${normalized.platformProductId}`);
  if (product.status !== 'active') throw new Error(`Produto "${product.name}" está inativo`);

  const deliveryId = await deliveries.create({
    product_id:        product.id,
    platform,
    platform_order_id: normalized.orderId,
    buyer_name:        normalized.buyerName,
    buyer_email:       normalized.buyerEmail
  });

  await attemptDelivery(deliveryId, product, normalized);
  return { deliveryId, productName: product.name, buyerEmail: normalized.buyerEmail };
}

async function attemptDelivery(deliveryId, product, normalized) {
  try {
    await sendProductEmail({
      buyerEmail:    normalized.buyerEmail,
      buyerName:     normalized.buyerName,
      productName:   product.name,
      filePath:      product.file_path,
      fileName:      product.file_name,
      emailTemplate: product.email_template,
      orderId:       normalized.orderId,
      platform:      normalized.platform
    });
    await deliveries.updateStatus(deliveryId, 'delivered');
    logger.info(`✅ Email entregue — delivery: ${deliveryId} — ${normalized.buyerEmail}`);
  } catch (err) {
    logger.error(`❌ Falha no envio — delivery: ${deliveryId} — ${err.message}`);
    await deliveries.updateStatus(deliveryId, 'failed', err.message);
    throw err;
  }
}

async function retryFailedDeliveries() {
  const pending = await deliveries.findPending();
  if (pending.length === 0) return;
  logger.info(`Reprocessando ${pending.length} entrega(s) pendente(s)...`);
  for (const delivery of pending) {
    const product = await products.findById(delivery.product_id);
    if (!product) continue;
    try {
      await attemptDelivery(delivery.id, product, {
        buyerEmail: delivery.buyer_email,
        buyerName:  delivery.buyer_name,
        orderId:    delivery.platform_order_id,
        platform:   delivery.platform
      });
    } catch (err) {
      logger.warn(`Retry falhou — delivery ${delivery.id}: ${err.message}`);
    }
  }
}

function startRetryJob() {
  setInterval(retryFailedDeliveries, RETRY_DELAY);
  logger.info(`Job de retry iniciado — intervalo: ${RETRY_DELAY/1000}s`);
}

module.exports = { processWebhookEvent, retryFailedDeliveries, startRetryJob };
