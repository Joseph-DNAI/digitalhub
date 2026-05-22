// src/routes/deliveries.js
// Histórico de entregas, estatísticas e logs de webhook

const express = require('express');
const router = express.Router();
const { deliveries, webhookLogs } = require('../models/database');
const { testSmtpConnection } = require('../services/emailService');
const { retryFailedDeliveries } = require('../services/deliveryService');
const logger = require('../config/logger');

// GET /api/deliveries — lista todas as entregas
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const all = deliveries.findAll(limit);
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deliveries/stats — estatísticas do dashboard
router.get('/stats', (req, res) => {
  try {
    const stats = deliveries.stats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deliveries/logs — logs do webhook
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = webhookLogs.findAll(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deliveries/retry — força reprocessamento de falhas
router.post('/retry', async (req, res) => {
  try {
    logger.info('Retry manual disparado via API');
    // Roda em background
    setImmediate(() => retryFailedDeliveries());
    res.json({ success: true, message: 'Reprocessamento iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deliveries/test-smtp — testa a conexão SMTP
router.post('/test-smtp', async (req, res) => {
  try {
    await testSmtpConnection();
    res.json({ success: true, message: 'Conexão SMTP OK!' });
  } catch (err) {
    logger.error(`Teste SMTP falhou: ${err.message}`);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
