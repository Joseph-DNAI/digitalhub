// src/routes/deliveries.js
const express = require('express');
const router  = express.Router();
const { deliveries, webhookLogs } = require('../models/database');
const { testSmtpConnection } = require('../services/emailService');
const { retryFailedDeliveries } = require('../services/deliveryService');
const logger = require('../config/logger');

router.get('/', async (req, res) => {
  try {
    const all = await deliveries.findAll(parseInt(req.query.limit)||100);
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await deliveries.stats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await webhookLogs.findAll(parseInt(req.query.limit)||50);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/retry', async (req, res) => {
  try {
    setImmediate(() => retryFailedDeliveries());
    res.json({ success: true, message: 'Reprocessamento iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/test-smtp', async (req, res) => {
  try {
    await testSmtpConnection();
    res.json({ success: true, message: 'Conexão OK!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
