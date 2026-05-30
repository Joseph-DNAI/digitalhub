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

test('buildSplit devolve valor da Vaultly em reais p/ o walletId master-less', () => {
  // amount 2700c, fee 50c -> split fixedValue 0.50 para a wallet da Vaultly
  const split = buildSplit({ amountCents: 2700, vaultlyWalletId: 'w_vaultly' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_vaultly', fixedValue: 0.5 }
  ]);
});

test('nunca cobra mais que o valor da venda', () => {
  // venda de 1 centavo: taxa não pode passar do total
  assert.ok(vaultlyFeeCents(1) <= 1);
});
