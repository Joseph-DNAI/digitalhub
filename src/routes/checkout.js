// src/routes/checkout.js — API pública de checkout (sem auth)
const express = require('express');
const router  = express.Router();
const { products, orders, sellerAccounts, tenants, users } = require('../models/database');
const asaas = require('../services/asaasService');
const { vaultlyFeeCents, cardChargeCents, installmentOptions } = require('../services/pricing');
const logger = require('../config/logger');

// GET /api/checkout/:slug — dados públicos do produto p/ renderizar a página
router.get('/:slug', async (req, res) => {
  try {
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });
    const acc = await sellerAccounts.findByTenant(product.tenant_id);
    const tenant = await tenants.findById(product.tenant_id);
    const sellerUser = tenant ? await users.findById(tenant.user_id) : null;
    const isFreePlan = !sellerUser || sellerUser.plan_id === 'free';
    const passFee = !isFreePlan && !!(acc && acc.pass_card_fee_to_buyer);
    const cardCents = passFee ? cardChargeCents(product.price_cents, 1) : product.price_cents;
    const installments = installmentOptions({ priceCents: product.price_cents, passFee: passFee }).map(function (o) {
      return {
        n: o.n,
        total_cents: o.total_cents,
        parcela_cents: o.parcela_cents,
        label: o.n === 1
          ? '1x de R$ ' + (o.parcela_cents / 100).toFixed(2).replace('.', ',') + ' (a vista)'
          : o.n + 'x de R$ ' + (o.parcela_cents / 100).toFixed(2).replace('.', ',')
      };
    });
    res.json({
      success: true,
      product: {
        slug: product.slug,
        title: product.checkout_title || product.name,
        description: product.checkout_description,
        price_cents: product.price_cents,
        pix_cents: product.price_cents,
        card_cents: cardCents,
        pass_card_fee: passFee,
        installments: installments,
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
    const { buyer_name, buyer_email, buyer_doc, method, card, installments } = req.body;
    if (!buyer_email || !buyer_doc) {
      return res.status(400).json({ success: false, error: 'Email e CPF sao obrigatorios.' });
    }
    const product = await products.findBySlug(req.params.slug);
    if (!product) return res.status(404).json({ success: false, error: 'Produto nao encontrado.' });

    const MIN = parseInt(process.env.DIRECT_MIN_PRICE_CENTS || '900', 10);
    if (!Number.isInteger(product.price_cents) || product.price_cents < MIN) {
      return res.status(409).json({ success: false, error: 'Produto indisponivel para compra.' });
    }

    const pm = method === 'card' ? 'card' : 'pix';
    if (pm === 'pix' && !product.accept_pix) return res.status(400).json({ success: false, error: 'Pix indisponivel para este produto.' });
    if (pm === 'card' && !product.accept_card) return res.status(400).json({ success: false, error: 'Cartao indisponivel para este produto.' });

    const MAX_INSTALL = parseInt(process.env.MAX_INSTALLMENTS || '3', 10);
    let nInstall = parseInt(installments || 1, 10);
    if (!Number.isInteger(nInstall) || nInstall < 1) nInstall = 1;
    if (pm === 'pix') nInstall = 1;                 // Pix nao parcela
    if (nInstall > MAX_INSTALL) return res.status(400).json({ success: false, error: 'Numero de parcelas acima do maximo permitido.' });

    const acc = await sellerAccounts.findByTenant(product.tenant_id);
    if (!acc || acc.status !== 'active' || !acc.asaas_wallet_id) {
      return res.status(409).json({ success: false, error: 'Vendedor sem conta de recebimento ativa.' });
    }

    // Taxa Vaultly só incide no plano Free; planos pagos sao isentos (a assinatura cobre).
    const tenant = await tenants.findById(product.tenant_id);
    const sellerUser = tenant ? await users.findById(tenant.user_id) : null;
    const isFreePlan = !sellerUser || sellerUser.plan_id === 'free';

    // Cartao com repasse ligado: cobra o valor com a taxa embutida (gross-up).
    // Pix sempre cobra o valor real. O split ja entrega ao vendedor (cobrado - taxaAsaas) = preco cheio.
    const amountCents = (pm === 'card' && acc.pass_card_fee_to_buyer && !isFreePlan)
      ? cardChargeCents(product.price_cents, nInstall)
      : product.price_cents;
    const feeCents = isFreePlan ? vaultlyFeeCents(amountCents) : 0;

    const MIN_PARCELA = parseInt(process.env.MIN_PARCELA_CENTS || '500', 10);
    if (pm === 'card' && nInstall > 1 && Math.ceil(amountCents / nInstall) < MIN_PARCELA) {
      return res.status(400).json({ success: false, error: 'Valor de parcela abaixo do minimo.' });
    }

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
      sellerWalletId: acc.asaas_wallet_id,
      chargeVaultlyFee: isFreePlan,
      installments: nInstall,
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
