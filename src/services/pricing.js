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

// Estimativa da taxa do Asaas (gateway), em centavos. Configurável por env porque
// as taxas mudam (ex.: promoções). O Asaas desconta a taxa dele ANTES do split, então
// precisamos subtraí-la para o split caber em (cobrança − taxa Asaas).
function asaasFeeCents(method, amountCents, overrides) {
  const o = overrides || {};
  if (method === 'card') {
    const pct   = o.cardPercent    != null ? o.cardPercent    : parseFloat(process.env.ASAAS_CARD_PERCENT || '1.99');
    const fixed = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
    return Math.round(amountCents * (pct / 100)) + fixed;
  }
  // Pix de recebimento é gratuito no Asaas, e desabilitamos as notificações (R$0,99),
  // então a taxa de Pix é 0 por padrão. Configurável caso o Asaas passe a cobrar algo.
  const pixFixed = o.pixFixedCents != null ? o.pixFixedCents : parseInt(process.env.ASAAS_PIX_FEE_CENTS || '0', 10);
  return pixFixed;
}

// Monta o array de split do Asaas. A cobrança é criada na conta MASTER da Vaultly,
// que retém a margem como recebedora principal; o split envia ao vendedor o que sobra
// após a taxa do Asaas E a margem da Vaultly (o vendedor absorve a taxa do banco).
// A taxa da Vaultly só é cobrada quando chargeVaultlyFee !== false (plano Free);
// planos pagos são isentos (a assinatura cobre a Vaultly), então recebem mais no split.
function buildSplit({ amountCents, sellerWalletId, method, chargeVaultlyFee, overrides }) {
  const feeCents     = (chargeVaultlyFee === false) ? 0 : vaultlyFeeCents(amountCents, overrides);
  const gatewayCents = asaasFeeCents(method, amountCents, overrides);
  const sellerCents  = Math.max(0, amountCents - feeCents - gatewayCents);
  return [{ walletId: sellerWalletId, fixedValue: centsToReais(sellerCents) }];
}

// Gross-up do cartao: valor a cobrar para que, apos a taxa do cartao (pct + fixo),
// o vendedor receba o preco cheio. Arredonda p/ cima (vendedor nunca recebe a menos).
function cardChargeCents(priceCents, overrides) {
  const o = overrides || {};
  const pct   = (o.cardPercent != null ? o.cardPercent : parseFloat(process.env.ASAAS_CARD_PERCENT || '1.99')) / 100;
  const fixed = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
  if (!(pct < 1)) return priceCents;
  return Math.ceil((priceCents + fixed) / (1 - pct));
}

module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit, cardChargeCents };
