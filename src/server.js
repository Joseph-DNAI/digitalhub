// src/server.js — multi-tenant
require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');
const logger    = require('./config/logger');
const { initDatabase } = require('./models/database');
const { startRetryJob } = require('./services/deliveryService');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15*60*1000, max: 500 }));

const webhookLimiter = rateLimit({ windowMs: 60*1000, max: 60 });

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Body parser para webhook (raw)
app.use('/api/webhook', (req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
    next();
  });
});

// Body parser normal
app.use('/api/products',   express.json());
app.use('/api/deliveries', express.json());
app.use('/api/auth',       express.json());
app.use('/api/admin',      express.json());
app.use('/api/tenants',    express.json());

app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Painel frontend
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  logger.info(`📁 Painel em: ${publicPath}`);
}

// Rotas
app.use('/api/webhook',   webhookLimiter, require('./routes/webhook'));
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/deliveries',require('./routes/deliveries'));
app.use('/api/tenants',   require('./routes/tenants'));


app.get('/health', (req, res) => res.json({ status:'ok', version:'2.0.0', uptime: process.uptime(), timestamp: new Date().toISOString() }));

app.get('/', (req, res) => {
  const idx = path.join(publicPath, 'index.html');
  if (fs.existsSync(idx)) return res.sendFile(idx);
  res.json({ name: 'Vaultly API', version: '2.0.0' });
});

app.use((err, req, res, next) => {
  logger.error(`Erro global: ${err.message}`);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

async function startWithRetry(maxAttempts = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDatabase();
      app.listen(PORT, () => {
        logger.info(`🚀 Vaultly rodando na porta ${PORT}`);
        logger.info(`🌐 Painel: ${process.env.BASE_URL || `http://localhost:${PORT}`