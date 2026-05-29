// src/routes/support.js — denúncias (público) e chamados (usuário logado) + caixa do admin
const express = require('express');
const router  = express.Router();
const { supportTickets } = require('../models/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../config/logger');

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// POST /api/support/report — denúncia pública (cliente que recebeu o email)
router.post('/report', async (req, res) => {
  try {
    const { reporter_name, reporter_email, subject, message, order_ref } = req.body || {};
    if (!message || String(message).trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Descreva o ocorrido com pelo menos 10 caracteres.' });
    }
    if (reporter_email && !isEmail(reporter_email)) {
      return res.status(400).json({ success: false, error: 'Email inválido.' });
    }
    const id = await supportTickets.create({
      type:           'report',
      reporter_name:  (reporter_name  || '').slice(0, 120),
      reporter_email: (reporter_email || '').slice(0, 160),
      subject:        (subject || 'Denúncia de produto').slice(0, 160),
      message:        String(message).slice(0, 4000),
      order_ref:      (order_ref || '').slice(0, 120)
    });
    logger.warn('Nova denúncia recebida: ' + id);
    res.json({ success: true, id });
  } catch (err) {
    logger.error('Erro ao registrar denúncia: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao registrar. Tente novamente.' });
  }
});

// POST /api/support/ticket — chamado do usuário logado
router.post('/ticket', requireAuth, async (req, res) => {
  try {
    const { subject, message } = req.body || {};
    if (!message || String(message).trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Descreva sua dúvida com pelo menos 10 caracteres.' });
    }
    const id = await supportTickets.create({
      type:           'support',
      tenant_id:      req.tenantId,
      reporter_name:  req.user.name  || null,
      reporter_email: req.user.email || null,
      subject:        (subject || 'Pedido de suporte').slice(0, 160),
      message:        String(message).slice(0, 4000)
    });
    logger.info('Novo chamado de suporte: ' + id + ' (user ' + (req.user.email || '?') + ')');
    res.json({ success: true, id });
  } catch (err) {
    logger.error('Erro ao abrir chamado: ' + err.message);
    res.status(500).json({ success: false, error: 'Erro ao abrir chamado. Tente novamente.' });
  }
});

// GET /api/support/admin/list?status=open — caixa de entrada do admin
router.get('/admin/list', requireAdmin, async (req, res) => {
  try {
    const tickets = await supportTickets.findAll(req.query.status);
    const stats   = await supportTickets.stats();
    res.json({ success: true, data: tickets, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/support/admin/:id — resolver / reabrir
router.put('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const status = req.body.status === 'resolved' ? 'resolved' : 'open';
    await supportTickets.updateStatus(req.params.id, status, req.body.admin_note);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
