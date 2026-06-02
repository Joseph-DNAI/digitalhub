const { test } = require('node:test');
const assert = require('node:assert');
const { vaultlyFeeCents, buildSplit } = require('../src/services/pricing');

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

test('buildSplit envia ao vendedor o liquido apos taxa Asaas + Vaultly', () => {
  // amount 2700c, vaultlyFee 50c, asaasPix 99c -> vendedor 2700-50-99 = 2551 = R$25,51
  const split = buildSplit({ amountCents: 2700, sellerWalletId: 'w_seller', method: 'pix' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 25.51 }
  ]);
});

test('nunca cobra mais que o valor da venda', () => {
  // venda de 1 centavo: taxa não pode passar do total
  assert.ok(vaultlyFeeCents(1) <= 1);
});
