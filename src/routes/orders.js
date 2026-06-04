// src/routes/orders.js — pedidos da venda direta (painel do vendedor)
const express = require('express');
const router  = express.Router();
const { orders } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.use(requireAuth);

router.get('/stats', async (req, res) => {
  try {
    const stats = await orders.stats(req.tenantId);
    res.json({ success: true, stats: stats });
  } catch (err) {
    logger.error('orders/stats: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const list = await orders.findAll(req.tenantId, 100);
    res.json({ success: true, orders: list });
  } catch (err) {
    logger.error('orders/list: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
