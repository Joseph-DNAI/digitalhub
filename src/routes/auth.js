// src/routes/auth.js
// Login, logout, cadastro e perfil do usuário

const express  = require('express');
const router   = express.Router();
const { users, sessions, plans } = require('../models/database');
const bcrypt   = require('../models/bcrypt');
const { requireAuth } = require('../middleware/auth');
const logger   = require('../config/logger');

// Versão atual dos termos — atualize ao publicar mudanças relevantes
const TERMS_VERSION = '2026-05-29';

// POST /api/auth/register — cadastro self-service
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, accept_terms, usage_mode } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'name, email e password são obrigatórios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Senha deve ter ao menos 8 caracteres' });
    }
    if (!accept_terms) {
      return res.status(400).json({ success: false, error: 'É necessário aceitar os Termos de Uso e a Política de Privacidade para criar a conta.' });
    }

    const existing = await users.findByEmail(email);
    if (existing) return res.status(409).json({ success: false, error: 'Email já cadastrado' });

    const user = await users.create({ name, email, password, plan_id: 'free', is_active: true, email_verified: true, terms_version: TERMS_VERSION, usage_mode: (usage_mode === 'direct' || usage_mode === 'both') ? usage_mode : 'automation' });
    const token = await sessions.create(user.id);

    logger.info(`Novo usuário cadastrado: ${email}`);
    res.status(201).json({ success: true, token, user: sanitizeUser(user) });

  } catch (err) {
    logger.error(`Erro no cadastro: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro ao criar conta. Tente novamente.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'email e password são obrigatórios' });

    const user = await users.findByEmail(email);
    if (!user) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Conta desativada' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });

    const token = await sessions.create(user.id);
    logger.info(`Login: ${email} (${user.role})`);

    res.json({ success: true, token, user: sanitizeUser(user) });

  } catch (err) {
    logger.error(`Erro no login: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro ao fazer login. Tente novamente.' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const token = req.headers['authorization']?.slice(7);
    if (token) await sessions.delete(token);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Erro no logout: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/auth/me — dados do usuário logado
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await users.findById(req.user.user_id);
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    logger.error(`Erro em /me: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/auth/plans — planos disponíveis
router.get('/plans', async (req, res) => {
  try {
    const all = await plans.findAll();
    res.json({ success: true, data: all });
  } catch (err) {
    logger.error(`Erro em /plans: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

function sanitizeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return safe;
}

module.exports = router;
