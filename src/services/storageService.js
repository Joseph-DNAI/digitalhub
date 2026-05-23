// src/services/storageService.js
// Upload e download de arquivos no Cloudflare R2

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs   = require('fs');
const path = require('path');
const logger = require('../config/logger');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY
  }
});

const BUCKET = process.env.R2_BUCKET || 'digitalhub-files';

// ─── Upload de arquivo para o R2 ─────────────────────────────────────────────

async function uploadFile(localPath, fileName) {
  const fileBuffer = fs.readFileSync(localPath);
  const key = `products/${Date.now()}_${fileName.replace(/[^a-z0-9._-]/gi, '_')}`;

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        fileBuffer,
    ContentType: 'application/pdf'
  }));

  logger.info(`✅ Arquivo enviado para R2: ${key}`);

  // Remove o arquivo local após upload
  fs.unlinkSync(localPath);

  return key; // retorna a chave para salvar no banco
}

// ─── Download de arquivo do R2 para buffer ────────────────────────────────────

async function downloadFileBuffer(key) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key:    key
  }));

  // Converte stream para buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// ─── Deleta arquivo do R2 ─────────────────────────────────────────────────────

async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  logger.info(`🗑️ Arquivo removido do R2: ${key}`);
}

module.exports = { uploadFile, downloadFileBuffer, deleteFile };
