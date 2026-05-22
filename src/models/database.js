// src/models/database.js
// Banco de dados JSON usando lowdb — sem compilação, funciona em qualquer sistema

const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || './data/digitalhub.json';
const dbDir   = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// ─── Inicialização ────────────────────────────────────────────────────────────

const adapter = new FileSync(DB_PATH);
const db      = low(adapter);

// Estrutura padrão do banco
db.defaults({
  products:     [],
  deliveries:   [],
  webhook_logs: []
}).write();

function initDatabase() {
  console.log('✅ Banco de dados iniciado:', DB_PATH);
  return Promise.resolve(db);
}

// ─── Helper: timestamp ────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

const products = {
  create(data) {
    const record = {
      id:             uuidv4(),
      name:           data.name,
      description:    data.description    || null,
      price:          data.price          || 0,
      kiwify_id:      data.kiwify_id      || null,
      yampi_id:       data.yampi_id       || null,
      file_path:      data.file_path      || null,
      file_name:      data.file_name      || null,
      email_template: data.email_template || null,
      status:         data.status         || 'active',
      created_at:     now(),
      updated_at:     now()
    };
    db.get('products').push(record).write();
    return record;
  },

  update(id, data) {
    db.get('products')
      .find({ id })
      .assign({ ...data, updated_at: now() })
      .write();
    return this.findById(id);
  },

  delete(id) {
    db.get('products').remove({ id }).write();
  },

  findById(id) {
    return db.get('products').find({ id }).value() || null;
  },

  findByPlatformId(platform, platformId) {
    if (platform === 'kiwify') {
      return db.get('products').find({ kiwify_id: platformId, status: 'active' }).value() || null;
    }
    if (platform === 'yampi') {
      return db.get('products').find({ yampi_id: platformId, status: 'active' }).value() || null;
    }
    return db.get('products').find(p => p.kiwify_id === platformId || p.yampi_id === platformId).value() || null;
  },

  findAll() {
    return db.get('products').orderBy(['created_at'], ['desc']).value();
  }
};

// ─── Entregas ─────────────────────────────────────────────────────────────────

const deliveries = {
  create(data) {
    const record = {
      id:                uuidv4(),
      product_id:        data.product_id,
      platform:          data.platform          || 'unknown',
      platform_order_id: data.platform_order_id || null,
      buyer_name:        data.buyer_name        || null,
      buyer_email:       data.buyer_email,
      status:            'pending',
      attempts:          0,
      error_message:     null,
      delivered_at:      null,
      created_at:        now()
    };
    db.get('deliveries').push(record).write();
    return record.id;
  },

  updateStatus(id, status, errorMessage = null) {
    db.get('deliveries')
      .find({ id })
      .assign({
        status,
        error_message: errorMessage,
        delivered_at:  status === 'delivered' ? now() : undefined,
        attempts:      (db.get('deliveries').find({ id }).value()?.attempts || 0) + 1
      })
      .write();
  },

  findAll(limit = 100) {
    const all = db.get('deliveries').orderBy(['created_at'], ['desc']).value().slice(0, limit);
    return all.map(d => {
      const p = products.findById(d.product_id);
      return { ...d, product_name: p?.name || 'Produto removido' };
    });
  },

  findPending() {
    return db.get('deliveries')
      .filter(d => ['pending', 'failed'].includes(d.status) && d.attempts < 3)
      .value()
      .map(d => {
        const p = products.findById(d.product_id);
        return { ...d, product_name: p?.name, file_path: p?.file_path, file_name: p?.file_name, email_template: p?.email_template };
      });
  },

  stats() {
    const all = db.get('deliveries').value();
    const today = now().slice(0, 10);
    return {
      total:     all.length,
      delivered: all.filter(d => d.status === 'delivered').length,
      failed:    all.filter(d => d.status === 'failed').length,
      today:     all.filter(d => d.created_at?.startsWith(today)).length,
      by_platform: Object.entries(
        all.reduce((acc, d) => { acc[d.platform] = (acc[d.platform] || 0) + 1; return acc; }, {})
      ).map(([platform, n]) => ({ platform, n }))
    };
  }
};

// ─── Logs de Webhook ──────────────────────────────────────────────────────────

const webhookLogs = {
  create(data) {
    const record = {
      id:         uuidv4(),
      platform:   data.platform   || 'unknown',
      event_type: data.event_type || null,
      payload:    data.payload    || null,
      status:     data.status     || null,
      ip:         data.ip         || null,
      created_at: now()
    };
    db.get('webhook_logs').push(record).write();
    return record.id;
  },

  findAll(limit = 50) {
    return db.get('webhook_logs').orderBy(['created_at'], ['desc']).value().slice(0, limit);
  }
};

module.exports = { initDatabase, products, deliveries, webhookLogs };
