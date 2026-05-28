// src/routes/admin.js
// Rotas exclusivas do administrador — gerenciar clientes e planos

const express = require('express');
const router  = express.Router();
const { users, plans, query } = require('../models/database');
const bcrypt  = require('../models/bcrypt');
const { requireAdmin } = require('../middleware/auth');
const logger  = require('../config/logger');

// Todas as rotas exigem admin
router.use(requireAdmin);

// GET /api/admin/users — lista todos os clientes
router.get('/users', async (req, res) => {
  try {
    const all = await users.findAll();
    res.json({ success: true, data: all.map(sanitizeUser) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/users/overview — dados enriquecidos para monitoramento
router.get('/users/overview', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        u.id, u.name, u.email, u.role, u.plan_id, u.is_active,
        u.created_at, u.updated_at,
        p.name          AS plan_name,
        p.max_products,
        p.max_deliveries_month,
        t.id            AS tenant_id,
        COALESCE((SELECT COUNT(*) FROM products pr
                  WHERE pr.tenant_id = t.id AND pr.status = 'active'), 0)::int AS product_count,
        COALESCE((SELECT COUNT(*) FROM deliveries d
                  WHERE d.tenant_id = t.id), 0)::int AS delivery_total,
        COALESCE((SELECT COUNT(*) FROM deliveries d
                  WHERE d.tenant_id = t.id
                    AND d.created_at >= date_trunc('month', NOW())), 0)::int AS delivery_month,
        COALESCE((SELECT COUNT(*) FROM deliveries d
                  WHERE d.tenant_id = t.id
                    AND d.status = 'delivered'
                    AND d.created_at >= date_trunc('month', NOW())), 0)::int AS delivery_month_ok,
        (SELECT MAX(d.created_at) FROM deliveries d WHERE d.tenant_id = t.id) AS last_delivery,
        (t.kiwify_webhook_secret IS NOT NULL) AS has_kiwify,
        (t.yampi_webhook_secret  IS NOT NULL) AS has_yampi,
        (t.resend_api_key        IS NOT NULL) AS has_resend
      FROM users u
      LEFT JOIN plans   p ON u.plan_id  = p.id
      LEFT JOIN tenants t ON t.user_id  = u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: rows.map(sanitizeUser) });
  } catch (err) {
    logger.error('Erro em /users/overview: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users — cria cliente manualmente
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, plan_id, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'name, email e password são obrigatórios' });
    }

    const existing = await users.findByEmail(email);
    if (existing) return res.status(409).json({ success: false, error: 'Email já cadastrado' });

    const user = await users.create({
      name, email, password,
      plan_id: plan_id || 'free',
      role:    role    || 'client',
      is_active: true,
      email_verified: true
    });

    logger.info(`Admin criou usuário: ${email} (plano: ${plan_id||'free'})`);
    res.status(201).json({ success: true, data: sanitizeUser(user) });

  } catch (err) {
    logger.error(`Erro ao criar usuário: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:id — atualiza cliente (plano, status, etc)
router.put('/users/:id', async (req, res) => {
  try {
    const { name, plan_id, is_active, role } = req.body;
    const updateData = {};
    if (name      !== undefined) updateData.name      = name;
    if (plan_id   !== undefined) updateData.plan_id   = plan_id;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (role      !== undefined) updateData.role      = role;

    // Se enviou nova senha
    if (req.body.password) {
      updateData.password_hash = await bcrypt.hash(req.body.password);
    }

    const updated = await users.update(req.params.id, updateData);
    res.json({ success: true, data: sanitizeUser(updated) });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/users/:id — remove cliente
router.delete('/users/:id', async (req, res) => {
  try {
    await users.delete(req.params.id);
    res.json({ success: true, message: 'Usuário removido' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/plans
router.get('/plans', async (req, res) => {
  try {
    const all = await plans.findAll();
    res.json({ success: true, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function sanitizeUser(u) {
  const { password_hash, ...safe } = u;
  return safe;
}

module.exports = router;
