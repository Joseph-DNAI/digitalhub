// src/routes/seller.js — onboarding e status da conta de recebimento (Asaas)
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sellerAccounts } = require('../models/database');
const asaas = require('../services/asaasService');
const logger = require('../config/logger');

// GET /api/seller/account — status da conta de recebimento do tenant
router.get('/account', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    res.json({ success: true, account: acc || null });
  } catch (err) {
    logger.error('seller/account: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/seller/onboarding — cria a subconta no Asaas (white-label)
router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const { name, email, cpfCnpj, mobilePhone, birthDate, incomeValue,
            postalCode, address, addressNumber, province, accept_pix, accept_card } = req.body;
    if (!name || !email || !cpfCnpj) {
      return res.status(400).json({ success: false, error: 'name, email e cpfCnpj sao obrigatorios.' });
    }
    const existing = await sellerAccounts.findByTenant(req.tenantId);
    if (existing && existing.status === 'active') {
      return res.status(409).json({ success: false, error: 'Conta de recebimento ja ativa.' });
    }

    const created = await asaas.createSubaccount({ name, email, cpfCnpj, mobilePhone, birthDate, incomeValue,
                                                   postalCode, address, addressNumber, province });
    const acc = await sellerAccounts.upsert(req.tenantId, {
      asaas_account_id: created.accountId,
      asaas_wallet_id:  created.walletId,
      status:           'active',
      kyc_status:       created.status || null,
      accept_pix:       accept_pix !== false,
      accept_card:      accept_card !== false
    });
    logger.info('Subconta Asaas criada — tenant ' + req.tenantId.slice(0, 8));
    res.status(201).json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/onboarding: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel criar a conta de recebimento. ' + err.message });
  }
});

// PUT /api/seller/methods — atualiza meios aceitos (Pix/cartao)
router.put('/methods', requireAuth, async (req, res) => {
  try {
    const { accept_pix, accept_card } = req.body;
    const acc = await sellerAccounts.upsert(req.tenantId, {
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    });
    res.json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/methods: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
