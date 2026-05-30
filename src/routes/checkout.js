// src/routes/checkout.js — API pública de checkout (sem auth)
const express = require('express');
const router  = express.Router();
const { products, orders, sellerAccounts, tenants } = require('../models/database');
const asaas = require('../services/asaasService');
const { vaultlyFeeCents } = require('../services/pricing');
const logger = require('../config/logger');

// GET /api/checkout/:slug — dados públicos do produto p/ renderizar a página
router.get('/:slug', async (req, res) => {
  try {
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });
    res.json({
      success: true,
      product: {
        slug: product.slug,
        title: product.checkout_title || product.name,
        description: product.checkout_description,
        price_cents: product.price_cents,
        accept_pix: product.accept_pix,
        accept_card: product.accept_card
      }
    });
  } catch (err) {
    logger.error('checkout/get: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/checkout/:slug — cria a cobrança no Asaas + a order (pending)
router.post('/:slug', async (req, res) => {
  let orderId = null;
  try {
    const { buyer_name, buyer_email, buyer_doc, method, card } = req.body;
    if (!buyer_email || !buyer_doc) {
      return res.status(400).json({ success: false, error: 'Email e CPF sao obrigatorios.' });
    }
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    if (!Number.isInteger(product.price_cents) || product.price_cents < MIN) {
      return res.status(409).json({ success: false, error: 'Produto indisponivel para compra.' });
    }

    const vaultlyWalletId = process.env.ASAAS_VAULTLY_WALLET_ID;
    if (!vaultlyWalletId) {
      logger.error('ASAAS_VAULTLY_WALLET_ID nao configurado');
      return res.status(500).json({ success: false, error: 'Configuracao de pagamento indisponivel.' });
    }

    const pm = method === 'card' ? 'card' : 'pix';
    if (pm === 'pix' && !product.accept_pix) return res.status(400).json({ success: false, error: 'Pix indisponivel para este produto.' });
    if (pm === 'card' && !product.accept_card) return res.status(400).json({ success: false, error: 'Cartao indisponivel para este produto.' });

    const acc = await sellerAccounts.findByTenant(product.tenant_id);
    if (!acc || acc.status !== 'active' || !acc.asaas_wallet_id) {
      return res.status(409).json({ success: false, error: 'Vendedor sem conta de recebimento ativa.' });
    }

    const amountCents = product.price_cents;
    const feeCents = vaultlyFeeCents(amountCents);

    orderId = await orders.create(product.tenant_id, {
      product_id: product.id, buyer_name, buyer_email, buyer_doc,
      amount_cents: amountCents, payment_method: pm,
      platform_fee_cents: feeCents
    });

    const customerId = await asaas.createCustomer({ name: buyer_name || buyer_email, email: buyer_email, cpfCnpj: buyer_doc });
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const charge = await asaas.createCharge({
      customerId, method: pm, amountCents,
      description: product.checkout_title || product.name,
      vaultlyWalletId,
      dueDate, orderId,
      card: pm === 'card' ? card : undefined,
      remoteIp: req.headers['x-forwarded-for'] || req.ip
    });

    await orders.setAsaasPaymentId(orderId, charge.id);

    if (pm === 'pix') {
      const qr = await asaas.getPixQrCode(charge.id);
      return res.json({ success: true, orderId, method: 'pix', payment_id: charge.id,
        pix: { encodedImage: qr.encodedImage, payload: qr.payload }, status: charge.status });
    }
    return res.json({ success: true, orderId, method: 'card', payment_id: charge.id, status: charge.status });
  } catch (err) {
    logger.error('checkout/post: ' + err.message);
    if (orderId) { try { await orders.updateStatus(orderId, 'failed'); } catch (_) {} }
    res.status(502).json({ success: false, error: 'Falha ao processar pagamento. ' + err.message });
  }
});

module.exports = router;
