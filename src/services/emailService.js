// src/services/emailService.js — aceita config por tenant
const { downloadFileBuffer } = require('./storageService');
const logger = require('../config/logger');

// Rodapé de branding para plano Free — publicidade gratuita em cada entrega
const VAULTLY_BRANDING = `
  <div style="margin-top:28px;padding:16px 18px;background:#FFF4EE;border:1px solid #FFD9C7;border-radius:10px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#C2410C;line-height:1.5;">
      Entrega automática por
      <a href="https://vaultly.digital" style="color:#FF6B35;font-weight:700;text-decoration:none;">Vaultly</a>
      <br>
      <span style="color:#9A7B6B;font-size:11px;">Venda produtos digitais e entregue no piloto automático.</span>
    </p>
  </div>
`;

function renderTemplate(template, vars, showBranding) {
  const brandingHtml = showBranding ? VAULTLY_BRANDING : '';
  const defaultTemplate = `
    <div style="background:#F4F5F7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <div style="background:#FF6B35;background:linear-gradient(135deg,#FF6B35 0%,#FF9F1C 100%);padding:36px 32px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;line-height:56px;background:rgba(255,255,255,0.18);border-radius:50%;margin-bottom:14px;font-size:28px;">📦</div>
          <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Seu produto chegou!</h1>
          <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Compra confirmada e entregue na hora</p>
        </div>

        <!-- Body -->
        <div style="padding:32px;">
          <p style="font-size:16px;color:#1F2937;margin:0 0 16px;">Olá, <strong>{{nome}}</strong>! 👋</p>
          <p style="font-size:15px;line-height:1.7;color:#4B5563;margin:0 0 24px;">
            Sua compra de <strong style="color:#1F2937;">{{produto}}</strong> foi confirmada com sucesso.
            O seu arquivo está <strong>anexado neste email</strong>, prontinho para baixar.
          </p>

          <!-- Caixa do arquivo -->
          <div style="background:#FFF4EE;border:1px solid #FFD9C7;border-radius:12px;padding:18px 20px;margin:0 0 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:22px;width:36px;vertical-align:middle;">📎</td>
              <td style="vertical-align:middle;">
                <div style="font-size:14px;font-weight:700;color:#C2410C;line-height:1.4;">{{arquivo}}</div>
                <div style="font-size:12px;color:#9A7B6B;margin-top:2px;">Anexo neste email · baixe quando quiser</div>
              </td>
            </tr></table>
          </div>

          <p style="font-size:14px;line-height:1.6;color:#4B5563;margin:0 0 8px;">
            Qualquer dúvida sobre o produto, basta responder este email. Bom proveito! 🚀
          </p>

          <div style="border-top:1px solid #EDEFF2;margin:24px 0 0;padding-top:16px;">
            <p style="font-size:12px;color:#9CA3AF;margin:0;">Número do pedido: <span style="font-family:'Courier New',monospace;color:#6B7280;">{{pedido}}</span></p>
          </div>

          {{branding}}
        </div>
      </div>
    </div>
  `;
  return (template || defaultTemplate)
    .replace(/{{nome}}/g,     vars.nome    || 'Cliente')
    .replace(/{{produto}}/g,  vars.produto || 'Produto')
    .replace(/{{arquivo}}/g,  vars.arquivo || 'arquivo.pdf')
    .replace(/{{email}}/g,    vars.email   || '')
    .replace(/{{pedido}}/g,   vars.pedido  || '')
    .replace(/{{branding}}/g, brandingHtml);
}

// Disclaimer legal — anexado a TODOS os emails (padrão ou personalizado).
// Protege a Vaultly: ela só transporta o arquivo, não responde pelo conteúdo.
const SUPPORT_URL = (process.env.BASE_URL || 'https://vaultly.digital') + '/suporte';
const DISCLAIMER = `
  <div style="max-width:560px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="background:#FBFBFC;border:1px solid #ECEEF1;border-radius:12px;padding:16px 18px;">
      <p style="margin:0 0 8px;font-size:11px;color:#6B7280;line-height:1.6;">
        <strong style="color:#4B5563;">Aviso:</strong> a <strong>Vaultly</strong> é apenas a plataforma que automatiza a entrega
        deste arquivo. Não produzimos, revisamos nem nos responsabilizamos pelo conteúdo do produto,
        que é de responsabilidade exclusiva do vendedor.
      </p>
      <p style="margin:0 0 8px;font-size:11px;color:#6B7280;line-height:1.6;">
        Se você suspeita que este produto envolve <strong>golpe, fraude, pirataria, conteúdo ilegal,
        material adulto/infantil, dados roubados, armas, drogas, falsificação ou qualquer atividade proibida</strong>,
        denuncie agora mesmo:
      </p>
      <p style="margin:0;text-align:center;">
        <a href="${SUPPORT_URL}" style="display:inline-block;background:#FF6B35;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:9px 18px;border-radius:8px;">
          Denunciar ou pedir ajuda
        </a>
      </p>
    </div>
  </div>
`;

async function sendProductEmail({ buyerEmail, buyerName, productName, filePath, fileName, emailTemplate, orderId, resendApiKey, fromName, fromAddress, showBranding }) {
  const apiKey = resendApiKey || process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  const fName  = fromName    || process.env.EMAIL_FROM_NAME    || 'Vaultly';
  const fAddr  = fromAddress || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

  if (!apiKey)   throw new Error('RESEND_API_KEY nao configurada');
  if (!filePath) throw new Error('Arquivo nao configurado para este produto');

  const baseHtml   = renderTemplate(emailTemplate, { nome: buyerName||buyerEmail, produto: productName, arquivo: fileName, email: buyerEmail, pedido: orderId }, showBranding);
  // Disclaimer legal sempre presente, mesmo em templates personalizados
  const htmlBody   = baseHtml + DISCLAIMER;
  const fileBuffer = await downloadFileBuffer(filePath);
  const fileBase64 = fileBuffer.toString('base64');

  logger.info('Enviando email via Resend para ' + buyerEmail + ' — ' + productName + (showBranding ? ' [Free/branding]' : ''));

  const response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:        fName + ' <' + fAddr + '>',
      to:          [buyerEmail],
      subject:     '🎉 Seu produto chegou: ' + productName,
      html:        htmlBody,
      attachments: [{ filename: fileName, content: fileBase64 }]
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error('Resend erro: ' + JSON.stringify(result));
  logger.info('Email enviado! ID: ' + result.id);
  return result;
}

async function sendLimitWarningEmail({ userEmail, userName, planName, used, limit, pct, upgradeUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fAddr  = process.env.EMAIL_FROM_ADDRESS || 'entregas@vaultly.digital';

  if (!apiKey) {
    logger.warn('RESEND_API_KEY nao configurada — aviso de limite nao enviado para ' + userEmail);
    return;
  }

  var isCrit = pct >= 95;
  var subject = isCrit
    ? 'Urgente: voce esta quase no limite de entregas deste mes!'
    : 'Aviso: voce ja usou ' + pct + '% das suas entregas este mes';

  var gradFrom = isCrit ? '#DC2626' : '#D97706';
  var gradTo   = isCrit ? '#EF4444' : '#F59E0B';
  var headText = isCrit ? 'Limite quase atingido!' : 'Aviso de limite de entregas';
  var urgNote  = isCrit
    ? '<p style="font-size:15px;color:#DC2626;font-weight:600;">Atencao: quando o limite for atingido, novas entregas serao pausadas ate o proximo ciclo mensal.</p>'
    : '';

  var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">' +
    '<div style="background:linear-gradient(135deg,' + gradFrom + ',' + gradTo + ');padding:30px 24px;border-radius:8px 8px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;">' + headText + '</h1>' +
    '</div>' +
    '<div style="background:#f9f9f9;padding:28px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">' +
    '<p style="font-size:16px;">Ola, <strong>' + (userName || userEmail) + '</strong>!</p>' +
    '<p style="font-size:15px;line-height:1.6;">Voce ja utilizou <strong>' + used + ' de ' + limit + ' entregas</strong> (' + pct + '%) no plano <strong>' + planName + '</strong> este mes.</p>' +
    urgNote +
    '<p style="font-size:14px;color:#555;">Para continuar entregando seus produtos sem interrupcoes, faca upgrade do seu plano.</p>' +
    '<div style="text-align:center;margin:28px 0;">' +
    '<a href="' + (upgradeUrl || 'https://vaultly.digital') + '" style="background:linear-gradient(135deg,#6C63FF,#38BDF8);color:#fff;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Fazer upgrade agora</a>' +
    '</div>' +
    '<p style="font-size:12px;color:#aaa;margin-top:16px;">Voce recebe este email porque sua conta Vaultly esta se aproximando do limite mensal de entregas.</p>' +
    '</div></div>';

  var response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vaultly <' + fAddr + '>', to: [userEmail], subject: subject, html: html })
  });

  var result = await response.json();
  if (!response.ok) throw new Error('Resend erro: ' + JSON.stringify(result));
  logger.info('Aviso de limite (' + pct + '%) enviado para ' + userEmail);
  return result;
}

async function testSmtpConnection() {
  const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  if (!apiKey) throw new Error('RESEND_API_KEY nao configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vaultly <onboarding@resend.dev>', to: [process.env.SMTP_USER||'test@test.com'], subject: 'Teste Vaultly', html: '<p>Funcionando!</p>' })
  });
  if (!response.ok) { const e = await response.json(); throw new Error(JSON.stringify(e)); }
  return true;
}

module.exports = { sendProductEmail, sendLimitWarningEmail, testSmtpConnection };
