// src/middleware/auth.js
// Middleware de autenticação por token de sessão

const { sessions } = require('../models/database');
const logger = require('../config/logger');

// Extrai token do header Authorization ou cookie
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.headers['cookie'];
  if (cookie) {
    const match = cookie.match(/vaultly_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

// Middleware: requer autenticação
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Não autenticado' });

  try {
    const session = await sessions.findByToken(token);
    if (!session) return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada' });
    if (!session.is_active) return res.status(403).json({ success: false, error: 'Conta desativada' });

    req.user      = session;
    req.tenantId  = session.tenant_id;
    next();
  } catch (err) {
    logger.error(`Erro na autenticação: ${err.message}`);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
}

// Middleware: requer role de admin
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });
    }
    next();
  });
}

// Middleware: verifica limite do plano
function requirePlanLimit(resource) {
  return async (req, res, next) => {
    const { max_products, max_deliveries_month } = req.user;

    if (resource === 'product' && max_products !== -1) {
      const { products } = require('../models/database');
      const count = await products.count(req.tenantId);
      if (count >= max_products) {
        return res.status(403).json({
          success: false,
          error: `Limite do plano atingido: máximo de ${max_products} produto(s). Faça upgrade para continuar.`
        });
      }
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requirePlanLimit, extractToken };
