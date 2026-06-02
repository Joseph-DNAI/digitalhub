const { test } = require('node:test');
const assert = require('node:assert');
const { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL } = require('../src/services/productLimits');

test('initialStatus: nasce active quando ha espaco no limite de ativos', () => {
  assert.strictEqual(initialStatus(0, 1), 'active');   // free: 0 ativos de 1
  assert.strictEqual(initialStatus(4, 5), 'active');   // basic: 4 de 5
});

test('initialStatus: nasce inactive quando o limite de ativos foi atingido', () => {
  assert.strictEqual(initialStatus(1, 1), 'inactive'); // free cheio
  assert.strictEqual(initialStatus(5, 5), 'inactive'); // basic cheio
});

test('initialStatus: plano ilimitado (-1) sempre active', () => {
  assert.strictEqual(initialStatus(999, -1), 'active');
});

test('canActivate: respeita o limite de ativos', () => {
  assert.strictEqual(canActivate(0, 1), true);
  assert.strictEqual(canActivate(1, 1), false);
  assert.strictEqual(canActivate(100, -1), true); // ilimitado
});

test('atGlobalCap: true quando o total atingiu o teto', () => {
  assert.strictEqual(atGlobalCap(99, 100), false);
  assert.strictEqual(atGlobalCap(100, 100), true);
  assert.strictEqual(MAX_PRODUCTS_TOTAL, 100);
});
