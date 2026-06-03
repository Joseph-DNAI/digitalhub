const { test } = require('node:test');
const assert = require('node:assert');
const { vaultlyFeeCents, buildSplit, cardChargeCents, anticipationFeeCents, installmentOptions } = require('../src/services/pricing');

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

test('buildSplit (cartao a vista) desconta Asaas + antecipacao 1,15% + taxa Vaultly', () => {
  // amount 10000c: vaultly 159, asaas 1,99%+49 = 248, antecip a vista 1,15% = 115
  // vendedor 10000-159-248-115 = 9478 = R$94,78
  const split = buildSplit({ amountCents: 10000, sellerWalletId: 'w_seller', method: 'card' });
  assert.deepStrictEqual(split, [
    { walletId: 'w_seller', fixedValue: 94.78 }
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

test('cardChargeCents a vista: gross-up cobre cartao 1,99%+R$0,49 + antecipacao 1,15%', () => {
  // P=2700, pctTotal=(1,99+1,15)/100=0,0314 -> ceil((2700+49)/0,9686)=ceil(2838,32)=2839
  assert.strictEqual(cardChargeCents(2700, 1), 2839);
});

test('cardChargeCents a vista: apos taxa do cartao + antecipacao o vendedor recebe ~o preco cheio', () => {
  const charged = cardChargeCents(2700, 1);                       // 2839
  const asaasFee = Math.round(charged * 0.0199) + 49;             // 57 + 49 = 106
  const anticip  = Math.round(charged * 0.0115);                  // 33
  assert.ok(charged - asaasFee - anticip >= 2700);
  assert.ok(charged - asaasFee - anticip <= 2702);
});

test('anticipationFeeCents: 1x=1,15%, 2x=2,40%, 3x=3,20% sobre R$100,00', () => {
  assert.strictEqual(anticipationFeeCents(10000, 1), 115); // 1,15%
  assert.strictEqual(anticipationFeeCents(10000, 2), 240); // 1,6% * 1,5 = 2,40%
  assert.strictEqual(anticipationFeeCents(10000, 3), 320); // 1,6% * 2,0 = 3,20%
});

test('anticipationFeeCents: sem parcelas informadas trata como a vista (1x)', () => {
  assert.strictEqual(anticipationFeeCents(10000), 115);
});

test('cardChargeCents 3x embute 1,99%+R$0,49 + antecipacao 3,20%', () => {
  // P=10000, pctTotal=(1,99+3,20)/100=0,0519 -> ceil((10000+49)/0,9481)=ceil(10599,1)=10600
  assert.strictEqual(cardChargeCents(10000, 3), 10600);
});

test('installmentOptions sem repasse: preco fixo, respeita minimo por parcela', () => {
  // R$10,00, min R$5,00: 1x(1000), 2x(500) ok; 3x(334) < 500 -> nao oferece
  const opts = installmentOptions({ priceCents: 1000, passFee: false, maxInstallments: 3, minParcelaCents: 500 });
  assert.deepStrictEqual(opts, [
    { n: 1, total_cents: 1000, parcela_cents: 1000 },
    { n: 2, total_cents: 1000, parcela_cents: 500 }
  ]);
});

test('installmentOptions com repasse: total cresce com as parcelas (gross-up por N)', () => {
  // R$50,00 com repasse: total 1x < total 2x < total 3x
  const opts = installmentOptions({ priceCents: 5000, passFee: true, maxInstallments: 3, minParcelaCents: 500 });
  assert.strictEqual(opts.length, 3);
  assert.ok(opts[0].total_cents < opts[1].total_cents);
  assert.ok(opts[1].total_cents < opts[2].total_cents);
  assert.strictEqual(opts[0].total_cents, cardChargeCents(5000, 1));
  assert.strictEqual(opts[2].total_cents, cardChargeCents(5000, 3));
});
