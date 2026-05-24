// src/services/emailService.js — aceita config por tenant
const { downloadFileBuffer } = require('./storageService');
const logger = require('../config/logger');

function renderTemplate(template, vars) {
  const defaultTemplate = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:linear-gradient(135deg,#6C63FF,#38BDF8);padding:30px 24px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">🎉 Seu produto chegou!</h1>
      </div>
      <div style="background:#f9f9f9;padding:28px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">
        <p style="font-size:16px;">Olá, <strong>{{nome}}</strong>!</p>
        <p style="font-size:15px;line-height:1.6;">
          Sua compra de <strong>{{produto}}</strong> foi confirmada.<br>
          O arquivo está disponível em anexo neste email.
        </p>
        <div style="background:#EEF2FF;border-left:4px solid #6C63FF;padding:14px 18px;border-radius:4px;margin:20px 0;">
          <p style="margin:0;font-size:14px;color:#4338CA;">📎 <strong>{{arquivo}}</strong> está em anexo.</p>
        </div>
        <p style="font-size:13px;color:#888;margin-top:24px;">Pedido: <code>{{pedido}}</code></p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;" />
        <p style="font-size:12px;color:#aaa;margin:0;">Powered by Vaultly</p>
      </div>
    </div>
  `;
  return (template || defaultTemplate)
    .replace(/{{nome}}/g,    vars.nome    || 'Cliente')
    .replace(/{{produto}}/g, vars.produto || 'Produto')
    .replace(/{{arquivo}}/g, vars.arquivo || 'arquivo.pdf')
    .replace(/{{email}}/g,   vars.email   || '')
    .replace(/{{pedido}}/g,  vars.pedido  || '');
}

async function sendProductEmail({ buyerEmail, buyerName, productName, filePath, fileName, emailTemplate, orderId, resendApiKey, fromName, fromAddress }) {
  const apiKey = resendApiKey || process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  const fName  = fromName    || process.env.EMAIL_FROM_NAME    || 'Vaultly';
  const fAddr  = fromAddress || process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

  if (!apiKey)    throw new Error('RESEND_API_KEY não configurada');
  if (!filePath)  throw new Error('Arquivo não configurado para este produto');

  const htmlBody   = renderTemplate(emailTemplate, { nome: buyerName||buyerEmail, produto: productName, arquivo: fileName, email: buyerEmail, pedido: orderId });
  const fileBuffer = await downloadFileBuffer(filePath);
  const fileBase64 = fileBuffer.toString('base64');

  logger.info(`Enviando email via Resend para ${buyerEmail} — ${productName}`);

  const response = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:        `${fName} <${fAddr}>`,
      to:          [buyerEmail],
      subject:     `✅ Seu produto "${productName}" está aqui!`,
      html:        htmlBody,
      attachments: [{ filename: fileName, content: fileBase64 }]
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(`Resend erro: ${JSON.stringify(result)}`);
  logger.info(`✅ Email enviado! ID: ${result.id}`);
  return result;
}

async function testSmtpConnection() {
  const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  if (!apiKey) throw new Error('RESEND_API_KEY não configurada');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Vaultly <onboarding@resend.dev>`, to: [process.env.SMTP_USER||'test@test.com'], subject: 'Teste Vaultly', html: '<p>Funcionando!</p>' })
  });
  if (!response.ok) { const e = await response.json(); throw new Error(JSON.stringify(e)); }
  return true;
}

module.exports = { sendProductEmail, testSmtpConnection };
