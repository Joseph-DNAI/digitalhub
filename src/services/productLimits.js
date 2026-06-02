// src/services/productLimits.js
// Logica pura dos limites de produto. Sem I/O.
// - Limite do plano (maxActive) conta produtos ATIVOS (status='active'). -1 = ilimitado.
// - Teto global protege o servidor (total cadastrado por tenant).

const MAX_PRODUCTS_TOTAL = parseInt(process.env.MAX_PRODUCTS_TOTAL || '100', 10);

function unlimited(maxActive) {
  return maxActive === -1 || maxActive == null;
}

// Status inicial de um produto novo conforme o limite de ativos do plano.
function initialStatus(activeCount, maxActive) {
  if (unlimited(maxActive)) return 'active';
  return activeCount < maxActive ? 'active' : 'inactive';
}

// Pode ativar mais um produto?
function canActivate(activeCount, maxActive) {
  if (unlimited(maxActive)) return true;
  return activeCount < maxActive;
}

// O total ja atingiu o teto global?
function atGlobalCap(totalCount, cap) {
  return totalCount >= (cap || MAX_PRODUCTS_TOTAL);
}

module.exports = { initialStatus, canActivate, atGlobalCap, MAX_PRODUCTS_TOTAL };
