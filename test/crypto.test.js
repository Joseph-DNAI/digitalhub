const { test } = require('node:test');
const assert = require('node:assert');
process.env.ENCRYPTION_KEY = '0'.repeat(64); // 32 bytes em hex (chave de teste)
const { encrypt, decrypt } = require('../src/services/crypto');

test('encrypt/decrypt: round-trip recupera o texto', () => {
  const plain = 'aact_subconta_apikey_secreta_123';
  const enc = encrypt(plain);
  assert.notStrictEqual(enc, plain);      // nao guarda em texto puro
  assert.strictEqual(decrypt(enc), plain); // recupera
});

test('encrypt: dois textos iguais geram cifras diferentes (IV aleatorio)', () => {
  assert.notStrictEqual(encrypt('abc'), encrypt('abc'));
});

test('decrypt: cifra adulterada falha (GCM autentica)', () => {
  const enc = encrypt('segredo');
  const partes = enc.split(':');
  partes[2] = Buffer.from('xxxxxxxx').toString('base64'); // corrompe o ciphertext
  assert.throws(() => decrypt(partes.join(':')));
});
