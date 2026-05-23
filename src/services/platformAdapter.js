// src/services/platformAdapter.js
const logger = require('../config/logger');

function normalizeKiwify(payload) {
  // Kiwify usa webhook_event_type no payload real
  const event =
    payload?.webhook_event_type ||
    payload?.event;

  const productId =
    payload?.Product?.product_id ||
    payload?.Product?.id ||
    payload?.product?.id ||
    payload?.product?.product_id ||
    payload?.product_id;

  const customer =
    payload?.Customer ||
    payload?.customer ||
    {};

  return {
    platform: 'kiwify',
    event,
    orderId: payload?.order_id || payload?.id,
    platformProductId: String(productId || ''),
    buyerEmail: customer?.email || payload?.customer_email,
    buyerName: customer?.full_name || customer?.name || payload?.customer_name,
    buyerPhone: customer?.mobile || customer?.phone || null,
    totalValue: parseFloat(payload?.order_value || payload?.total || 0),
    rawPayload: payload
  };
}

function normalizeYampi(payload) {
  const resource = payload?.resource || {};
  const customer = resource?.customer?.data || {};
  const items    = resource?.items?.data || [];
  const firstItem = items[0] || {};

  return {
    platform: 'yampi',
    event: payload?.event,
    orderId: String(resource?.id || resource?.number || ''),
    platformProductId: String(firstItem?.product_id || firstItem?.id || ''),
    buyerEmail: customer?.email,
    buyerName: [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || customer?.name,
    buyerPhone: customer?.phone || null,
    totalValue: parseFloat(resource?.value_total || 0),
    rawPayload: payload
  };
}

function normalizePayload(platform, payload) {
  logger.debug(`Normalizando payload da plataforma: ${platform}`);
  switch (platform) {
    case 'kiwify': return normalizeKiwify(payload);
    case 'yampi':  return normalizeYampi(payload);
    default:
      logger.warn(`Plataforma desconhecida: ${platform} — usando kiwify como fallback`);
      return normalizeKiwify(payload);
  }
}

// Todos os eventos do Kiwify que indicam pagamento confirmado
const APPROVED_EVENTS = {
  kiwify: [
    'order_approved',
    'payment_approved',
    'purchase_approved',
    'billet_created',   // boleto gerado — Kiwify usa isso no teste
    'order.paid'
  ],
  yampi:   ['order.paid'],
  unknown: ['order_approved', 'order.paid', 'payment_approved', 'billet_created']
};

function isApprovedEvent(platform, event) {
  const events = APPROVED_EVENTS[platform] || APPROVED_EVENTS.unknown;
  return events.includes(event);
}

module.exports = { normalizePayload, isApprovedEvent };
