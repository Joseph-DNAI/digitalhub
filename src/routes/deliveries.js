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

// Stats — Free vê apenas total e hoje (sem taxa de sucesso, sem detalhes)
router.get('/stats', async (req, res) => {
  try {
    const stats  = await deliveries.stats(req.tenantId);
    const isFree = req.user.plan_id === 'free';
    if (isFree) {
      return res.json({
        success: true,
        data: { total: stats.total, today: stats.today },
        plan_restricted: true
      });
    }
    res.json({ success: true, data: stats });
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

module.exports = router;
