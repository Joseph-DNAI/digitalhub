// src/routes/deliveries.js — multi-tenant
const express = require('express');
const router  = express.Router();
const { deliveries, webhookLogs } = require('../models/database');
const { retryFailedDeliveries } = require('../services/deliveryService');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(requireAuth);

// Lista de entregas — Free vê apenas as 10 mais recentes
router.get('/', async (req, res) => {
  try {
    const isFree = req.user.plan_id === 'free';
    const limit  = isFree ? 10 : (parseInt(req.query.limit) || 100);
    const all    = await deliveries.findAll(req.tenantId, limit);
    res.json({ success: true, data: all, plan_restricted: isFree });
  } catch (err) {
    logger.error('Erro em /deliveries: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// Stats — Free vê apenas total e hoje (sem taxa de sucesso); delivery_month e max exposto para todos (banner de aviso)
router.get('/stats', async (req, res) => {
  try {
    const stats  = await deliveries.stats(req.tenantId);
    const isFree = req.user.plan_id === 'free';
    const maxDeliveries = req.user.max_deliveries_month || null;
    if (isFree) {
      return res.json({
        success: true,
        data: { total: stats.total, today: stats.today, delivery_month: stats.delivery_month, max_deliveries_month: maxDeliveries },
        plan_restricted: true
      });
    }
    res.json({ success: true, data: { ...stats, max_deliveries_month: maxDeliveries } });
  } catch (err) {
    logger.error('Erro em /stats: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// Logs de webhook — bloqueado no plano Free
router.get('/logs', async (req, res) => {
  try {
    const isFree = req.user.plan_id === 'free';
    if (isFree) {
      return res.status(403).json({
        success: false,
        plan_restricted: true,
        error: 'Logs detalhados disponiveis no plano Basic ou superior.'
      });
    }
    const logs = await webhookLogs.findAll(req.tenantId, parseInt(req.query.limit) || 50);
    res.json({ success: true, data: logs });
  } catch (err) {
    logger.error('Erro em /logs: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

router.post('/retry', async (req, res) => {
  try {
    setImmediate(() => retryFailedDeliveries(req.tenantId));
    res.json({ success: true, message: 'Reprocessamento iniciado' });
  } catch (err) {
    logger.error('Erro em /retry: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

router.post('/test-smtp', async (req, res) => {
  try {
    const { testSmtpConnection } = require('../services/emailService');
    await testSmtpConnection();
    res.json({ success: true, message: 'Conexao OK!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Simula um evento de compra aprovada — util para testes sem depender da plataforma
router.post('/simulate', async (req, res) => {
  try {
    const { processWebhookEvent } = require('../services/deliveryService');
    const platform   = (req.body.platform || 'kiwify').toLowerCase();
    const productId  = String(req.body.product_id  || 'test_product_id');
    const buyerEmail = req.body.buyer_email || req.user.email || 'teste@vaultly.com';
    const buyerName  = req.body.buyer_name  || 'Cliente Teste';
    const orderId    = 'sim_' + Date.now();

    var payload;
    if (platform === 'yampi') {
      payload = {
        event: 'order.paid',
        resource: {
          id:     orderId,
          number: 'SIM001',
          items:  { data: [{ product_id: productId, id: productId }] },
          customer: { data: { first_name: buyerName.split(' ')[0], last_name: buyerName.split(' ')[1] || 'Teste', email: buyerEmail } }
        }
      };
    } else {
      payload = {
        webhook_event_type: 'order_approved',
        order_id:  orderId,
        Product:   { product_id: productId },
        Customer:  { full_name: buyerName, email: buyerEmail }
      };
    }

    const result = await processWebhookEvent(req.tenantId, platform, payload, { isTest: true });
    res.json({ success: true, result, orderId, buyerEmail });
  } catch(err) {
    logger.error('Erro em /simulate: ' + err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
