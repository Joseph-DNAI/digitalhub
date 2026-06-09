// src/services/payoutService.js — repasse automatico via Pix para a chave do vendedor.
const { sellerAccounts, payouts } = require('../models/database');
const asaas = require('./asaasService');
const { decrypt } = require('./crypto');
const logger = require('../config/logger');

const INTERVAL_MS = parseInt(process.env.PAYOUT_INTERVAL_HOURS || '2', 10) * 60 * 60 * 1000;
// Taxa fixa do Pix de saque cobrada pelo Asaas na subconta — reservamos para a transferencia nao falhar.
const PIX_FEE_CENTS = parseInt(process.env.PAYOUT_PIX_FEE_CENTS || '200', 10);
// So vale sacar quando o saldo cobre a taxa + um minimo (evita repasses irrisorios).
const MIN_NET_CENTS = parseInt(process.env.PAYOUT_MIN_CENTS || '500', 10);

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
      // Reserva a taxa do Pix de saque; so transfere o liquido e quando vale a pena.
      const netCents = balanceCents - PIX_FEE_CENTS;
      if (netCents < MIN_NET_CENTS) continue;
      // Token idempotente por janela: um mesmo saldo retentado dentro da mesma janela
      // carrega o mesmo externalReference, ajudando Asaas/auditoria a nao pagar duas vezes.
      const windowRef = 'payout_' + acc.tenant_id + '_' + Math.floor(Date.now() / INTERVAL_MS);
      const transfer = await asaas.createPixTransfer(apiKey, {
        pixKey: acc.payout_pix_key,
        valueReais: netCents / 100,
        externalReference: windowRef
      });
      // Status real chega depois pelo webhook TRANSFER_*; aqui usamos o retorno do Asaas.
      const st = transfer && transfer.status;
      const initial = st === 'DONE' ? 'done' : (['FAILED', 'CANCELLED'].includes(st) ? 'failed' : 'pending');
      await payouts.create({ tenant_id: acc.tenant_id, amount_cents: netCents, asaas_transfer_id: transfer && transfer.id, status: initial });
      logger.info('Repasse liquido R$' + (netCents / 100).toFixed(2) + ' (taxa R$' + (PIX_FEE_CENTS / 100).toFixed(2) + ', ' + initial + ') — tenant ' + acc.tenant_id.slice(0, 8));
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
