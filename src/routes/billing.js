// src/routes/billing.js — assinaturas via Stripe
const express = require('express');
const router  = express.Router();
const { users, query } = require('../models/database');
const { requireAuth }  = require('../middleware/auth');
const logger = require('../config/logger');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY nao configurada');
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PRICE_IDS = {
  starter:  process.env.STRIPE_PRICE_STARTER,
  basic:    process.env.STRIPE_PRICE_BASIC,
  pro:      process.env.STRIPE_PRICE_PRO,
  business: process.env.STRIPE_PRICE_BUSINESS
};

// POST /api/billing/create-checkout — inicia sessao de pagamento Stripe
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    var stripe  = getStripe();
    var planId  = req.body.plan_id;
    var priceId = PRICE_IDS[planId];

    if (!priceId) {
      return res.status(400).json({
        success: false,
        error: 'Plano invalido ou STRIPE_PRICE_' + (planId || '').toUpperCase() + ' nao configurado'
      });
    }

    var user    = req.user;
    var baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    // Cria ou reutiliza customer Stripe
    var customerId = user.stripe_customer_id;
    if (!customerId) {
      var customer = await stripe.customers.create({
        email:    user.email,
        name:     user.name,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      await users.update(user.id, { stripe_customer_id: customerId });
    }

    var session = await stripe.checkout.sessions.create({
      customer:              customerId,
      payment_method_types:  ['card'],
      line_items:            [{ price: priceId, quantity: 1 }],
      mode:                  'subscription',
      success_url:           baseUrl + '/app?upgraded=1&plan=' + planId,
      cancel_url:            baseUrl + '/app',
      locale:                'pt-BR',
      allow_promotion_codes: true,
      subscription_data:     { metadata: { user_id: user.id, plan_id: planId } },
      metadata:              { user_id: user.id, plan_id: planId }
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    logger.error('Erro ao criar checkout: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/billing/create-portal — portal do cliente (gerenciar / cancelar)
router.post('/create-portal', requireAuth, async (req, res) => {
  try {
    var stripe = getStripe();
    var user   = req.user;

    if (!user.stripe_customer_id) {
      return res.status(400).json({ success: false, error: 'Nenhuma assinatura ativa encontrada' });
    }

    var baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    var session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: baseUrl + '/app'
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    logger.error('Erro ao criar portal: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/billing/webhook — eventos Stripe (sem auth, valida HMAC)
router.post('/webhook', async (req, res) => {
  var sig = req.headers['stripe-signature'];
  var event;

  try {
    var stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn('Webhook Stripe invalido: ' + err.message);
    return res.status(400).send('Webhook invalido: ' + err.message);
  }

  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    logger.error('Erro no webhook Stripe (' + event.type + '): ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

async function handleStripeEvent(event) {
  var stripe = getStripe();
  var data   = event.data.object;

  if (event.type === 'checkout.session.completed') {
    var userId = data.metadata && data.metadata.user_id;
    var planId = data.metadata && data.metadata.plan_id;
    if (userId && planId) {
      await users.update(userId, {
        plan_id:             planId,
        subscription_id:     data.subscription,
        subscription_status: 'active'
      });
      logger.info('Plano ativado: user=' + userId + ' plan=' + planId);
    }
    return;
  }

  if (event.type === 'invoice.payment_succeeded') {
    if (!data.subscription) return;
    var sub = await stripe.subscriptions.retrieve(data.subscription);
    var uid = await getUserIdByCustomer(sub.customer);
    if (uid) {
      await users.update(uid, {
        subscription_status: 'active',
        current_period_end:  new Date(sub.current_period_end * 1000)
      });
      logger.info('Renovacao confirmada: user=' + uid);
    }
    return;
  }

  if (event.type === 'invoice.payment_failed') {
    var uid2 = await getUserIdByCustomer(data.customer);
    if (uid2) {
      await users.update(uid2, { subscription_status: 'past_due' });
      logger.warn('Pagamento falhou: user=' + uid2);
    }
    return;
  }

  if (event.type === 'customer.subscription.updated') {
    var uid3 = await getUserIdByCustomer(data.customer);
    if (uid3) {
      var priceId = data.items && data.items.data[0] && data.items.data[0].price && data.items.data[0].price.id;
      var newPlan = null;
      if (priceId) {
        var match = Object.entries(PRICE_IDS).find(function(e) { return e[1] === priceId; });
        if (match) newPlan = match[0];
      }
      var updates = {
        subscription_status: data.status,
        current_period_end:  new Date(data.current_period_end * 1000)
      };
      if (newPlan) updates.plan_id = newPlan;
      await users.update(uid3, updates);
      logger.info('Assinatura atualizada: user=' + uid3 + ' status=' + data.status + (newPlan ? ' plan=' + newPlan : ''));
    }
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    var uid4 = await getUserIdByCustomer(data.customer);
    if (uid4) {
      await users.update(uid4, {
        plan_id:             'free',
        subscription_status: 'canceled',
        subscription_id:     null,
        current_period_end:  null
      });
      logger.info('Assinatura cancelada, revertido para Free: user=' + uid4);
    }
    return;
  }

  logger.info('Webhook Stripe ignorado: ' + event.type);
}

async function getUserIdByCustomer(customerId) {
  var rows = await query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
  return rows[0] ? rows[0].id : null;
}

module.exports = router;
