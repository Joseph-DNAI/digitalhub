// src/routes/asaasWebhook.js — recebe eventos de pagamento do Asaas
const express = require('express');
const router  = express.Router();
const { orders, payouts, products } = require('../models/database');
const { isValidWebhookToken } = require('../services/asaasService');
const { processDirectOrder } = require('../services/deliveryService');
const { callRefundWebhook } = require('../services/saleWebhookService');
const logger = require('../config/logger');

const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const REFUND_EVENTS = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'];
// Saque (repasse Pix para o vendedor)
const TRANSFER_DONE_EVENTS   = ['TRANSFER_DONE'];
const TRANSFER_FAILED_EVENTS = ['TRANSFER_FAILED', 'TRANSFER_BLOCKED', 'TRANSFER_CANCELLED'];

router.post('/webhook', async (req, res) => {
  const token = req.headers['asaas-access-token'];
  if (!isValidWebhookToken(token)) {
    logger.warn('Asaas webhook com token invalido');
    return res.status(401).json({ error: 'token invalido' });
  }

  const event = req.body && req.body.event;
  const payment = (req.body && req.body.payment) || {};
  const transfer = (req.body && req.body.transfer) || {};
  res.status(200).json({ received: true });

  // Eventos de saque (transferencia Pix) — atualizam o status do payout
  if (event && event.indexOf('TRANSFER_') === 0) {
    setImmediate(async () => {
      try {
        if (!transfer.id) { logger.warn('Asaas webhook TRANSFER sem id'); return; }
        const po = await payouts.findByTransferId(transfer.id);
        if (!po) { logger.warn('Asaas TRANSFER ' + event + ': payout nao encontrado p/ ' + transfer.id); return; }
        if (TRANSFER_DONE_EVENTS.includes(event)) {
          await payouts.updateStatusByTransferId(transfer.id, 'done', null);
          logger.info('Saque concluido — payout ' + po.id);
        } else if (TRANSFER_FAILED_EVENTS.includes(event)) {
          await payouts.updateStatusByTransferId(transfer.id, 'failed', transfer.failReason || event);
          logger.warn('Saque falhou (' + event + ') — payout ' + po.id);
        } else {
          logger.debug('Asaas TRANSFER evento ignorado: ' + event);
        }
      } catch (err) {
        logger.error('Asaas webhook transfer: ' + err.message);
      }
    });
    return;
  }

  setImmediate(async () => {
    try {
      if (!payment.id) { logger.warn('Asaas webhook sem payment.id'); return; }
      const order = await orders.findByAsaasPaymentId(payment.id);
      if (!order) { logger.warn('Asaas webhook: order nao encontrada p/ payment ' + payment.id); return; }

      if (PAID_EVENTS.includes(event)) {
        const claimed = await orders.claimForDelivery(order.id);
        if (!claimed) { logger.debug('Order ja processada (idempotente): ' + order.id); return; }
        try {
          const deliveryId = await processDirectOrder(order);
          await orders.setDeliveryId(order.id, deliveryId);
          logger.info('Venda direta paga e entregue — order ' + order.id + ', delivery ' + deliveryId);
        } catch (e) {
          logger.error('Entrega da order ' + order.id + ' falhou; sera reprocessada pelo job de retry: ' + e.message);
        }
      } else if (REFUND_EVENTS.includes(event)) {
        const newStatus = event === 'PAYMENT_REFUNDED' ? 'refunded' : 'chargeback';
        await orders.updateStatus(order.id, newStatus);
        logger.info('Order ' + order.id + ' -> ' + newStatus + ' (sem desentrega; ver disclaimer)');
        // Entrega por webhook: avisa o endpoint do vendedor p/ revogar (ex.: licenca)
        try {
          const prod = await products.findById(order.tenant_id, order.product_id);
          if (prod && prod.delivery_type === 'webhook') setImmediate(() => callRefundWebhook(prod, order));
        } catch (e) { logger.warn('refund webhook (order ' + order.id + '): ' + e.message); }
      } else {
        logger.debug('Asaas evento ignorado: ' + event);
      }
    } catch (err) {
      logger.error('Asaas webhook processing: ' + err.message);
    }
  });
});

module.exports = router;
