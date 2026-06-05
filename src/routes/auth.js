// src/routes/auth.js
// Login, logout, cadastro e perfil do usuário

const express  = require('express');
const router   = express.Router();
const { users, sessions, plans, authTokens } = require('../models/database');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
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

    const user = await users.create({ name, email, password, plan_id: 'free', is_active: true, email_verified: false, terms_version: TERMS_VERSION, usage_mode: (usage_mode === 'direct' || usage_mode === 'both') ? usage_mode : 'automation' });
    const token = await sessions.create(user.id);

    try {
      const vraw = await authTokens.create(user.id, 'verify', 60 * 24);
      const vbase = process.env.BASE_URL || 'https://vaultly.digital';
      await sendVerificationEmail({ userEmail: user.email, userName: user.name, verifyUrl: vbase + '/confirmar-email?token=' + vraw });
    } catch (e) { logger.error('verify email no cadastro: ' + e.message); }

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

// POST /api/auth/forgot-password — envia link de redefinicao (sem revelar se o email existe)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (email) {
      const user = await users.findByEmail(email);
      if (user) {
        const raw  = await authTokens.create(user.id, 'reset', 60);
        const base = process.env.BASE_URL || 'https://vaultly.digital';
        await sendPasswordResetEmail({ userEmail: user.email, userName: user.name, resetUrl: base + '/redefinir-senha?token=' + raw })
          .catch(e => logger.error('reset email: ' + e.message));
      }
    }
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  } catch (err) {
    logger.error('forgot-password: ' + err.message);
    res.json({ success: true, message: 'Se o email estiver cadastrado, enviamos um link de recuperacao.' });
  }
});

// POST /api/auth/reset-password — define nova senha a partir do token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token e nova senha sao obrigatorios.' });
    if (String(password).length < 8) return res.status(400).json({ success: false, error: 'A senha deve ter ao menos 8 caracteres.' });
    const userId = await authTokens.consume(token, 'reset');
    if (!userId) return res.status(400).json({ success: false, error: 'Link invalido ou expirado. Solicite um novo.' });
    await users.updatePassword(userId, password);
    await sessions.deleteByUser(userId);
    res.json({ success: true, message: 'Senha redefinida. Faca login com a nova senha.' });
  } catch (err) {
    logger.error('reset-password: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao redefinir a senha.' });
  }
});

// POST /api/auth/verify-email — confirma o email a partir do token
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'Token ausente.' });
    const userId = await authTokens.consume(token, 'verify');
    if (!userId) return res.status(400).json({ success: false, error: 'Link invalido ou expirado.' });
    await users.setEmailVerified(userId);
    res.json({ success: true, message: 'Email confirmado!' });
  } catch (err) {
    logger.error('verify-email: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao confirmar o email.' });
  }
});

// POST /api/auth/resend-verification — reenvia o link (usuario logado)
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    if (req.user.email_verified) return res.json({ success: true, message: 'Seu email ja esta confirmado.' });
    const uid   = req.user.user_id || req.user.id;
    const vraw  = await authTokens.create(uid, 'verify', 60 * 24);
    const vbase = process.env.BASE_URL || 'https://vaultly.digital';
    await sendVerificationEmail({ userEmail: req.user.email, userName: req.user.name, verifyUrl: vbase + '/confirmar-email?token=' + vraw })
      .catch(e => logger.error('resend verify: ' + e.message));
    res.json({ success: true, message: 'Enviamos um novo link de confirmacao para o seu email.' });
  } catch (err) {
    logger.error('resend-verification: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao reenviar.' });
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
