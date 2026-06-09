// src/routes/seller.js — onboarding e status da conta de recebimento (Asaas)
const express = require('express');
const router  = express.Router();
const fs     = require('fs');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sellerAccounts, payouts, orders } = require('../models/database');
const asaas = require('../services/asaasService');
const { withdrawForTenant, availableBalance, PIX_FEE_CENTS, MIN_NET_CENTS } = require('../services/payoutService');

const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });
// Upload de documentos de KYC (imagem ou PDF, ate 10MB)
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename:    (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^a-z0-9._-]/gi, '_'))
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Use imagem (PNG/JPG/WEBP) ou PDF, ate 10MB.'), ok);
  }
});
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
      const _doc = String(acc.payout_pix_key || '').replace(/\D/g, '');
      const person_type = _doc.length === 14 ? 'CNPJ' : (_doc.length === 11 ? 'CPF' : null);
      safe = { ...rest, has_payout_key: !!asaas_api_key_enc, person_type };
    }
    res.json({ success: true, account: safe });
  } catch (err) {
    logger.error('seller/account: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/seller/balance — saldo disponível, pendente a receber e taxa de saque
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    // Aprovação para SAQUE = KYC do banco aprovado (não confundir com 'status=active', que é só
    // o flag interno de "venda direta ligada"). Atualizado pelo GET /registration-status (aba Loja).
    const approved = !!(acc && String(acc.kyc_status || '').toUpperCase() === 'APPROVED');
    const available = await availableBalance(req.tenantId);
    const netPaid = await orders.sumNetPaid(req.tenantId);
    const settled = await payouts.sumSettled(req.tenantId);
    const pending = Math.max(0, netPaid - settled - available);
    res.json({
      success: true,
      available_cents: available,
      pending_cents: pending,
      pix_fee_cents: PIX_FEE_CENTS,
      min_withdraw_cents: MIN_NET_CENTS + PIX_FEE_CENTS,
      account_approved: approved
    });
  } catch (err) {
    logger.error('seller/balance: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao consultar saldo.' });
  }
});

// GET /api/seller/_probe — diagnóstico (admin): testa caminhos candidatos da API Asaas com a apiKey da subconta
router.get('/_probe', requireAdmin, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    if (!acc || !acc.asaas_api_key_enc) return res.status(409).json({ success: false, error: 'Sem conta de recebimento com chave.' });
    const apiKey = decrypt(acc.asaas_api_key_enc);
    const paths = ['/finance/balance', '/myAccount', '/myAccount/registrationStatus', '/myAccount/status', '/myAccount/commercialInfo', '/myAccount/documents'];
    const probe = [];
    for (const p of paths) {
      try { const r = await asaas.rawGet(apiKey, p); probe.push({ path: p, status: r.status, body: r.body }); }
      catch (e) { probe.push({ path: p, status: 'ERR', body: String(e.message).slice(0, 150) }); }
    }
    if (acc.asaas_account_id) {
      try { const r = await asaas.rawGet(null, '/accounts/' + acc.asaas_account_id); probe.push({ path: '/accounts/{id} (master)', status: r.status, body: r.body }); }
      catch (e) { probe.push({ path: '/accounts/{id} (master)', status: 'ERR', body: String(e.message).slice(0, 150) }); }
    }
    res.json({ success: true, probe: probe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/seller/registration-status — status do cadastro/KYC da subconta (espelha "Análise cadastral")
router.get('/registration-status', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    if (!acc || !acc.asaas_api_key_enc) return res.json({ success: true, account: false, status: null });
    const apiKey = decrypt(acc.asaas_api_key_enc);
    const status = await asaas.getRegistrationStatus(apiKey);
    const general = status && (status.generalApproval || status.general || status.status);
    if (general) {
      const approved = String(general).toUpperCase() === 'APPROVED';
      await sellerAccounts.upsert(req.tenantId, { kyc_status: String(general), status: approved ? 'active' : (acc.status || 'pending') });
    }
    // Email da ativacao + eventual link de onboarding (p/ o vendedor concluir no Asaas)
    let email = null, onboardingUrl = null;
    try {
      const info = await asaas.getAccountInfo(apiKey);
      email = info && info.email;
      onboardingUrl = info && (info.onboardingUrl || info.invoiceUrl || info.loginUrl || info.accountUrl);
    } catch (e) { /* best-effort */ }
    res.json({ success: true, account: true, status: status, email: email, onboarding_url: onboardingUrl });
  } catch (err) {
    logger.error('seller/registration-status: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel consultar o status no banco. ' + err.message });
  }
});

// GET /api/seller/documents — lista os documentos exigidos/enviados da subconta
router.get('/documents', requireAuth, async (req, res) => {
  try {
    const acc = await sellerAccounts.findByTenant(req.tenantId);
    if (!acc || !acc.asaas_api_key_enc) return res.status(409).json({ success: false, error: 'Conta de recebimento nao encontrada.' });
    const apiKey = decrypt(acc.asaas_api_key_enc);
    const documents = await asaas.listAccountDocuments(apiKey);
    res.json({ success: true, documents: documents });
  } catch (err) {
    logger.error('seller/documents: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel listar os documentos. ' + err.message });
  }
});

// POST /api/seller/documents/:id — envia um documento (multipart 'file', campo opcional 'type')
router.post('/documents/:id', requireAuth, function (req, res) {
  docUpload.single('file')(req, res, async function (err) {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    try {
      const acc = await sellerAccounts.findByTenant(req.tenantId);
      if (!acc || !acc.asaas_api_key_enc) return res.status(409).json({ success: false, error: 'Conta nao encontrada.' });
      const apiKey = decrypt(acc.asaas_api_key_enc);
      const out = await asaas.uploadAccountDocument(apiKey, req.params.id, req.body.type, req.file.path, req.file.originalname);
      res.json({ success: true, data: out });
    } catch (e) {
      logger.error('seller/documents upload: ' + e.message);
      res.status(502).json({ success: false, error: 'Falha ao enviar o documento. ' + e.message });
    } finally {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  });
});

// POST /api/seller/withdraw — saque sob demanda (Pix para a chave do vendedor)
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const r = await withdrawForTenant(req.tenantId);
    if (!r.ok) return res.status(400).json({ success: false, error: r.error });
    res.json({ success: true, net_cents: r.net_cents, fee_cents: r.fee_cents, status: r.status });
  } catch (err) {
    logger.error('seller/withdraw: ' + err.message);
    res.status(502).json({ success: false, error: 'Nao foi possivel sacar agora. ' + err.message });
  }
});

// GET /api/seller/payouts — histórico de saques (repasses Pix) do tenant
router.get('/payouts', requireAuth, async (req, res) => {
  try {
    const list = await payouts.findAll(req.tenantId, 50);
    res.json({ success: true, payouts: list });
  } catch (err) {
    logger.error('seller/payouts: ' + err.message);
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
    if (!req.user.email_verified) {
      return res.status(403).json({ success: false, error: 'Confirme seu email para ativar a venda direta.', needs_verification: true });
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
    // Antecipacao automatica do Asaas e exclusiva para contas CNPJ (pessoa juridica)
    const docDigits = String(acc.payout_pix_key || '').replace(/\D/g, '');
    if (docDigits.length === 11) {
      return res.status(400).json({ success: false, not_available: true,
        error: 'O recebimento rapido (antecipacao automatica) e exclusivo para contas CNPJ. Sua conta e pessoa fisica (CPF).' });
    }
    const apiKey = decrypt(acc.asaas_api_key_enc);
    await asaas.enableAutoAnticipation(apiKey);
    res.json({ success: true });
  } catch (err) {
    logger.error('seller/enable-anticipation: ' + err.message);
    const pjOnly = /pessoa jur|invalid_action/i.test(err.message || '');
    if (pjOnly) {
      return res.status(400).json({ success: false, not_available: true,
        error: 'O recebimento rapido (antecipacao automatica) e exclusivo para contas CNPJ (pessoa juridica).' });
    }
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
