// src/services/asaasService.js
// Client HTTP do Asaas (API v3). Conta master da Vaultly via ASAAS_API_KEY.
// As cobranças são criadas referenciando o customer do comprador e a wallet do
// vendedor; a apiKey da subconta NÃO é persistida. O split envia a TAXA da Vaultly
// para a wallet master. Confirmar o formato exato no sandbox (Task 9).

const fs = require('fs');
const logger = require('../config/logger');
const { buildSplit } = require('./pricing');

function baseUrl() {
  let url = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').trim();
  url = url.replace(/^\/+/, '');                         // remove barras iniciais ("//api...")
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url; // garante o protocolo
  return url.replace(/\/+$/, '');                        // remove barra final
}

function headers(apiKey) {
  return {
    'Content-Type': 'application/json',
    'access_token': apiKey || process.env.ASAAS_API_KEY || ''
  };
}

async function request(method, path, body, apiKey) {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: headers(apiKey),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const detail = json && json.errors ? JSON.stringify(json.errors) : (text ? String(text).slice(0, 300) : '');
    const msg = 'HTTP ' + res.status + (detail ? ' — ' + detail : '');
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
  const n = Math.max(1, parseInt(d.installments || 1, 10));
  const payload = {
    customer: d.customerId,
    billingType: d.method === 'card' ? 'CREDIT_CARD' : 'PIX',
    dueDate: d.dueDate,
    description: d.description || 'Compra Vaultly',
    externalReference: d.orderId || undefined,
    split: buildSplit({ amountCents: d.amountCents, sellerWalletId: d.sellerWalletId, method: d.method, chargeVaultlyFee: d.chargeVaultlyFee, installments: n })
  };
  if (d.method === 'card' && n >= 2) {
    payload.installmentCount = n;
    payload.totalValue = value;
  } else {
    payload.value = value;
  }
  return payload;
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
  // notificationDisabled: a Vaultly entrega e avisa o comprador por conta propria,
  // entao desabilitamos as notificacoes do Asaas (evita a taxa de R$0,99 Email/SMS por cobranca).
  const c = await request('POST', '/customers', {
    name, email, cpfCnpj: String(cpfCnpj || '').replace(/\D/g, ''),
    notificationDisabled: true
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

// Procura uma subconta ja existente por CPF/CNPJ (p/ adotar quando a criacao
// falhou apos o Asaas ja ter criado a conta). Devolve null se nao houver.
async function findSubaccountByCpfCnpj(cpfCnpj) {
  const clean = String(cpfCnpj || '').replace(/\D/g, '');
  if (!clean) return null;
  const res = await request('GET', '/accounts?cpfCnpj=' + encodeURIComponent(clean) + '&limit=1');
  const acc = res && res.data && res.data[0];
  if (!acc) return null;
  return { accountId: acc.id, walletId: acc.walletId, status: acc.status || null };
}

// Lista as subcontas criadas pela conta master (diagnostico admin).
async function listSubaccounts(limit) {
  const res = await request('GET', '/accounts?limit=' + (parseInt(limit, 10) || 100));
  return (res && res.data) || [];
}

// Deriva o tipo da chave Pix a partir do documento (11 digitos = CPF, 14 = CNPJ).
function pixKeyType(cpfCnpj) {
  const clean = String(cpfCnpj || '').replace(/\D/g, '');
  return clean.length > 11 ? 'CNPJ' : 'CPF';
}

// Saldo disponivel da subconta (usa a apiKey da subconta). Retorna em centavos.
async function getSubaccountBalance(apiKey) {
  const r = await request('GET', '/finance/balance', null, apiKey);
  // Se o campo 'balance' nao vier, avisa: e provavel divergencia de shape da API
  // (nao deixa o saque virar um no-op silencioso de R$0 para sempre).
  if (!r || typeof r.balance !== 'number') {
    logger.warn('Asaas /finance/balance sem campo numerico "balance" — resposta: ' + JSON.stringify(r).slice(0, 200));
    return 0;
  }
  return Math.round(r.balance * 100);
}

// Transferencia Pix para uma chave (CPF/CNPJ). Roda na subconta (apiKey dela).
// externalReference: token idempotente/rastreavel do repasse (mesmo token = mesmo repasse).
async function createPixTransfer(apiKey, opts) {
  const cleanKey = String(opts.pixKey || '').replace(/\D/g, '');
  const body = {
    value: opts.valueReais,
    pixAddressKey: cleanKey,
    pixAddressKeyType: opts.pixKeyType || pixKeyType(cleanKey),
    operationType: 'PIX'
  };
  if (opts.externalReference) body.externalReference = opts.externalReference;
  return request('POST', '/transfers', body, apiKey);
}

// Habilita a antecipacao automatica do cartao na subconta (recebimento rapido).
// Best-effort: contas novas podem exigir aprovacao do Asaas; nunca deve quebrar o fluxo.
// Endpoint confirmado na doc oficial: PUT /anticipations/configurations { creditCardAutomaticEnabled }.
async function enableAutoAnticipation(apiKey) {
  return request('PUT', '/anticipations/configurations', { creditCardAutomaticEnabled: true }, apiKey);
}

// ── KYC / ativacao da subconta (white-label). Usam a apiKey da subconta. ──
// NOTA: caminhos no formato padrao da API Asaas; validar no sandbox e ajustar nomes se divergir.

// Status do cadastro (dados comerciais, bancarios, documentos, aprovacao geral) — espelha a "Analise cadastral".
async function getRegistrationStatus(apiKey) {
  return request('GET', '/myAccount/registrationStatus', null, apiKey);
}

// Lista os documentos exigidos/enviados (cada grupo tem id, tipo, status).
async function listAccountDocuments(apiKey) {
  return request('GET', '/myAccount/documents', null, apiKey);
}

// Envia (upload) um arquivo para um grupo de documento. Multipart: type + documentFile.
async function uploadAccountDocument(apiKey, documentId, type, filePath, fileName) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  if (type) form.append('type', type);
  form.append('documentFile', new Blob([buf]), fileName || 'documento');
  const res = await fetch(baseUrl() + '/myAccount/documents/' + documentId, {
    method: 'POST',
    headers: { 'access_token': apiKey || process.env.ASAAS_API_KEY || '' }, // sem Content-Type: o fetch define o boundary
    body: form
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const detail = json && json.errors ? JSON.stringify(json.errors) : String(text).slice(0, 200);
    const err = new Error('Asaas upload doc HTTP ' + res.status + (detail ? ' — ' + detail : ''));
    err.status = res.status;
    throw err;
  }
  return json;
}

module.exports = {
  buildSubaccountPayload, buildChargePayload, isValidWebhookToken,
  createSubaccount, createCustomer, createCharge, getPixQrCode, getCharge,
  findSubaccountByCpfCnpj, listSubaccounts,
  pixKeyType, getSubaccountBalance, createPixTransfer, enableAutoAnticipation,
  getRegistrationStatus, listAccountDocuments, uploadAccountDocument
};
