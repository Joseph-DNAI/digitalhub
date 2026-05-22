// src/services/deliveryService.js
// Orquestra: payload normalizado → busca produto → envia email → registra entrega

const { products, deliveries } = require('../models/database');
const { sendProductEmail } = require('./emailService');
const { normalizePayload, isApprovedEvent } = require('./platformAdapter');
const logger = require('../config/logger');

const MAX_ATTEMPTS  = parseInt(process.env.RETRY_ATTEMPTS || '3');
const RETRY_DELAY   = parseInt(process.env.RETRY_DELAY_SECONDS || '60') * 1000;

// ─── Processa um evento recebido (qualquer plataforma) ────────────────────────

async function processWebhookEvent(platform, rawPayload) {
  // 1. Normaliza para formato interno
  const normalized = normalizePayload(platform, rawPayload);

  logger.info(`[${platform.toUpperCase()}] Evento: ${normalized.event} | Pedido: ${normalized.orderId} | Comprador: ${normalized.buyerEmail}`);

  // 2. Verifica se é um evento de compra aprovada
  if (!isApprovedEvent(platform, normalized.event)) {
    logger.debug(`Evento "${normalized.event}" ignorado (não é compra aprovada)`);
    return { ignored: true, reason: `Evento "${normalized.event}" não dispara entrega` };
  }

  // 3. Valida dados mínimos
  if (!normalized.platformProductId || !normalized.buyerEmail) {
    throw new Error(`Dados insuficientes: product_id="${normalized.platformProductId}", email="${normalized.buyerEmail}"`);
  }

  // 4. Busca produto no banco pelo ID da plataforma
  const product = products.findByPlatformId(platform, normalized.platformProductId);

  if (!product) {
    throw new Error(`Produto não cadastrado: plataforma=${platform}, id=${normalized.platformProductId}`);
  }

  if (product.status !== 'active') {
    throw new Error(`Produto "${product.name}" está inativo`);
  }

  // 5. Cria registro de entrega
  const deliveryId = deliveries.create({
    product_id:       product.id,
    platform:         platform,
    platform_order_id: normalized.orderId,
    buyer_name:       normalized.buyerName,
    buyer_email:      normalized.buyerEmail,
    status:           'pending'
  });

  // 6. Tenta enviar o email
  await attemptDelivery(deliveryId, product, normalized);

  return { deliveryId, productName: product.name, buyerEmail: normalized.buyerEmail };
}

// ─── Tentativa de envio com registro de resultado ─────────────────────────────

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

    deliveries.updateStatus(deliveryId, 'delivered');
    logger.info(`✅ Email entregue — delivery: ${deliveryId} — ${normalized.buyerEmail}`);

  } catch (err) {
    logger.error(`❌ Falha no envio — delivery: ${deliveryId} — ${err.message}`);
    deliveries.updateStatus(deliveryId, 'failed', err.message);
    throw err;
  }
}

// ─── Retry automático de entregas com falha ───────────────────────────────────

async function retryFailedDeliveries() {
  const pending = deliveries.findPending();
  if (pending.length === 0) return;

  logger.info(`Reprocessando ${pending.length} entrega(s) pendente(s)...`);

  for (const delivery of pending) {
    const product = products.findById(delivery.product_id);
    if (!product) continue;

    const normalized = {
      buyerEmail: delivery.buyer_email,
      buyerName:  delivery.buyer_name,
      orderId:    delivery.platform_order_id,
      platform:   delivery.platform
    };

    try {
      await attemptDelivery(delivery.id, product, normalized);
    } catch (err) {
      logger.warn(`Retry falhou — delivery ${delivery.id}: ${err.message}`);
    }
  }
}

function startRetryJob() {
  setInterval(retryFailedDeliveries, RETRY_DELAY);
  logger.info(`Job de retry iniciado — intervalo: ${RETRY_DELAY / 1000}s`);
}

module.exports = { processWebhookEvent, retryFailedDeliveries, startRetryJob };
