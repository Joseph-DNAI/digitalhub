// src/models/database.js
// Banco PostgreSQL com suporte multi-tenant completo

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Planos disponíveis
      CREATE TABLE IF NOT EXISTS plans (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        max_products INTEGER DEFAULT 5,
        max_deliveries_month INTEGER DEFAULT 500,
        price_brl    NUMERIC DEFAULT 0,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP DEFAULT NOW()
      );

      -- Usuários/clientes
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT DEFAULT 'client',
        plan_id       TEXT DEFAULT 'free',
        is_active     BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );

      -- Configurações por tenant (cliente)
      CREATE TABLE IF NOT EXISTS tenants (
        id                    TEXT PRIMARY KEY,
        user_id               TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kiwify_webhook_secret TEXT,
        yampi_webhook_secret  TEXT,
        smtp_host             TEXT,
        smtp_port             INTEGER DEFAULT 587,
        smtp_user             TEXT,
        smtp_pass             TEXT,
        email_from_name       TEXT DEFAULT 'Minha Loja',
        email_from_address    TEXT,
        resend_api_key        TEXT,
        created_at            TIMESTAMP DEFAULT NOW(),
        updated_at            TIMESTAMP DEFAULT NOW()
      );

      -- Produtos (agora com tenant_id)
      CREATE TABLE IF NOT EXISTS products (
        id             TEXT PRIMARY KEY,
        tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        description    TEXT,
        price          NUMERIC DEFAULT 0,
        kiwify_id      TEXT,
        yampi_id       TEXT,
        file_path      TEXT,
        file_name      TEXT,
        email_template TEXT,
        status         TEXT DEFAULT 'active',
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, kiwify_id),
        UNIQUE(tenant_id, yampi_id)
      );

      -- Entregas (agora com tenant_id)
      CREATE TABLE IF NOT EXISTS deliveries (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id        TEXT NOT NULL,
        platform          TEXT DEFAULT 'unknown',
        platform_order_id TEXT,
        buyer_name        TEXT,
        buyer_email       TEXT NOT NULL,
        status            TEXT DEFAULT 'pending',
        attempts          INTEGER DEFAULT 0,
        error_message     TEXT,
        delivered_at      TIMESTAMP,
        created_at        TIMESTAMP DEFAULT NOW()
      );

      -- Logs de webhook (agora com tenant_id)
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        platform   TEXT DEFAULT 'unknown',
        event_type TEXT,
        payload    TEXT,
        status     TEXT,
        ip         TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Tokens de sessão
      CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token      TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Planos padrão
    await client.query(`
      INSERT INTO plans (id, name, max_products, max_deliveries_month, price_brl)
      VALUES
        ('free',  'Free',  1,  50,  0),
        ('basic', 'Basic', 5,  500, 47),
        ('pro',   'Pro',   -1, -1,  97)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Admin padrão
    const bcrypt = require('./bcrypt');
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'vaultly2024');
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, plan_id, is_active, email_verified)
      VALUES ($1, 'Admin', $2, $3, 'admin', 'pro', true, true)
      ON CONFLICT (email) DO NOTHING;
    `, [uuidv4(), process.env.ADMIN_EMAIL || 'admin@vaultly.com', adminHash]);

    // Garante tenant para o admin
    await client.query(`
      INSERT INTO tenants (id, user_id)
      SELECT $1, u.id FROM users u WHERE u.email = $2 AND NOT EXISTS (
        SELECT 1 FROM tenants t WHERE t.user_id = u.id
      );
    `, [uuidv4(), process.env.ADMIN_EMAIL || 'admin@vaultly.com']);

    logger.info('✅ Banco de dados multi-tenant iniciado');
  } finally {
    client.release();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

const users = {
  async create(data) {
    const id = uuidv4();
    const tenantId = uuidv4();
    const bcrypt = require('./bcrypt');
    const hash = await bcrypt.hash(data.password);

    await query(`
      INSERT INTO users (id, name, email, password_hash, role, plan_id, is_active, email_verified)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [id, data.name, data.email, hash, data.role||'client', data.plan_id||'free', data.is_active!==false, data.email_verified||false]);

    await query(`INSERT INTO tenants (id, user_id) VALUES ($1,$2)`, [tenantId, id]);

    return this.findById(id);
  },

  async findById(id) {
    return queryOne(`
      SELECT u.*, p.name as plan_name, p.max_products, p.max_deliveries_month,
             t.id as tenant_id
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      LEFT JOIN tenants t ON t.user_id = u.id
      WHERE u.id = $1
    `, [id]);
  },

  async findByEmail(email) {
    return queryOne(`
      SELECT u.*, p.name as plan_name, p.max_products, p.max_deliveries_month,
             t.id as tenant_id
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      LEFT JOIN tenants t ON t.user_id = u.id
      WHERE u.email = $1
    `, [email]);
  },

  async findAll() {
    return query(`
      SELECT u.*, p.name as plan_name,
             t.id as tenant_id,
             (SELECT COUNT(*) FROM products pr WHERE pr.tenant_id = t.id) as product_count,
             (SELECT COUNT(*) FROM deliveries d WHERE d.tenant_id = t.id) as delivery_count
      FROM users u
      LEFT JOIN plans p ON u.plan_id = p.id
      LEFT JOIN tenants t ON t.user_id = u.id
      ORDER BY u.created_at DESC
    `);
  },

  async update(id, data) {
    const fields = Object.keys(data).map((k,i) => `${k} = $${i+1}`).join(', ');
    await query(`UPDATE users SET ${fields}, updated_at = NOW() WHERE id = $${Object.keys(data).length+1}`, [...Object.values(data), id]);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM users WHERE id = $1', [id]);
  }
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

const sessions = {
  async create(userId) {
    const token = require('crypto').randomBytes(32).toString('hex');
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
    await query(`INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)`, [id, userId, token, expiresAt]);
    return token;
  },

  async findByToken(token) {
    return queryOne(`
      SELECT s.*, u.id as user_id, u.name, u.email, u.role, u.plan_id, u.is_active,
             t.id as tenant_id, p.max_products, p.max_deliveries_month
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN tenants t ON t.user_id = u.id
      LEFT JOIN plans p ON u.plan_id = p.id
      WHERE s.token = $1 AND s.expires_at > NOW()
    `, [token]);
  },

  async delete(token) {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
  },

  async cleanup() {
    await query('DELETE FROM sessions WHERE expires_at < NOW()');
  }
};

// ─── Tenants ──────────────────────────────────────────────────────────────────

const tenants = {
  async findById(id) {
    return queryOne('SELECT * FROM tenants WHERE id = $1', [id]);
  },

  async update(id, data) {
    const fields = Object.keys(data).map((k,i) => `${k} = $${i+1}`).join(', ');
    await query(`UPDATE tenants SET ${fields}, updated_at = NOW() WHERE id = $${Object.keys(data).length+1}`, [...Object.values(data), id]);
    return this.findById(id);
  }
};

// ─── Products ─────────────────────────────────────────────────────────────────

const products = {
  async create(tenantId, data) {
    const id = uuidv4();
    await query(`
      INSERT INTO products (id, tenant_id, name, description, price, kiwify_id, yampi_id, file_path, file_name, email_template, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [id, tenantId, data.name, data.description||null, data.price||0, data.kiwify_id||null, data.yampi_id||null, data.file_path||null, data.file_name||null, data.email_template||null, data.status||'active']);
    return this.findById(tenantId, id);
  },

  async update(tenantId, id, data) {
    const fields = Object.keys(data).map((k,i) => `${k} = $${i+1}`).join(', ');
    await query(`UPDATE products SET ${fields}, updated_at = NOW() WHERE id = $${Object.keys(data).length+1} AND tenant_id = $${Object.keys(data).length+2}`, [...Object.values(data), id, tenantId]);
    return this.findById(tenantId, id);
  },

  async delete(tenantId, id) {
    await query('DELETE FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  },

  async findById(tenantId, id) {
    return queryOne('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  },

  async findByPlatformId(tenantId, platform, platformId) {
    if (platform === 'kiwify') return queryOne("SELECT * FROM products WHERE tenant_id = $1 AND kiwify_id = $2 AND status = 'active'", [tenantId, platformId]);
    if (platform === 'yampi')  return queryOne("SELECT * FROM products WHERE tenant_id = $1 AND yampi_id = $2 AND status = 'active'", [tenantId, platformId]);
    return queryOne('SELECT * FROM products WHERE tenant_id = $1 AND (kiwify_id = $2 OR yampi_id = $2)', [tenantId, platformId]);
  },

  async findAll(tenantId) {
    return query('SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  },

  async count(tenantId) {
    const r = await queryOne('SELECT COUNT(*) as n FROM products WHERE tenant_id = $1', [tenantId]);
    return parseInt(r.n);
  }
};

// ─── Deliveries ───────────────────────────────────────────────────────────────

const deliveries = {
  async create(tenantId, data) {
    const id = uuidv4();
    await query(`
      INSERT INTO deliveries (id, tenant_id, product_id, platform, platform_order_id, buyer_name, buyer_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [id, tenantId, data.product_id, data.platform||'unknown', data.platform_order_id||null, data.buyer_name||null, data.buyer_email]);
    return id;
  },

  async updateStatus(id, status, errorMessage = null) {
    await query(`
      UPDATE deliveries SET status=$1, error_message=$2,
        delivered_at = CASE WHEN $1='delivered' THEN NOW() ELSE delivered_at END,
        attempts = attempts + 1
      WHERE id = $3
    `, [status, errorMessage, id]);
  },

  async findAll(tenantId, limit = 100) {
    return query(`
      SELECT d.*, p.name as product_name
      FROM deliveries d LEFT JOIN products p ON d.product_id = p.id
      WHERE d.tenant_id = $1
      ORDER BY d.created_at DESC LIMIT $2
    `, [tenantId, limit]);
  },

  async findPending(tenantId) {
    return query(`
      SELECT d.*, p.file_path, p.file_name, p.email_template,
             t.resend_api_key, t.smtp_host, t.smtp_user, t.smtp_pass,
             t.email_from_name, t.email_from_address
      FROM deliveries d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      WHERE d.tenant_id = $1 AND d.status IN ('pending','failed') AND d.attempts < 3
    `, [tenantId]);
  },

  async findAllPending() {
    return query(`
      SELECT d.*, p.file_path, p.file_name, p.email_template,
             t.resend_api_key, t.smtp_host, t.smtp_user, t.smtp_pass,
             t.email_from_name, t.email_from_address
      FROM deliveries d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      WHERE d.status IN ('pending','failed') AND d.attempts < 3
    `);
  },

  async stats(tenantId) {
    const [total, delivered, failed, today] = await Promise.all([
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE tenant_id=$1", [tenantId]),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE tenant_id=$1 AND status='delivered'", [tenantId]),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE tenant_id=$1 AND status='failed'", [tenantId]),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE", [tenantId])
    ]);
    return {
      total: parseInt(total.n), delivered: parseInt(delivered.n),
      failed: parseInt(failed.n), today: parseInt(today.n)
    };
  }
};

// ─── Webhook logs ─────────────────────────────────────────────────────────────

const webhookLogs = {
  async create(tenantId, data) {
    const id = uuidv4();
    await query(`
      INSERT INTO webhook_logs (id, tenant_id, platform, event_type, payload, status, ip)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [id, tenantId||null, data.platform||'unknown', data.event_type||null, data.payload||null, data.status||null, data.ip||null]);
    return id;
  },

  async findAll(tenantId, limit = 50) {
    return query('SELECT * FROM webhook_logs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2', [tenantId, limit]);
  }
};

// ─── Plans ────────────────────────────────────────────────────────────────────

const plans = {
  async findAll() { return query('SELECT * FROM plans WHERE is_active=true ORDER BY price_brl'); },
  async findById(id) { return queryOne('SELECT * FROM plans WHERE id=$1', [id]); }
};

module.exports = { initDatabase, pool, query, queryOne, users, sessions, tenants, products, deliveries, webhookLogs, plans };
