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

// Monta o array de split do Asaas: manda a taxa da Vaultly para a wallet master.
// O restante fica automaticamente com o recebedor principal (subconta do vendedor),
// pois a cobrança é criada NA subconta do vendedor com split para a Vaultly.
function buildSplit({ amountCents, vaultlyWalletId, overrides }) {
  const feeCents = vaultlyFeeCents(amountCents, overrides);
  return [{ walletId: vaultlyWalletId, fixedValue: centsToReais(feeCents) }];
}

module.exports = { vaultlyFeeCents, centsToReais, buildSplit };
