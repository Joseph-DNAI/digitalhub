# Vaultly — Plataforma de Entrega Automática de Produtos Digitais

Integração com Kiwify e Yampi via Webhook: recebe notificação de compra → envia PDF/Ebook por email automaticamente.

---

## 🏗️ Arquitetura

```
Kiwify / Yampi (venda aprovada)
    │
    ▼  POST /api/webhook/:tenantId/kiwify
┌─────────────┐
│   Vaultly   │──► Valida assinatura HMAC
│   (Node.js) │──► Busca produto pelo ID da plataforma
│             │──► Envia PDF por email (Resend)
│             │──► Registra entrega no banco
└─────────────┘
    │
    ▼
PostgreSQL (produtos, entregas, logs, tenants)
```

---

## 🚀 Instalação e execução

### 1. Clone e instale as dependências

```bash
git clone <seu-repo>
cd vaultly
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
nano .env   # preencha todas as variáveis
```

**Variáveis obrigatórias:**

| Variável | Descrição |
|---|---|
| `BASE_URL` | URL pública do servidor (ex: `https://seudominio.com`) |
| `ADMIN_EMAIL` | Email do administrador padrão |
| `ADMIN_PASSWORD` | Senha do administrador padrão |
| `DATABASE_URL` | String de conexão PostgreSQL |
| `RESEND_API_KEY` | Chave da API do Resend para envio de emails |

### 3. Inicie o servidor

```bash
# Produção
npm start

# Desenvolvimento (com reload automático)
npm run dev
```

---

## 📧 Configurando o Email (Resend)

1. Acesse [resend.com](https://resend.com) e crie uma conta gratuita
2. Gere uma API Key
3. Cole no `.env` em `RESEND_API_KEY`
4. Para produção, configure um domínio verificado no Resend

---

## 🔗 Configurando o Webhook

### Kiwify
1. No painel Kiwify: **Configurações → Integrações → Webhooks**
2. Cole a URL: `https://seudominio.com/api/webhook/SEU_TENANT_ID/kiwify`
3. Selecione o evento: **Compra aprovada** (`order_approved`)

### Yampi
1. No painel Yampi: **Configurações → Webhooks**
2. Cole a URL: `https://seudominio.com/api/webhook/SEU_TENANT_ID/yampi`
3. Selecione o evento: **order.paid**

> O `SEU_TENANT_ID` aparece na aba **Webhook** do painel Vaultly.

---

## 📦 API de Produtos

```bash
# Criar produto
curl -X POST https://seudominio.com/api/products \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "name=Meu Ebook" \
  -F "kiwify_id=prod_abc123" \
  -F "file=@/caminho/para/ebook.pdf"

# Listar produtos
curl https://seudominio.com/api/products \
  -H "Authorization: Bearer SEU_TOKEN"

# Atualizar produto
curl -X PUT https://seudominio.com/api/products/<ID> \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "name=Novo nome"

# Deletar produto
curl -X DELETE https://seudominio.com/api/products/<ID> \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 📊 API de Entregas

```bash
# Listar entregas
curl https://seudominio.com/api/deliveries -H "Authorization: Bearer SEU_TOKEN"

# Estatísticas
curl https://seudominio.com/api/deliveries/stats -H "Authorization: Bearer SEU_TOKEN"

# Logs do webhook
curl https://seudominio.com/api/deliveries/logs -H "Authorization: Bearer SEU_TOKEN"

# Forçar retry de falhas
curl -X POST https://seudominio.com/api/deliveries/retry -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🖥️ Deploy em produção

### Opção 1 — Railway (recomendado)

1. Faça push do projeto para o GitHub
2. Conecte ao Railway
3. Configure as variáveis de ambiente no painel
4. Deploy automático via git push

### Opção 2 — VPS com PM2

```bash
npm install -g pm2
pm2 start src/server.js --name vaultly
pm2 save
pm2 startup
```

### Opção 3 — Docker

```bash
docker build -t vaultly .
docker run -d -p 3000:3000 --env-file .env vaultly
```

---

## 🔒 Segurança

- Assinatura HMAC-SHA256 verificada em cada requisição
- Rate limiting para proteção contra brute force
- Headers de segurança via Helmet
- Arquivos de upload no Cloudflare R2 (fora da pasta pública)
- Isolamento multi-tenant completo

---

## 🔄 Retry automático

Entregas com falha são reprocessadas automaticamente a cada **60 segundos** (configurável via `RETRY_DELAY_SECONDS`), com no máximo **3 tentativas**.

---

## 📁 Estrutura do projeto

```
vaultly/
├── src/
│   ├── server.js
│   ├── config/
│   │   └── logger.js
│   ├── models/
│   │   ├── database.js
│   │   └── bcrypt.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── webhookAuth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── webhook.js
│   │   ├── products.js
│   │   ├── deliveries.js
│   │   ├── tenants.js
│   │   └── admin.js
│   └── services/
│       ├── deliveryService.js
│       ├── emailService.js
│       ├── storageService.js
│       ├── platformAdapter.js
│       └── platformApiService.js
├── public/
│   ├── index.html      # Painel do usuário
│   ├── admin.html      # Painel administrador
│   └── landing.html    # Página de conversão
├── .env.example
├── package.json
└── README.md
```
