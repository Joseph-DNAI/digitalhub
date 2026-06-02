// src/services/payoutService.js — repasse automatico via Pix para a chave do vendedor.
const { sellerAccounts, payouts } = require('../models/database');
const asaas = require('./asaasService');
const { decrypt } = require('./crypto');
const logger = require('../config/logger');

const INTERVAL_MS = parseInt(process.env.PAYOUT_INTERVAL_HOURS || '2', 10) * 60 * 60 * 1000;

async function runPayouts() {
  let accounts;
  try {
    accounts = await sellerAccounts.findAllActiveWithKey();
  } catch (e) {
    logger.error('payout: falha ao listar contas — ' + e.message);
    return;
  }
  for (const acc of (accounts || [])) {
    if (!acc.payout_pix_key || !acc.asaas_api_key_enc) continue;
    try {
      const apiKey = decrypt(acc.asaas_api_key_enc);
      const balanceCents = await asaas.getSubaccountBalance(apiKey);
      if (balanceCents <= 0) continue;
      const transfer = await asaas.createPixTransfer(apiKey, {
        pixKey: acc.payout_pix_key,
        valueReais: balanceCents / 100
      });
      await payouts.create({ tenant_id: acc.tenant_id, amount_cents: balanceCents, asaas_transfer_id: transfer && transfer.id, status: 'done' });
      logger.info('Repasse R$' + (balanceCents / 100).toFixed(2) + ' — tenant ' + acc.tenant_id.slice(0, 8));
    } catch (e) {
      logger.error('Repasse falhou — tenant ' + (acc.tenant_id || '').slice(0, 8) + ': ' + e.message);
      try { await payouts.create({ tenant_id: acc.tenant_id, amount_cents: 0, status: 'failed', error: e.message }); } catch (_) {}
    }
  }
}

function startPayoutJob() {
  setInterval(function () { runPayouts().catch(function (e) { logger.error('payout job: ' + e.message); }); }, INTERVAL_MS);
  logger.info('Job de saque automatico iniciado — intervalo: ' + (INTERVAL_MS / 3600000) + 'h');
}

module.exports = { runPayouts, startPayoutJob };
