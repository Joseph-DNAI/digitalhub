const { test } = require('node:test');
const assert = require('node:assert');
const { buildSubaccountPayload, buildChargePayload, isValidWebhookToken } = require('../src/services/asaasService');

test('buildSubaccountPayload mapeia os campos do formulário', () => {
  const p = buildSubaccountPayload({
    name: 'Maria', email: 'm@x.com', cpfCnpj: '12345678900',
    mobilePhone: '32999999999', birthDate: '1990-01-01',
    incomeValue: 5000
  });
  assert.strictEqual(p.name, 'Maria');
  assert.strictEqual(p.cpfCnpj, '12345678900');
  assert.strictEqual(p.incomeValue, 5000);
});

test('buildChargePayload Pix inclui billingType e split', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'pix', amountCents: 2700,
    description: 'Ebook', sellerWalletId: 'w_s', dueDate: '2026-06-01'
  });
  assert.strictEqual(p.billingType, 'PIX');
  assert.strictEqual(p.customer, 'cus_1');
  assert.strictEqual(p.value, 27);
  assert.deepStrictEqual(p.split, [{ walletId: 'w_s', fixedValue: 26.5 }]);
});

test('buildChargePayload cartão usa CREDIT_CARD', () => {
  const p = buildChargePayload({
    customerId: 'cus_1', method: 'card', amountCents: 2700,
    description: 'Ebook', sellerWalletId: 'w_s', dueDate: '2026-06-01'
  });
  assert.strictEqual(p.billingType, 'CREDIT_CARD');
});

test('isValidWebhookToken compara com env', () => {
  process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
  assert.strictEqual(isValidWebhookToken('segredo'), true);
  assert.strictEqual(isValidWebhookToken('errado'), false);
  assert.strictEqual(isValidWebhookToken(undefined), false);
});
