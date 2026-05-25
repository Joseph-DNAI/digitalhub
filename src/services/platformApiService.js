// src/services/platformApiService.js
// Busca produtos diretamente nas APIs das plataformas de venda

const logger = require('../config/logger');

// ─── Yampi ────────────────────────────────────────────────────────────────────
// Docs: https://api.dooki.com.br/v2
// Autenticacao: headers user-token + merchant-token

async function fetchYampiProducts(storeAlias, apiToken) {
  if (!storeAlias || !apiToken) {
    throw new Error('Yampi requer yampi_store_alias e yampi_api_token nas configuracoes');
  }

  const url = 'https://api.dooki.com.br/v2/' + storeAlias + '/catalog/products?page=1&limit=100&include=skus';
  logger.info('Buscando produtos Yampi — loja: ' + storeAlias);

  const resp = await fetch(url, {
    headers: {
      'user-token':     apiToken,
      'merchant-token': apiToken,
      'Content-Type':   'application/json'
    }
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Yampi API erro ' + resp.status + ': ' + err);
  }

  const data = await resp.json();
  const items = data.data || [];

  return items.map(function(p) {
    return {
      platform:           'yampi',
      platform_product_id: String(p.id || ''),
      name:               p.name || p.title || 'Produto sem nome',
      description:        p.description || '',
      price:              p.base_price || 0,
      sku:                p.alias || p.external_id || null,
      status:             p.published ? 'active' : 'inactive'
    };
  });
}

// ─── Kiwify ───────────────────────────────────────────────────────────────────
// A Kiwify nao possui API publica de listagem de produtos para sellers.
// A integracao acontece via webhook — os produtos aparecem automaticamente
// em "Produtos Nao Mapeados" quando chegam pedidos.

async function fetchKiwifyProducts(apiKey) {
  if (!apiKey) {
    throw new Error('Kiwify: a API publica de listagem de produtos nao esta disponivel. Use o webhook para capturar produtos automaticamente.');
  }

  // Tentativa com a API conhecida da Kiwify (pode nao estar disponivel para todos)
  const url = 'https://api.kiwify.com.br/v1/products';
  logger.info('Buscando produtos Kiwify via API');

  const resp = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type':  'application/json'
    }
  });

  if (!resp.ok) {
    if (resp.status === 404 || resp.status === 401) {
      throw new Error('Kiwify: API de produtos nao disponivel para esta conta. Os produtos serao capturados automaticamente via webhook quando chegarem os primeiros pedidos.');
    }
    const err = await resp.text();
    throw new Error('Kiwify API erro ' + resp.status + ': ' + err);
  }

  const data = await resp.json();
  const items = data.data || data.products || [];

  return items.map(function(p) {
    return {
      platform:           'kiwify',
      platform_product_id: String(p.id || p.product_id || ''),
      name:               p.name || p.title || 'Produto sem nome',
      description:        p.description || '',
      price:              p.price || 0,
      status:             'active'
    };
  });
}

module.exports = { fetchYampiProducts, fetchKiwifyProducts };
