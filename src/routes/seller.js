// src/routes/seller.js — onboarding e status da conta de recebimento (Asaas)
const express = require('express');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sellerAccounts } = require('../models/database');
const asaas = require('../services/asaasService');
const { encrypt, decrypt } = require('../services/crypto');
const { feeSimulation } = require('../services/pricing');
const logger = require('../config/logger');

// GET /api/seller/account — status da conta de recebimento do tenant
router.get('/account', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    let safe = null;
    if (acc) {
      const { asaas_api_key_enc, ...rest } = acc;
      safe = { ...rest, has_payout_key: !!asaas_api_key_enc };
    }
    res.json({ success: true, account: safe });
  } catch (err) {
    logger.error('seller/account: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/seller/onboarding — cria a subconta no Asaas (white-label)
router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const { name, email, cpfCnpj, mobilePhone, birthDate, incomeValue,
            postalCode, address, addressNumber, province, accept_pix, accept_card, pix_key_declared } = req.body;
    if (!name || !email || !cpfCnpj) {
      return res.status(400).json({ success: false, error: 'name, email e cpfCnpj sao obrigatorios.' });
    }
    if (pix_key_declared !== true) {
      return res.status(400).json({ success: false, error: 'E necessario declarar seu CPF/CNPJ como chave Pix para o repasse automatico.' });
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
      asaas_api_key_enc: created.apiKey ? encrypt(created.apiKey) : null,
      payout_pix_key:    String(cpfCnpj).replace(/\D/g, ''),
      status:           'active',
      kyc_status:       created.status || null,
      accept_pix:       accept_pix !== false,
      accept_card:      accept_card !== false
    });
    logger.info('Subconta Asaas ativa — tenant ' + req.tenantId.slice(0, 8));
    if (created.apiKey) {
      try { await asaas.enableAutoAnticipation(created.apiKey); }
      catch (e) { logger.warn('Antecipacao automatica nao habilitada agora (tenant ' + req.tenantId.slice(0, 8) + '): ' + e.message); }
    }
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

// POST /api/seller/enable-anticipation — (re)habilita a antecipacao automatica da subconta
router.post('/enable-anticipation', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    if (!acc || !acc.asaas_api_key_enc) {
      return res.status(409).json({ success: false, error: 'Conta de recebimento sem chave para antecipacao. Reative a conta.' });
    }
    const apiKey = decrypt(acc.asaas_api_key_enc);
    await asaas.enableAutoAnticipation(apiKey);
    res.json({ success: true });
  } catch (err) {
    logger.error('seller/enable-anticipation: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel ativar a antecipacao. ' + err.message });
  }
});

// GET /api/seller/fee-simulator?amount_cents=X — simula taxas/recebimento (consulta)
router.get('/fee-simulator', requireAuth, async (req, res) => {
  try {
    const amount = parseInt(req.query.amount_cents, 10);
    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    if (!Number.isInteger(amount) || amount < MIN || amount > 100000000) {
      return res.status(400).json({ success: false, error: 'Valor invalido para simulacao.' });
    }
    res.json({ success: true, simulation: feeSimulation(amount) });
  } catch (err) {
    logger.error('seller/fee-simulator: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

module.exports = router;
