# DigitalHub — Plataforma de Entrega Automática de Produtos Digitais

Integração com Kiwify via Webhook: recebe notificação de compra → envia PDF/Ebook por email automaticamente.

---

## 🏗️ Arquitetura

```
Kiwify (venda aprovada)
    │
    ▼  POST /api/webhook/kiwify
┌─────────────┐
│  DigitalHub │──► Valida assinatura HMAC
│   (Node.js) │──► Busca produto pelo ID Kiwify
│             │──► Envia PDF por email (SMTP)
│             │──► Registra entrega no banco
└─────────────┘
    │
    ▼
SQLite (produtos, entregas, logs)
```

---

## 🚀 Instalação e execução

### 1. Clone e instale as dependências

```bash
git clone <seu-repo>
cd digitalhub
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
| `WEBHOOK_SECRET` | Token secreto para validar requisições do Kiwify |
| `SMTP_HOST` | Servidor de email (ex: `smtp.gmail.com`) |
| `SMTP_USER` | Seu email |
| `SMTP_PASS` | Senha de app do Gmail (ver abaixo) |

### 3. Inicie o servidor

```bash
# Produção
npm start

# Desenvolvimento (com reload automático)
npm run dev
```

---

## 📧 Configurando o Gmail (App Password)

1. Acesse [myaccount.google.com/security](https://myaccount.google.com/security)
2. Ative a **Verificação em duas etapas**
3. Em "Senhas de app", gere uma senha para "Email"
4. Cole essa senha no `.env` em `SMTP_PASS`

---

## 🔗 Configurando o Webhook no Kiwify

1. No painel Kiwify: **Configurações → Integrações → Webhooks**
2. Clique em **Adicionar Webhook**
3. Cole a URL: `https://seudominio.com/api/webhook/kiwify`
4. Selecione o evento: **Compra aprovada** (`order_approved`)
5. Em "Token secreto", coloque o mesmo valor do seu `WEBHOOK_SECRET`
6. Salve e clique em **Testar**

---

## 📦 API de Produtos

### Criar produto

```bash
curl -X POST https://seudominio.com/api/products \
  -F "name=Meu Ebook" \
  -F "description=Descrição do produto" \
  -F "price=97.00" \
  -F "kiwify_id=prod_abc123" \
  -F "file=@/caminho/para/ebook.pdf"
```

### Listar produtos

```bash
curl https://seudominio.com/api/products
```

### Atualizar produto

```bash
curl -X PUT https://seudominio.com/api/products/<ID> \
  -F "name=Novo nome" \
  -F "file=@/novo/arquivo.pdf"
```

### Deletar produto

```bash
curl -X DELETE https://seudominio.com/api/products/<ID>
```

---

## 📊 API de Entregas

```bash
# Listar entregas
curl https://seudominio.com/api/deliveries

# Estatísticas
curl https://seudominio.com/api/deliveries/stats

# Logs do webhook
curl https://seudominio.com/api/deliveries/logs

# Testar SMTP
curl -X POST https://seudominio.com/api/deliveries/test-smtp

# Forçar retry de falhas
curl -X POST https://seudominio.com/api/deliveries/retry
```

---

## 🖥️ Deploy em produção

### Opção 1 — VPS com PM2

```bash
npm install -g pm2
pm2 start src/server.js --name digitalhub
pm2 save
pm2 startup
```

### Opção 2 — Railway / Render / Fly.io

1. Faça push do projeto para o GitHub
2. Conecte ao Railway/Render
3. Configure as variáveis de ambiente no painel
4. Deploy automático

### Opção 3 — Docker

```bash
docker build -t digitalhub .
docker run -d -p 3000:3000 --env-file .env digitalhub
```

### Nginx (proxy reverso)

```nginx
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🔒 Segurança

- Assinatura HMAC-SHA256 verificada em cada requisição do Kiwify
- Rate limiting para proteção contra abuso
- Headers de segurança via Helmet
- Arquivos de upload fora da pasta pública
- Logs completos de todas as operações

---

## 🔄 Retry automático

Entregas com falha são reprocessadas automaticamente a cada **60 segundos** (configurável via `RETRY_DELAY_SECONDS`), com no máximo **3 tentativas** (configurável via `RETRY_ATTEMPTS`).

---

## 📁 Estrutura do projeto

```
digitalhub/
├── src/
│   ├── server.js              # Servidor Express principal
│   ├── config/
│   │   └── logger.js          # Winston logger
│   ├── models/
│   │   └── database.js        # SQLite + helpers
│   ├── middleware/
│   │   └── webhookAuth.js     # Verificação de assinatura Kiwify
│   ├── routes/
│   │   ├── webhook.js         # POST /api/webhook/kiwify
│   │   ├── products.js        # CRUD de produtos
│   │   └── deliveries.js      # Histórico e stats
│   └── services/
│       ├── emailService.js    # Nodemailer + template HTML
│       └── deliveryService.js # Orquestração + retry
├── uploads/                   # PDFs armazenados (fora do git)
├── logs/                      # Logs do servidor
├── data/                      # Banco SQLite
├── .env.example
├── package.json
└── README.md
```
"# digitalhub" 
