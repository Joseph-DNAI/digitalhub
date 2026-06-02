// src/routes/seller.js — onboarding e status da conta de recebimento (Asaas)
const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
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
    // Venda direta e exclusiva de assinantes (planos pagos). Protege o custo de R$12,90/subconta.
    if (!req.user || req.user.plan_id === 'free') {
      return res.status(403).json({ success: false, error: 'A venda direta esta disponivel a partir do plano Starter. Faca upgrade para ativar.', needs_upgrade: true });
    }
    // Idempotente: se este tenant ja tem subconta registrada, reutiliza (nunca cria outra).
    const existing = await sellerAccounts.findByTenant(req.tenantId);
    if (existing && existing.asaas_account_id) {
      const acc = await sellerAccounts.upsert(req.tenantId, {
        status:      'active',
        accept_pix:  accept_pix !== false,
        accept_card: accept_card !== false
      });
      return res.json({ success: true, account: acc, reused: true });
    }

    // Cria no Asaas; se falhar, tenta adotar uma subconta ja existente p/ este CPF/CNPJ
    // (cobre o caso do Asaas ter criado a conta mas devolvido erro, evitando duplicatas).
    let created;
    try {
      created = await asaas.createSubaccount({ name, email, cpfCnpj, mobilePhone, birthDate, incomeValue,
                                               postalCode, address, addressNumber, province });
    } catch (e) {
      const found = await asaas.findSubaccountByCpfCnpj(cpfCnpj).catch(() => null);
      if (!found || !found.accountId) throw e;
      created = found;
      logger.warn('Subconta ja existia no Asaas — adotada (tenant ' + req.tenantId.slice(0, 8) + ')');
    }
    const acc = await sellerAccounts.upsert(req.tenantId, {
      asaas_account_id: created.accountId,
      asaas_wallet_id:  created.walletId,
      status:           'active',
      kyc_status:       created.status || null,
      accept_pix:       accept_pix !== false,
      accept_card:      accept_card !== false
    });
    logger.info('Subconta Asaas ativa — tenant ' + req.tenantId.slice(0, 8));
    res.status(201).json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/onboarding: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel criar a conta de recebimento. ' + err.message });
  }
});

// PUT /api/seller/methods — atualiza meios aceitos (Pix/cartao)
router.put('/methods', requireAuth, async (req, res) => {
  try {
    const { accept_pix, accept_card, pass_card_fee_to_buyer } = req.body;
    const data = {
      accept_pix: accept_pix !== false,
      accept_card: accept_card !== false
    };
    if (pass_card_fee_to_buyer !== undefined) data.pass_card_fee_to_buyer = !!pass_card_fee_to_buyer;
    const acc = await sellerAccounts.upsert(req.tenantId, data);
    res.json({ success: true, account: acc });
  } catch (err) {
    logger.error('seller/methods: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/seller/admin/accounts — lista todas as subcontas criadas no Asaas (admin)
router.get('/admin/accounts', requireAdmin, async (req, res) => {
  try {
    const list = await asaas.listSubaccounts(100);
    res.json({ success: true, accounts: (list || []).map(a => ({
      id: a.id, name: a.name, email: a.email, cpfCnpj: a.cpfCnpj, walletId: a.walletId, status: a.status
    })) });
  } catch (err) {
    logger.error('seller/admin/accounts: ' + err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

module.exports = router;
