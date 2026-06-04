// src/routes/pendings.js — pendencias por aba (ponto vermelho no menu)
const express = require('express');
const router  = express.Router();
const { unmatchedProducts, deliveries, sellerAccounts } = require('../models/database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../config/logger');

router.get('/', requireAuth, async (req, res) => {
  try {
    const [unmatched, stats, acc] = await Promise.all([
      unmatchedProducts.findAll(req.tenantId).catch(() => []),
      deliveries.stats(req.tenantId).catch(() => ({ failed: 0 })),
      sellerAccounts.findByTenant(req.tenantId).catch(() => null)
    ]);
    const isPaid = !!(req.user && req.user.plan_id !== 'free');
    res.json({ success: true, pendings: {
      produtos: (unmatched || []).length > 0,
      entregas: !!(stats && stats.failed > 0),
      loja:     !!(isPaid && acc && acc.status === 'active' && !acc.asaas_api_key_enc)
    }});
  } catch (err) {
    logger.error('pendings: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
