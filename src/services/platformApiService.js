// src/services/platformApiService.js
// Busca produtos diretamente nas APIs das plataformas de venda

const logger = require('../config/logger');

// ─── Yampi ────────────────────────────────────────────────────────────────────
// Docs: https://api.dooki.com.br/v2
// Auth: header "user-token: {api_key}"
// Alias: URL da loja — yampi.com.br/{alias}

async function fetchYampiProducts(storeAlias, apiToken) {
  if (!storeAlias || !apiToken) {
    var err = new Error('CREDENCIAIS_AUSENTES');
    err.credentialsMissing = true;
    throw err;
  }

  // Remove protocolo se o usuario colou a URL inteira
  var alias = storeAlias.replace(/^https?:\/\/[^/]+\//i, '').replace(/\/$/, '').split('/')[0];

  var url = 'https://api.dooki.com.br/v2/' + alias + '/catalog/products?page=1&limit=100&include=skus';
  logger.info('Buscando produtos Yampi — loja: ' + alias);

  var resp = await fetch(url, {
    headers: {
      'user-token':   apiToken,
      'Content-Type': 'application/json'
    }
  });

  if (!resp.ok) {
    var body = await resp.text();
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Token Yampi invalido ou sem permissao. Verifique em: Yampi > Configuracoes > Integracoes > API');
    }
    if (resp.status === 404) {
      throw new Error('Loja "' + alias + '" nao encontrada. Verifique o alias em: yampi.com.br/{alias}');
    }
    throw new Error('Yampi API erro ' + resp.status + ': ' + body.slice(0, 200));
  }

  var data = await resp.json();
  var items = (data.data) ? data.data : [];

  if (!Array.isArray(items)) items = [];

  return items.map(function(p) {
    return {
      platform:            'yampi',
      platform_product_id: String(p.id || ''),
      name:                p.name || 'Produto sem nome',
      description:         p.description || '',
      price:               p.base_price || 0,
      status:              p.published ? 'active' : 'inactive'
    };
  });
}

// ─── Kiwify ───────────────────────────────────────────────────────────────────
// A Kiwify nao possui API publica de listagem de produtos para sellers.
// Os produtos aparecem automaticamente em "Produtos Pendentes" via webhook.

async function fetchKiwifyProducts(apiKey) {
  // Kiwify nao tem API publica de produtos — retorna lista vazia com aviso
  var err = new Error('KIWIFY_SEM_API');
  err.noPublicApi = true;
  throw err;
}

module.exports = { fetchYampiProducts, fetchKiwifyProducts };
