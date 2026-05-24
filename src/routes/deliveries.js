// src/routes/deliveries.js — multi-tenant
const express = require('express');
const router  = express.Router();
const { deliveries, webhookLogs } = require('../models/database');
const { retryFailedDeliveries } = require('../services/deliveryService');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const all = await deliveries.findAll(req.tenantId, parseInt(req.query.limit)||100);
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await deliveries.stats(req.tenantId);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await webhookLogs.findAll(req.tenantId, parseInt(req.query.limit)||50);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/retry', async (req, res) => {
  try {
    setImmediate(() => retryFailedDeliveries(req.tenantId));
    res.json({ success: true, message: 'Reprocessamento iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/test-smtp', async (req, res) => {
  try {
    const { testSmtpConnection } = require('../services/emailService');
    await testSmtpConnection();
    res.json({ success: true, message: 'Conexão OK!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
