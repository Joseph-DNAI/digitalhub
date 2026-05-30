// src/services/asaasService.js
// Client HTTP do Asaas (API v3). Conta master da Vaultly via ASAAS_API_KEY.
// As cobranças são criadas referenciando o customer do comprador e a wallet do
// vendedor; a apiKey da subconta NÃO é persistida. O split envia a TAXA da Vaultly
// para a wallet master. Confirmar o formato exato no sandbox (Task 9).

const logger = require('../config/logger');
const { buildSplit } = require('./pricing');

function baseUrl() {
  return process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'access_token': process.env.ASAAS_API_KEY || ''
  };
}

async function request(method, path, body) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json && json.errors ? JSON.stringify(json.errors) : ('HTTP ' + res.status);
    logger.error('Asaas ' + method + ' ' + path + ' falhou: ' + msg);
    const err = new Error('Asaas: ' + msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// -- Montagem de payloads (puro -- testavel) -------------------------------------
function buildSubaccountPayload(d) {
  return {
    name: d.name,
    email: d.email,
    cpfCnpj: String(d.cpfCnpj || '').replace(/\D/g, ''),
    mobilePhone: d.mobilePhone ? String(d.mobilePhone).replace(/\D/g, '') : undefined,
    birthDate: d.birthDate || undefined,
    incomeValue: d.incomeValue || 1000,
    postalCode: d.postalCode ? String(d.postalCode).replace(/\D/g, '') : undefined,
    address: d.address || undefined,
    addressNumber: d.addressNumber ? String(d.addressNumber) : undefined,
    province: d.province || undefined,
    companyType: d.companyType || undefined
  };
}

function buildChargePayload(d) {
  const value = Math.round(d.amountCents) / 100;
  return {
    customer: d.customerId,
    billingType: d.method === 'card' ? 'CREDIT_CARD' : 'PIX',
    value,
    dueDate: d.dueDate,
    description: d.description || 'Compra Vaultly',
    externalReference: d.orderId || undefined,
    split: buildSplit({ amountCents: d.amountCents, sellerWalletId: d.sellerWalletId })
  };
}

function isValidWebhookToken(token) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  return !!expected && token === expected;
}

// -- Chamadas HTTP ---------------------------------------------------------------
async function createSubaccount(formData) {
  const payload = buildSubaccountPayload(formData);
  const acc = await request('POST', '/accounts', payload);
  return { accountId: acc.id, walletId: acc.walletId, apiKey: acc.apiKey, status: acc.status };
}

async function createCustomer({ name, email, cpfCnpj }) {
  const c = await request('POST', '/customers', {
    name, email, cpfCnpj: String(cpfCnpj || '').replace(/\D/g, '')
  });
  return c.id;
}

async function createCharge(opts) {
  const payload = buildChargePayload(opts);
  if (opts.method === 'card' && opts.card) {
    payload.creditCard = opts.card.creditCard;
    payload.creditCardHolderInfo = opts.card.holderInfo;
    if (opts.remoteIp) payload.remoteIp = opts.remoteIp;
  }
  return request('POST', '/payments', payload);
}

async function getPixQrCode(paymentId) {
  return request('GET', '/payments/' + paymentId + '/pixQrCode');
}

async function getCharge(paymentId) {
  return request('GET', '/payments/' + paymentId);
}

module.exports = {
  buildSubaccountPayload, buildChargePayload, isValidWebhookToken,
  createSubaccount, createCustomer, createCharge, getPixQrCode, getCharge
};
