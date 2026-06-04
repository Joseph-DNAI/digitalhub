// public/consent.js — banner de consentimento de cookies/armazenamento (compartilhado)
// Auto-contido: injeta o banner + CSS + logica. Carregar com <script src="/consent.js" defer>.
// Hoje o site so usa armazenamento essencial (login + preferencias). A categoria "opcional"
// fica pronta para quando houver analytics/melhorias: checar VaultlyConsent.has('optional').
(function () {
  'use strict';
  var KEY = 'vaultly_consent';
  var VERSION = 1;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSION) return null;
      return c;
    } catch (e) { return null; }
  }
  function save(optional) {
    var c = { v: VERSION, essential: true, optional: !!optional, ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  function injectStyles() {
    if (document.getElementById('vc-styles')) return;
    var css =
      '.vc-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:560px;margin:0 auto;background:#111828;border:1px solid rgba(255,255,255,0.12);border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,0.5);padding:18px 20px;color:#E8ECF5;font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;}' +
      '.vc-banner a{color:#FF6B35;text-decoration:none;}' +
      '.vc-title{font-weight:700;font-size:14px;margin-bottom:6px;display:flex;align-items:center;gap:7px;}' +
      '.vc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}' +
      '.vc-btn{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#E8ECF5;}' +
      '.vc-btn:hover{background:rgba(255,255,255,0.1);}' +
      '.vc-btn-primary{background:#FF6B35;border-color:#FF6B35;color:#fff;}' +
      '.vc-btn-primary:hover{background:#FF7A4A;}' +
      '.vc-prefs{margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;display:none;}' +
      '.vc-prefs.vc-open{display:block;}' +
      '.vc-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;}' +
      '.vc-row input{margin-top:2px;width:16px;height:16px;accent-color:#FF6B35;flex-shrink:0;}' +
      '.vc-rt{font-weight:600;font-size:13px;}' +
      '.vc-rd{font-size:12px;color:#94A3B8;}' +
      '@media(max-width:520px){.vc-banner{left:8px;right:8px;bottom:8px;padding:14px 16px;}}';
    var s = document.createElement('style');
    s.id = 'vc-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var bannerEl = null;
  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function showBanner() {
    injectStyles();
    removeBanner();
    var current = read();
    var optChecked = current ? !!current.optional : false;
    var el = document.createElement('div');
    el.className = 'vc-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Preferencias de cookies');
    el.innerHTML =
      '<div class="vc-title"><i class="ti ti-shield-lock" style="color:#FF6B35;"></i> Sua privacidade</div>' +
      '<div>Usamos <strong>armazenamento essencial</strong> (login e preferencias) e, com sua permissao, <strong>itens opcionais</strong> para melhorias futuras. Hoje nao ha rastreamento. <a href="/termos#cookies">Saiba mais</a>.</div>' +
      '<div class="vc-prefs" id="vc-prefs">' +
        '<div class="vc-row"><input type="checkbox" checked disabled><div><div class="vc-rt">Essencial</div><div class="vc-rd">Necessario para login e funcionamento — sempre ativo.</div></div></div>' +
        '<div class="vc-row"><input type="checkbox" id="vc-opt"' + (optChecked ? ' checked' : '') + '><div><div class="vc-rt">Opcional (melhorias)</div><div class="vc-rd">Metricas de uso para melhorar a plataforma. Nenhum ativo no momento.</div></div></div>' +
      '</div>' +
      '<div class="vc-actions">' +
        '<button class="vc-btn vc-btn-primary" id="vc-all">Aceitar todos</button>' +
        '<button class="vc-btn" id="vc-ess">Apenas essenciais</button>' +
        '<button class="vc-btn" id="vc-custom">Personalizar</button>' +
        '<button class="vc-btn vc-btn-primary" id="vc-savep" style="display:none;">Salvar preferencias</button>' +
      '</div>';
    document.body.appendChild(el);
    bannerEl = el;
    el.querySelector('#vc-all').onclick = function () { save(true); removeBanner(); };
    el.querySelector('#vc-ess').onclick = function () { save(false); removeBanner(); };
    el.querySelector('#vc-custom').onclick = function () {
      el.querySelector('#vc-prefs').classList.add('vc-open');
      el.querySelector('#vc-savep').style.display = 'inline-block';
    };
    el.querySelector('#vc-savep').onclick = function () {
      save(el.querySelector('#vc-opt').checked); removeBanner();
    };
  }

  window.VaultlyConsent = {
    has: function (cat) {
      if (cat === 'essential') return true;
      var c = read();
      return c ? !!c.optional : false;
    },
    get: function () { return read(); },
    open: function () { showBanner(); }
  };

  function init() { if (!read()) showBanner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
