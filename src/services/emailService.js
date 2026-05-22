// src/services/emailService.js
// Serviço de envio de email com PDF em anexo via Nodemailer

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

// ─── Criação do transporter ───────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// ─── Substitui variáveis no template ─────────────────────────────────────────

function renderTemplate(template, vars) {
  const defaultTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1D9E75; padding: 30px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">🎉 Seu produto chegou!</h1>
      </div>
      <div style="background: #f9f9f9; padding: 28px 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e5e5;">
        <p style="font-size: 16px;">Olá, <strong>{{nome}}</strong>!</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Sua compra de <strong>{{produto}}</strong> foi confirmada com sucesso.<br>
          O arquivo está disponível em anexo neste email.
        </p>
        <div style="background: #E1F5EE; border-left: 4px solid #1D9E75; padding: 14px 18px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #085041;">
            📎 <strong>{{arquivo}}</strong> está em anexo. Salve em um local seguro!
          </p>
        </div>
        <p style="font-size: 13px; color: #888; margin-top: 24px;">
          Pedido: <code>{{pedido}}</code><br>
          Em caso de dúvidas, responda este email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
        <p style="font-size: 12px; color: #aaa; margin: 0;">
          Obrigado pela sua compra! — ${process.env.EMAIL_FROM_NAME || 'Loja Digital'}
        </p>
      </div>
    </div>
  `;

  const html = template || defaultTemplate;

  return html
    .replace(/{{nome}}/g, vars.nome || 'Cliente')
    .replace(/{{produto}}/g, vars.produto || 'Produto')
    .replace(/{{arquivo}}/g, vars.arquivo || 'arquivo.pdf')
    .replace(/{{email}}/g, vars.email || '')
    .replace(/{{pedido}}/g, vars.pedido || '');
}

// ─── Envio do email com PDF em anexo ─────────────────────────────────────────

async function sendProductEmail({ buyerEmail, buyerName, productName, filePath, fileName, emailTemplate, orderId }) {
  const transporter = createTransporter();

  // Verifica se o arquivo existe
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const htmlBody = renderTemplate(emailTemplate, {
    nome: buyerName || buyerEmail,
    produto: productName,
    arquivo: fileName,
    email: buyerEmail,
    pedido: orderId
  });

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Loja Digital'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
    to: buyerEmail,
    subject: `✅ Seu produto "${productName}" está aqui!`,
    html: htmlBody,
    attachments: [
      {
        filename: fileName,
        path: filePath,
        contentType: 'application/pdf'
      }
    ]
  };

  logger.info(`Enviando email para ${buyerEmail} — produto: ${productName}`);

  const info = await transporter.sendMail(mailOptions);

  logger.info(`Email enviado com sucesso! MessageId: ${info.messageId}`);
  return info;
}

// ─── Teste de conexão SMTP ────────────────────────────────────────────────────

async function testSmtpConnection() {
  const transporter = createTransporter();
  await transporter.verify();
  return true;
}

module.exports = { sendProductEmail, testSmtpConnection };
