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

// Config das taxas de antecipacao do cartao (mensais). Configuravel por env.
function anticipConfig(overrides) {
  const o = overrides || {};
  const avista = o.anticipAvistaPercent != null
    ? o.anticipAvistaPercent
    : parseFloat(process.env.ANTICIP_AVISTA_PERCENT || '1.15');
  const parcelado = o.anticipParceladoPercent != null
    ? o.anticipParceladoPercent
    : parseFloat(process.env.ANTICIP_PARCELADO_PERCENT || '1.6');
  return { avista, parcelado };
}

// Percentual de antecipacao (numero, ex.: 1.15) para N parcelas.
// A vista (N<=1) = taxa a vista; parcelado = taxa mensal * (N+1)/2 (media de meses adiantados).
function anticipPercent(installments, overrides) {
  const n = Math.max(1, parseInt(installments || 1, 10));
  const { avista, parcelado } = anticipConfig(overrides);
  if (n <= 1) return avista;
  return parcelado * (n + 1) / 2;
}

// Custo da antecipacao do cartao, em centavos, para amountCents em N parcelas.
function anticipationFeeCents(amountCents, installments, overrides) {
  return Math.round(amountCents * (anticipPercent(installments, overrides) / 100));
}

// Percentual do cartao por faixa de parcelas (Asaas cobra escalonado). Configuravel por env.
// Defaults = tabela promocional atual (a vista 1,99 · 2-6x 2,49 · 7-12x 2,99 · 13-21x 3,29).
function cardPercent(installments, overrides) {
  const o = overrides || {};
  const n = Math.max(1, parseInt(installments || 1, 10));
  if (n <= 1)  return o.cardPctAvista != null ? o.cardPctAvista : parseFloat(process.env.ASAAS_CARD_PCT_AVISTA || process.env.ASAAS_CARD_PERCENT || '1.99');
  if (n <= 6)  return o.cardPct2_6   != null ? o.cardPct2_6   : parseFloat(process.env.ASAAS_CARD_PCT_2_6   || '2.49');
  if (n <= 12) return o.cardPct7_12  != null ? o.cardPct7_12  : parseFloat(process.env.ASAAS_CARD_PCT_7_12  || '2.99');
  return o.cardPct13_21 != null ? o.cardPct13_21 : parseFloat(process.env.ASAAS_CARD_PCT_13_21 || '3.29');
}

// Estimativa da taxa do Asaas (gateway), em centavos. Configurável por env porque
// as taxas mudam (ex.: promoções). O Asaas desconta a taxa dele ANTES do split, então
// precisamos subtraí-la para o split caber em (cobrança − taxa Asaas).
function asaasFeeCents(method, amountCents, overrides) {
  const o = overrides || {};
  if (method === 'card') {
    const pct   = cardPercent(o.installments, o);
    const fixed = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
    const base  = Math.round(amountCents * (pct / 100)) + fixed;
    return base + anticipationFeeCents(amountCents, o.installments, o);
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
function buildSplit({ amountCents, sellerWalletId, method, chargeVaultlyFee, installments, overrides }) {
  const feeCents     = (chargeVaultlyFee === false) ? 0 : vaultlyFeeCents(amountCents, overrides);
  const gatewayCents = asaasFeeCents(method, amountCents, Object.assign({ installments: installments }, overrides || {}));
  const sellerCents  = Math.max(0, amountCents - feeCents - gatewayCents);
  return [{ walletId: sellerWalletId, fixedValue: centsToReais(sellerCents) }];
}

// Gross-up do cartao: valor a cobrar para que, apos cartao (pct + fixo) E antecipacao(N),
// o vendedor receba o preco cheio. Arredonda p/ cima (vendedor nunca recebe a menos).
function cardChargeCents(priceCents, installments, overrides) {
  const o = overrides || {};
  const cardPct = cardPercent(installments, o);
  const fixed   = o.cardFixedCents != null ? o.cardFixedCents : parseInt(process.env.ASAAS_CARD_FEE_CENTS || '49', 10);
  const pctTotal = (cardPct + anticipPercent(installments, o)) / 100;
  if (!(pctTotal < 1)) return priceCents;
  return Math.ceil((priceCents + fixed) / (1 - pctTotal));
}

// Monta as opcoes de parcela para o checkout. Sempre inclui 1x. Para N>1, para de
// oferecer quando o valor da parcela cai abaixo do minimo (parcelas maiores so diminuem).
// Com repasse ligado, o total cresce com N (gross-up por parcela); sem repasse, total = preco.
function installmentOptions({ priceCents, passFee, maxInstallments, minParcelaCents, overrides }) {
  const max = Math.max(1, parseInt(maxInstallments != null ? maxInstallments : (process.env.MAX_INSTALLMENTS || '3'), 10));
  const minParcela = parseInt(minParcelaCents != null ? minParcelaCents : (process.env.MIN_PARCELA_CENTS || '500'), 10);
  const out = [];
  for (let n = 1; n <= max; n++) {
    const total = passFee ? cardChargeCents(priceCents, n, overrides) : priceCents;
    const parcela = Math.ceil(total / n);
    if (n > 1 && parcela < minParcela) break;
    out.push({ n: n, total_cents: total, parcela_cents: parcela });
  }
  return out;
}

// Simulador de recebimento (puro). Para uma venda de amountCents (plano pago, sem taxa
// Vaultly), retorna o liquido do vendedor no Pix e, para cada parcela do cartao (1..MAX),
// os dois cenarios: sem repasse (vendedor absorve) e com repasse (comprador paga o gross-up).
function feeSimulation(amountCents, overrides) {
  const o = overrides || {};
  const max = Math.max(1, parseInt(o.maxInstallments != null ? o.maxInstallments : (process.env.MAX_INSTALLMENTS || '3'), 10));
  const card = [];
  for (let n = 1; n <= max; n++) {
    const semRepasse = Math.max(0, amountCents - asaasFeeCents('card', amountCents, Object.assign({ installments: n }, o)));
    const buyer = cardChargeCents(amountCents, n, o);
    const split = buildSplit({ amountCents: buyer, sellerWalletId: 'sim', method: 'card', chargeVaultlyFee: false, installments: n, overrides: o });
    const sellerCom = Math.round((split[0] && split[0].fixedValue ? split[0].fixedValue : 0) * 100);
    card.push({
      n: n,
      sem_repasse_seller_cents: semRepasse,
      com_repasse_buyer_cents: buyer,
      com_repasse_seller_cents: sellerCom
    });
  }
  return { amount_cents: amountCents, pix: { seller_cents: amountCents }, card: card };
}

module.exports = { vaultlyFeeCents, asaasFeeCents, centsToReais, buildSplit, cardChargeCents, cardPercent, anticipationFeeCents, anticipPercent, installmentOptions, feeSimulation };
