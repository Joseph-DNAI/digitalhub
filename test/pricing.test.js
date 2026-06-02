const { test } = require('node:test');
const assert = require('node:assert');
const { vaultlyFeeCents, buildSplit, cardChargeCents } = require('../src/services/pricing');

test('taxa Vaultly = fixo 10c + 1.49% (arredonda p/ centavo)', () => {
  // R$27,00 = 2700c -> 10 + round(2700*0.0149)=10+40=50
  assert.strictEqual(vaultlyFeeCents(2700), 50);
  // R$10,00 = 1000c -> 10 + round(1000*0.0149)=10+15=25 (14.9 arredonda p/ 15)
  assert.strictEqual(vaultlyFeeCents(1000), 25);
});

test('taxa Vaultly respeita overrides via env', () => {
  assert.strictEqual(
    vaultlyFeeCents(5000, { fixedCents: 0, percent: 2 }),
    100 // 0 + 2% de 5000 = 100
  );
});

test('buildSplit desconta taxa Asaas (cartao) e taxa Vaultly do liquido do vendedor', () => {
  // amount 10000c, vaultlyFee 159c, asaasCard 1,99%+R$0,49 = 248c -> vendedor 10000-159-248 = 9593 = R$95,93
  const split = buildSplit({ amountCents: 10000, sellerWalletId: 'w_seller', method: 'card' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 95.93 }
  ]);
});

test('buildSplit no Pix sem taxa de gateway: vendedor recebe preco menos so a taxa Vaultly', () => {
  // amount 2700c, Pix sem taxa, vaultlyFee 50c -> vendedor 2700-50 = 2650 = R$26,50
  const split = buildSplit({ amountCents: 2700, sellerWalletId: 'w_seller', method: 'pix' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 26.5 }
  ]);
});

test('buildSplit isenta a taxa Vaultly nos planos pagos (chargeVaultlyFee=false)', () => {
  // amount 2700c, Pix sem taxa, sem taxa Vaultly -> vendedor recebe os 2700 = R$27,00
  const split = buildSplit({ amountCents: 2700, sellerWalletId: 'w_seller', method: 'pix', chargeVaultlyFee: false });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 27 }
  ]);
});

test('nunca cobra mais que o valor da venda', () => {
  // venda de 1 centavo: taxa não pode passar do total
  assert.ok(vaultlyFeeCents(1) <= 1);
});

test('cardChargeCents: gross-up cobre a taxa do cartao (arredonda p/ cima)', () => {
  // P=2700, taxa 1,99% + R$0,49 -> ceil((2700+49)/0.9801) = ceil(2804.81) = 2805
  assert.strictEqual(cardChargeCents(2700), 2805);
});

test('cardChargeCents: apos a taxa, o vendedor recebe ~o preco cheio', () => {
  const charged = cardChargeCents(2700);              // 2805
  const asaasFee = Math.round(charged * 0.0199) + 49;  // 56 + 49 = 105
  assert.ok(charged - asaasFee >= 2700);
  assert.ok(charged - asaasFee <= 2702);
});
