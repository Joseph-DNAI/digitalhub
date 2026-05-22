// src/server.js
require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');
const logger  = require('./config/logger');
const { initDatabase } = require('./models/database');
const { startRetryJob } = require('./services/deliveryService');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

// Body parser APENAS para rotas de webhook (JSON puro)
// Rotas de produtos usam multipart — o multer cuida do parsing lá
app.use('/api/webhook', (req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
    next();
  });
});

// Para todas as outras rotas (exceto webhook), usa o express.json e urlencoded normais
app.use('/api/products',   express.json());
app.use('/api/deliveries', express.json());

app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) app.use(express.static(publicPath));

app.use('/api/webhook',   webhookLimiter, require('./routes/webhook'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/deliveries', require('./routes/deliveries'));

app.get('/health', (req, res) => res.json({
  status: 'ok', version: '1.0.0',
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}));

app.get('/', (req, res) => res.json({
  name: 'DigitalHub Multi-Plataforma',
  version: '1.0.0',
  platforms: ['kiwify', 'yampi'],
  webhook_kiwify: `${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhook/kiwify`,
  webhook_yampi:  `${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhook/yampi`,
}));

app.use((err, req, res, next) => {
  logger.error(`Erro global: ${err.message}`);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

initDatabase().then(() => {
  app.listen(PORT, () => {
    logger.info(`🚀 DigitalHub rodando na porta ${PORT}`);
    logger.info(`🔗 Kiwify: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhook/kiwify`);
    logger.info(`🔗 Yampi:  ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhook/yampi`);
    startRetryJob();
  });
}).catch(err => {
  console.error('❌ Falha ao iniciar banco:', err);
  process.exit(1);
});

module.exports = app;
