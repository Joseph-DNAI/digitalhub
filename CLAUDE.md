# CLAUDE.md — Contexto do Projeto Vaultly / DigitalHub

> Lido automaticamente pelo Claude Code CLI e pelo Cowork. Mantenha atualizado.

---

## O que é este projeto

**Vaultly** (anteriormente DigitalHub) é uma plataforma SaaS de entrega automática de produtos digitais (PDFs, ebooks, arquivos).

Fluxo principal:
1. Cliente compra produto na **Kiwify** ou **Yampi**
2. Plataforma envia webhook para `POST /api/webhook/:tenantId/kiwify` ou `/yampi`
3. Sistema valida assinatura HMAC, busca o produto no banco e envia o arquivo por email
4. Entrega é registrada com status e retry automático (até 3 tentativas)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4.18 |
| Banco | PostgreSQL (Railway) |
| Storage | AWS S3 / Cloudflare R2 |
| Email | Nodemailer (SMTP) |
| Auth | Sessions (token em DB) + JWT |
| Deploy | Railway (`railway up` / git push) |
| Frontend | HTML/JS estático em `/public` |

---

## Estrutura

```
src/
  server.js              — entry point, retry de conexão com banco
  config/logger.js       — Winston
  models/database.js     — Pool PostgreSQL, helpers, multi-tenant
  models/bcrypt.js       — hash de senha
  middleware/auth.js     — requireAuth, requireAdmin, requirePlanLimit
  middleware/webhookAuth.js — validação HMAC-SHA256
  routes/
    auth.js              — login, register, logout, /me
    products.js          — CRUD produtos + upload de arquivo
    deliveries.js        — histórico, stats, logs, retry, test-smtp
    webhook.js           — recebe eventos Kiwify/Yampi
    admin.js             — painel admin
    tenants.js           — configurações por tenant (SMTP, secrets)
  services/
    deliveryService.js   — orquestra entrega + job de retry
    emailService.js      — envio SMTP com Nodemailer
    platformAdapter.js   — normaliza payload Kiwify/Yampi
    storageService.js    — upload/download S3/R2
public/
  index.html             — painel do usuário (dashboard, produtos, entregas, webhook, config)
  admin.html             — painel administrador
```

---

## Estado atual (atualizado em 2026-05-25)

### Resolvido recentemente
- ✅ **Crash loop no Railway**: `ENOTFOUND postgres.railway.internal` → adicionado retry com backoff em `server.js` (`startWithRetry`)
- ✅ **Painel sem interação**: todas as funções JS do `public/index.html` estavam faltando → implementadas: `switchTab`, `loadDashboard`, `loadProducts`, `loadDeliveries`, `loadLogs`, `openModal`, `closeModal`, `editProduct`, `deleteProduct`, `saveProduct`, `handleFileSelect`, `copyText`, `testEmail`
- ✅ **SyntaxError no server.js**: template literals aninhados com emojis corromperam o arquivo → reescrito sem emojis
- ✅ **Fluxo completo testado e funcionando**: webhook Kiwify → produto encontrado → arquivo baixado do R2 → email entregue via Resend
- ✅ **Variáveis de ambiente Railway**: todas configuradas (RESEND_API_KEY, R2, DATABASE_URL, etc.)

### Pendente / próximos passos
- [ ] Verificar se `admin.html` precisa das funções JS (mesmo problema que o index.html tinha)
- [ ] Configurar domínio verificado no Resend (atualmente usa `onboarding@resend.dev` — para produção real precisa de domínio próprio)
- [ ] Configurar webhook real na Kiwify apontando para `https://digitalhub-production.up.railway.app/api/webhook/e962997b-ce3c-4521-a0cd-a42abcd74efa/kiwify`
- [ ] Apagar `test-webhook.ps1` da pasta do projeto (contém credenciais)

---

## Variáveis de ambiente necessárias (.env)

```
DATABASE_URL=          # PostgreSQL — Railway injeta automaticamente
BASE_URL=              # Ex: https://digitalhub-production.up.railway.app
ADMIN_EMAIL=           # Email do admin padrão
ADMIN_PASSWORD=        # Senha do admin padrão
SMTP_HOST=             # Ex: smtp.gmail.com
SMTP_PORT=587
SMTP_USER=             # Email remetente
SMTP_PASS=             # Senha de app Gmail
MAX_FILE_SIZE_MB=50
NODE_ENV=production
```

---

## Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Cadastro |
| GET | `/api/auth/me` | Usuário logado |
| GET | `/api/products` | Lista produtos do tenant |
| POST | `/api/products` | Cria produto (multipart/form-data) |
| PUT | `/api/products/:id` | Edita produto |
| DELETE | `/api/products/:id` | Remove produto |
| GET | `/api/deliveries` | Histórico de entregas |
| GET | `/api/deliveries/stats` | Estatísticas |
| GET | `/api/deliveries/logs` | Logs de webhook |
| POST | `/api/deliveries/retry` | Reprocessa falhas |
| POST | `/api/deliveries/test-smtp` | Testa conexão SMTP |
| GET | `/api/tenants/me` | Config do tenant |
| PUT | `/api/tenants/me` | Atualiza config (SMTP, secrets) |
| POST | `/api/webhook/:tenantId/kiwify` | Webhook Kiwify |
| POST | `/api/webhook/:tenantId/yampi` | Webhook Yampi |
| GET | `/health` | Health check |

---

## Deploy

```bash
# Railway — push automático via GitHub
git add . && git commit -m "mensagem" && git push

# Logs em tempo real
railway logs
```

---

## Observações para o Claude Code

- **Não use template literals aninhados** com emojis em arquivos `.js` — causa corrupção no encoding do servidor
- O banco é **multi-tenant**: toda query deve filtrar por `tenant_id` (vem de `req.tenantId` após auth)
- O `pool` do PostgreSQL está em `src/models/database.js` — não criar instâncias novas
- Uploads de arquivo usam `multer` → depois `storageService.uploadFile()` para S3/R2
- Auth por token de sessão (header `Authorization: Bearer <token>` ou cookie `vaultly_token`)
