// src/models/database.js
// Banco de dados PostgreSQL — persistente entre deploys

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ─── Inicialização — cria tabelas se não existirem ────────────────────────────

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id             TEXT PRIMARY KEY,
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
        updated_at     TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id                TEXT PRIMARY KEY,
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

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id         TEXT PRIMARY KEY,
        platform   TEXT DEFAULT 'unknown',
        event_type TEXT,
        payload    TEXT,
        status     TEXT,
        ip         TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.info('✅ Banco de dados PostgreSQL iniciado');
  } finally {
    client.release();
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

const products = {
  async create(data) {
    const id = uuidv4();
    await query(`
      INSERT INTO products (id, name, description, price, kiwify_id, yampi_id, file_path, file_name, email_template, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [id, data.name, data.description||null, data.price||0, data.kiwify_id||null, data.yampi_id||null, data.file_path||null, data.file_name||null, data.email_template||null, data.status||'active']);
    return this.findById(id);
  },

  async update(id, data) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    const sets   = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await query(`UPDATE products SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...values, id]);
    return this.findById(id);
  },

  async delete(id) {
    await query('DELETE FROM products WHERE id = $1', [id]);
  },

  async findById(id) {
    return queryOne('SELECT * FROM products WHERE id = $1', [id]);
  },

  async findByPlatformId(platform, platformId) {
    if (platform === 'kiwify') return queryOne("SELECT * FROM products WHERE kiwify_id = $1 AND status = 'active'", [platformId]);
    if (platform === 'yampi')  return queryOne("SELECT * FROM products WHERE yampi_id = $1 AND status = 'active'", [platformId]);
    return queryOne('SELECT * FROM products WHERE kiwify_id = $1 OR yampi_id = $1', [platformId]);
  },

  async findAll() {
    return query('SELECT * FROM products ORDER BY created_at DESC');
  }
};

// ─── Entregas ─────────────────────────────────────────────────────────────────

const deliveries = {
  async create(data) {
    const id = uuidv4();
    await query(`
      INSERT INTO deliveries (id, product_id, platform, platform_order_id, buyer_name, buyer_email, status)
      VALUES ($1,$2,$3,$4,$5,$6,'pending')
    `, [id, data.product_id, data.platform||'unknown', data.platform_order_id||null, data.buyer_name||null, data.buyer_email]);
    return id;
  },

  async updateStatus(id, status, errorMessage = null) {
    await query(`
      UPDATE deliveries SET status = $1, error_message = $2,
        delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
        attempts = attempts + 1
      WHERE id = $3
    `, [status, errorMessage, id]);
  },

  async findAll(limit = 100) {
    return query(`
      SELECT d.*, p.name as product_name
      FROM deliveries d LEFT JOIN products p ON d.product_id = p.id
      ORDER BY d.created_at DESC LIMIT $1
    `, [limit]);
  },

  async findPending() {
    return query(`
      SELECT d.*, p.name as product_name, p.file_path, p.file_name, p.email_template
      FROM deliveries d LEFT JOIN products p ON d.product_id = p.id
      WHERE d.status IN ('pending','failed') AND d.attempts < 3
      ORDER BY d.created_at ASC
    `);
  },

  async stats() {
    const [total, delivered, failed, today, byPlatform] = await Promise.all([
      queryOne("SELECT COUNT(*) as n FROM deliveries"),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE status = 'delivered'"),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE status = 'failed'"),
      queryOne("SELECT COUNT(*) as n FROM deliveries WHERE created_at::date = CURRENT_DATE"),
      query("SELECT platform, COUNT(*) as n FROM deliveries GROUP BY platform")
    ]);
    return {
      total:       parseInt(total.n),
      delivered:   parseInt(delivered.n),
      failed:      parseInt(failed.n),
      today:       parseInt(today.n),
      by_platform: byPlatform
    };
  }
};

// ─── Logs de Webhook ──────────────────────────────────────────────────────────

const webhookLogs = {
  async create(data) {
    const id = uuidv4();
    await query(`
      INSERT INTO webhook_logs (id, platform, event_type, payload, status, ip)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [id, data.platform||'unknown', data.event_type||null, data.payload||null, data.status||null, data.ip||null]);
    return id;
  },

  async findAll(limit = 50) {
    return query('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT $1', [limit]);
  }
};

module.exports = { initDatabase, products, deliveries, webhookLogs };
