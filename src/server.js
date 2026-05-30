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

// CSP desabilitado intencionalmente — o frontend usa muitos scripts inline
// Para habilitar corretamente no futuro, é necessário adicionar nonces em cada
// bloco <script> e atributo onclick do index.html e admin.html
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.set('trust proxy', 1);

// Rate limit geral
app.use(rateLimit({ windowMs: 15*60*1000, max: 300 }));

// Rate limit restrito para auth (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15*60*1000,
  max: 20,
  message: { success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' }
});

const webhookLimiter = rateLimit({ windowMs: 60*1000, max: 60 });

// CORS restrito à origem do app
const allowedOrigins = [
  process.env.BASE_URL,
  'http://localhost:3000',
  'http://localhost:3001'
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
    res.header('Access-Control-Allow-Origin', origin || allowedOrigins[0] || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Body parser raw — preserva rawBody para validacao HMAC (webhook Kiwify/Yampi e Stripe)
function rawBodyParser(req, res, next) {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
    next();
  });
}

app.use('/api/webhook',         rawBodyParser);
app.use('/api/billing/webhook', rawBodyParser);

// Body parser normal
app.use('/api/products',   express.json());
app.use('/api/deliveries', express.json());
app.use('/api/auth',       express.json());
app.use('/api/admin',      express.json());
app.use('/api/tenants',    express.json());
app.use('/api/billing',    express.json());
app.use('/api/support',    express.json());
app.use('/api/seller',     express.json());
app.use('/api/checkout',   express.json());
app.use('/api/asaas',      express.json());

app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Painel frontend
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath, { index: false }));
  logger.info('Painel em: ' + publicPath);
}

// Rotas
app.use('/api/webhook',    webhookLimiter, require('./routes/webhook'));
app.use('/api/auth',       authLimiter, require('./routes/auth'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/tenants',    require('./routes/tenants'));
app.use('/api/billing',    require('./routes/billing'));
app.use('/api/support',    require('./routes/support'));
app.use('/api/seller',     require('./routes/seller'));
app.use('/api/checkout',   require('./routes/checkout'));
app.use('/api/asaas',      require('./routes/asaasWebhook'));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime(), timestamp: new Date().toISOString() }));

// Landing page como homepage publica
app.get('/', (req, res) => {
  const landing = path.join(publicPath, 'landing.html');
  if (fs.existsSync(landing)) return res.sendFile(landing);
  res.json({ name: 'Vaultly API', version: '2.0.0' });
});

// Painel do usuario (requer login)
app.get('/app', (req, res) => {
  const idx = path.join(publicPath, 'index.html');
  if (fs.existsSync(idx)) return res.sendFile(idx);
  res.redirect('/');
});

// Login standalone — redireciona para /app (que tem overlay de login)
app.get('/login', (req, res) => res.redirect('/app'));

// Página pública de suporte (FAQ + denúncia) — linkada nos emails de entrega
app.get('/suporte', (req, res) => {
  const sup = path.join(publicPath, 'suporte.html');
  if (fs.existsSync(sup)) return res.sendFile(sup);
  res.redirect('/');
});

// Página pública de termos legais (Termos de Uso, Privacidade, Responsabilidade)
app.get('/termos', (req, res) => {
  const termos = path.join(publicPath, 'termos.html');
  if (fs.existsSync(termos)) return res.sendFile(termos);
  res.redirect('/');
});

app.use((err, req, res, next) => {
  logger.error('Erro global: ' + err.message);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

app.use((req, res) => res.status(404).json({ error: 'Rota nao encontrada' }));

async function startWithRetry(maxAttempts, delayMs) {
  maxAttempts = maxAttempts || 10;
  delayMs = delayMs || 3000;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDatabase();
      app.listen(PORT, function() {
        logger.info('Vaultly rodando na porta ' + PORT);
        var painelUrl = process.env.BASE_URL || ('http://localhost:' + PORT);
        logger.info('Painel: ' + painelUrl);
        startRetryJob();
      });
      return;
    } catch (err) {
      logger.error('Tentativa ' + attempt + '/' + maxAttempts + ' - falha ao conectar ao banco: ' + err.message);
      if (attempt === maxAttempts) {
        logger.error('Numero maximo de tentativas atingido. Encerrando.');
        process.exit(1);
      }
      var wait = delayMs * attempt;
      logger.info('Aguardando ' + (wait / 1000) + 's antes de tentar novamente...');
      await new Promise(function(resolve) { setTimeout(resolve, wait); });
    }
  }
}

startWithRetry();

module.exports = app;
