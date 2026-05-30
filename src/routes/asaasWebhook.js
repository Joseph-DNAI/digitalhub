// src/routes/asaasWebhook.js — recebe eventos de pagamento do Asaas
const express = require('express');
const router  = express.Router();
const { orders } = require('../models/database');
const { isValidWebhookToken } = require('../services/asaasService');
const { processDirectOrder } = require('../services/deliveryService');
const logger = require('../config/logger');

const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const REFUND_EVENTS = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'];

router.post('/webhook', async (req, res) => {
  const token = req.headers['asaas-access-token'];
  if (!isValidWebhookToken(token)) {
    logger.warn('Asaas webhook com token invalido');
    return res.status(401).json({ error: 'token invalido' });
  }

  const event = req.body && req.body.event;
  const payment = (req.body && req.body.payment) || {};
  res.status(200).json({ received: true });

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
      } else {
        logger.debug('Asaas evento ignorado: ' + event);
      }
    } catch (err) {
      logger.error('Asaas webhook processing: ' + err.message);
    }
  });
});

module.exports = router;
