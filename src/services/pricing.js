// src/services/pricing.js
// Cálculo puro da taxa da Vaultly e do split do Asaas. Sem I/O.
// Margem Vaultly: fixo (centavos) + percentual. Configurável por env.

function feeConfig(overrides) {
  const o = overrides || {};
  const fixedCents = o.fixedCents != null
    ? o.fixedCents
    : parseInt(process.env.VAULTLY_FEE_FIXED_CENTS || '10', 10);
  const percent = o.percent != null
    ? o.percent
    : parseFloat(process.env.VAULTLY_FEE_PERCENT || '1.49');
  return { fixedCents, percent };
}

// Taxa (margem) da Vaultly, em centavos, para uma venda de amountCents.
function vaultlyFeeCents(amountCents, overrides) {
  const { fixedCents, percent } = feeConfig(overrides);
  const variable = Math.round(amountCents * (percent / 100));
  const fee = fixedCents + variable;
  // Trava de segurança: a taxa nunca pode exceder o valor da venda.
  return Math.min(fee, amountCents);
}

// Converte centavos para reais (number com 2 casas) no formato que o Asaas espera.
function centsToReais(cents) {
  return Math.round(cents) / 100;
}

// Monta o array de split do Asaas. A cobrança é criada na conta MASTER da Vaultly,
// que retém a taxa como recebedora principal; o split envia o LÍQUIDO do vendedor
// (valor da venda menos a taxa da Vaultly) para a wallet dele.
function buildSplit({ amountCents, sellerWalletId, overrides }) {
  const feeCents = vaultlyFeeCents(amountCents, overrides);
  const sellerCents = amountCents - feeCents;
  return [{ walletId: sellerWalletId, fixedValue: centsToReais(sellerCents) }];
}

module.exports = { vaultlyFeeCents, centsToReais, buildSplit };
