// src/services/saleWebhookService.js
// Chama o endpoint externo do vendedor (ex.: Apps Script do Lucro App) na venda/reembolso.
// Contrato: POST x-www-form-urlencoded { acao:'venda', payload:<json>, sig:<HMAC-SHA256 hex> }.
// A assinatura vai NO CORPO (o Apps Script nao expoe headers da requisicao).
const crypto = require('crypto');
const { decrypt } = require('./crypto');
const logger = require('../config/logger');

const TIMEOUT_MS = parseInt(process.env.SALE_WEBHOOK_TIMEOUT_MS || '12000', 10);

function sign(payloadStr, secret) {
  return crypto.createHmac('sha256', secret).update(payloadStr, 'utf8').digest('hex');
}

async function postSigned(url, secret, payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const sig = sign(payload, secret);
  const body = new URLSearchParams({ acao: 'venda', payload: payload, sig: sig }).toString();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res, text;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
      redirect: 'follow',
      signal: ctrl.signal
    });
    text = await res.text();
  } finally {
    clearTimeout(t);
  }
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json: json };
}

// Venda: retorna { codigo, link }. Lanca se o endpoint falhar ou responder ok:false
// (a entrega entra em retry; a idempotencia fica no endpoint, por transacao_id).
async function callSaleWebhook(product, order) {
  if (!product.delivery_webhook_url || !product.delivery_webhook_secret_enc) {
    throw new Error('Produto sem URL/segredo de webhook de entrega configurados.');
  }
  const secret = decrypt(product.delivery_webhook_secret_enc);
  const payload = {
    event: 'sale',
    transacao_id: order.id,
    produto_id: product.slug || product.id,
    email: order.buyer_email,
    nome: order.buyer_name || '',
    valor_cents: product.promo_price_cents || product.price_cents || order.amount_cents || 0,
    data: new Date().toISOString()
  };
  const r = await postSigned(product.delivery_webhook_url, secret, payload);
  if (!r.ok || !r.json || r.json.ok !== true) {
    const erro = (r.json && (r.json.erro || r.json.raw)) || ('HTTP ' + r.status);
    throw new Error('webhook de entrega: ' + erro);
  }
  return { codigo: r.json.codigo || '', link: r.json.link || '' };
}

// Reembolso/chargeback: best-effort (nao lanca; so loga).
async function callRefundWebhook(product, order) {
  try {
    if (!product.delivery_webhook_url || !product.delivery_webhook_secret_enc) return;
    const secret = decrypt(product.delivery_webhook_secret_enc);
    const r = await postSigned(product.delivery_webhook_url, secret, { event: 'refund', transacao_id: order.id });
    if (!r.ok || !r.json || r.json.ok !== true) {
      logger.warn('refund webhook respondeu falha — order ' + order.id + ': ' + JSON.stringify(r.json).slice(0, 200));
    } else {
      logger.info('Refund avisado ao webhook — order ' + order.id);
    }
  } catch (e) {
    logger.error('callRefundWebhook order ' + order.id + ': ' + e.message);
  }
}

module.exports = { callSaleWebhook, callRefundWebhook, sign };
