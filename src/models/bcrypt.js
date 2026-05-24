// src/models/bcrypt.js
// Hash de senhas sem dependência externa — usa crypto nativo do Node.js

const crypto = require('crypto');

const ITERATIONS = 100000;
const KEYLEN     = 64;
const DIGEST     = 'sha512';
const SALT_BYTES = 32;

function hash(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
    crypto.pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function compare(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    crypto.pbkdf2(password, salt, ITERATIONS, KEYLEN, DIGEST, (err, key) => {
      if (err) return reject(err);
      resolve(key.toString('hex') === hash);
    });
  });
}

module.exports = { hash, compare };
