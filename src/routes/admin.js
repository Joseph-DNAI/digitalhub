// src/routes/admin.js
// Rotas exclusivas do administrador — gerenciar clientes e planos

const express = require('express');
const router  = express.Router();
const { users, plans } = require('../models/database');
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
