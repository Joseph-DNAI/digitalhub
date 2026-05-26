# 🚀 Guia Completo para Iniciantes — Vaultly

> **Para quem nunca programou ou instalou nada.** Cada passo explica o que você está fazendo e por quê.

---

## 📖 Entendendo o que você vai instalar

Antes de instalar qualquer coisa, veja o mapa do que vai acontecer:

```
Seu computador (onde você desenvolve)
│
├── Node.js       → O "motor" que faz o JavaScript rodar fora do navegador
├── npm           → Gerenciador de pacotes (vem junto com o Node.js)
│                   Funciona como uma "loja de peças" para o seu projeto
├── VS Code       → Editor de código (como um Word, mas para programação)
├── Insomnia      → Ferramenta para testar sua API sem precisar de um site
└── ngrok         → Cria um "túnel" da internet até o seu computador local
                    (para o Kiwify/Yampi conseguir chamar seu servidor em testes)
```

---

## 🗂️ PARTE 1 — Instalando os programas necessários

### 1.1 — Instalar o Node.js

**O que é:** O Node.js é o programa que vai executar o seu servidor. Sem ele, o código não roda.

**Windows:**
1. Acesse: https://nodejs.org
2. Clique no botão verde **"LTS"** (versão estável recomendada)
3. Baixe e execute o instalador `.msi`
4. Clique em "Next" em tudo, deixe as opções padrão
5. Ao final, clique em "Finish"

**Mac:**
1. Acesse: https://nodejs.org
2. Clique no botão verde **"LTS"**
3. Baixe e execute o instalador `.pkg`
4. Siga as instruções na tela

**✅ Como verificar se funcionou:**
Abra o Terminal (Mac) ou Prompt de Comando (Windows) e digite:
```
node --version
```
Deve aparecer algo como: `v20.11.0`

---

### 1.2 — Instalar o VS Code (editor de código)

**O que é:** Um editor de texto inteligente, feito para programação. Vai colorir o código, mostrar erros e facilitar sua vida.

1. Acesse: https://code.visualstudio.com
2. Clique em **"Download"**
3. Instale normalmente como qualquer programa

---

### 1.3 — Instalar o Insomnia

**O que é:** Uma ferramenta visual para "conversar" com sua API. Você vai usá-la para testar se o servidor está funcionando antes de conectar ao Kiwify/Yampi. Funciona como um "simulador de compra".

1. Acesse: https://insomnia.rest/download
2. Baixe a versão gratuita (**Insomnia**)
3. Instale normalmente

---

### 1.4 — Instalar o ngrok

**O que é:** O Kiwify e a Yampi precisam de um endereço de internet para enviar o webhook. Mas durante os testes, seu servidor está só no seu computador (sem endereço público). O ngrok cria uma "ponte" temporária entre a internet e o seu computador.

**Analogia:** É como se o ngrok fosse um entregador que recebe o pacote (webhook) na rua e traz até a porta da sua casa (seu computador).

1. Acesse: https://ngrok.com
2. Crie uma conta gratuita (necessário para usar)
3. Faça download do ngrok para seu sistema
4. Siga as instruções de instalação da página deles

---

## 🗂️ PARTE 2 — Configurando o projeto

### 2.1 — Extraia o projeto

1. Baixe o arquivo `vaultly.zip` (você já tem ele)
2. Extraia em uma pasta de fácil acesso, por exemplo:
   - Windows: `C:\projetos\vaultly`
   - Mac: `/Users/seunome/projetos/vaultly`

### 2.2 — Abrir o projeto no VS Code

1. Abra o VS Code
2. Vá em **File → Open Folder** (Arquivo → Abrir Pasta)
3. Selecione a pasta onde você extraiu o projeto
4. O VS Code vai mostrar todos os arquivos na barra lateral esquerda

### 2.3 — Abrir o Terminal dentro do VS Code

No VS Code, vá em **Terminal → New Terminal** (ou aperte `` Ctrl+` ``).

Um terminal vai aparecer na parte de baixo da tela. **Todos os comandos a seguir serão digitados aqui.**

### 2.4 — Instalar as dependências do projeto

**O que vai acontecer:** O npm vai ler o arquivo `package.json` (que lista todas as "peças" necessárias) e vai baixar tudo automaticamente da internet para a pasta `node_modules`.

```bash
npm install
```

Aguarde. Vai baixar alguns arquivos (pode levar 1-2 minutos). Ao final, vai aparecer algo como `added 150 packages`.

### 2.5 — Criar e configurar o arquivo .env

**O que é o .env:** É um arquivo de configurações secretas (senhas, tokens). Ele nunca vai para o GitHub ou para outras pessoas — fica só na sua máquina.

No terminal, digite:

**Windows:**
```bash
copy .env.example .env
```

**Mac/Linux:**
```bash
cp .env.example .env
```

Agora abra o arquivo `.env` no VS Code (clique nele na barra lateral) e preencha:

```env
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000

ADMIN_EMAIL=seu@email.com
ADMIN_PASSWORD=sua_senha_admin

KIWIFY_WEBHOOK_SECRET=vai_preencher_depois
YAMPI_WEBHOOK_SECRET=vai_preencher_depois

UPLOADS_PATH=./uploads
MAX_FILE_SIZE_MB=50

RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM_NAME=Minha Loja
EMAIL_FROM_ADDRESS=seu@email.com
```

**⚠️ RESEND_API_KEY — como gerar:**
1. Acesse: https://resend.com e crie uma conta gratuita
2. Vá em **API Keys → Create API Key**
3. Cole a chave gerada no `.env` em `RESEND_API_KEY`

---

## 🗂️ PARTE 3 — Rodando o servidor pela primeira vez

### 3.1 — Iniciar o servidor

No terminal do VS Code, digite:

```bash
npm run dev
```

**O que vai acontecer:** O servidor vai iniciar. Você vai ver mensagens como:
```
Vaultly rodando na porta 3000
Painel: http://localhost:3000
```

**O servidor ficará rodando enquanto o terminal estiver aberto.** Não feche o terminal.

### 3.2 — Verificar se está funcionando

Abra seu navegador e acesse:
```
http://localhost:3000/health
```

Deve aparecer um texto JSON como:
```json
{ "status": "ok", "version": "2.0.0" }
```

✅ **Se aparecer isso, o servidor está funcionando!**

---

## 🗂️ PARTE 4 — Testando com o Insomnia

### 4.1 — Fazer login

1. Abra o Insomnia
2. Crie uma nova requisição:
   - **Method:** `POST`
   - **URL:** `http://localhost:3000/api/auth/login`
   - **Body:** JSON
3. Cole:
```json
{
  "email": "seu@email.com",
  "password": "sua_senha_admin"
}
```
4. Copie o `token` da resposta — você vai usar nas próximas requisições.

### 4.2 — Cadastrar seu primeiro produto

1. Crie uma nova requisição:
   - **Method:** `POST`
   - **URL:** `http://localhost:3000/api/products`
   - **Header:** `Authorization: Bearer SEU_TOKEN`
   - **Body:** Multipart Form
2. Adicione os campos:
   | Campo | Valor de exemplo |
   |-------|-----------------|
   | name | Meu Ebook de Marketing |
   | description | Ebook completo com 120 páginas |
   | price | 97.00 |
   | kiwify_id | prod_abc123 |
   | yampi_id | 456 |
3. Em "file", selecione um PDF do seu computador
4. Clique em **"Send"**

### 4.3 — Simular um webhook do Kiwify

1. Crie uma nova requisição:
   - **Method:** `POST`
   - **URL:** `http://localhost:3000/api/webhook/SEU_TENANT_ID/kiwify`
   - **Body:** JSON
2. Cole este payload:

```json
{
  "webhook_event_type": "order_approved",
  "order_id": "pedido_teste_001",
  "Product": {
    "product_id": "prod_abc123"
  },
  "Customer": {
    "full_name": "João Silva",
    "email": "seu_email_real@gmail.com"
  }
}
```

3. Clique em **"Send"**

**O que vai acontecer em background:** O servidor vai processar e enviar o PDF para `seu_email_real@gmail.com`.

✅ **Verifique sua caixa de email — o PDF deve chegar em segundos!**

---

## 🗂️ PARTE 5 — Conectando ao Kiwify/Yampi (com ngrok)

**Por que o ngrok:** O Kiwify e a Yampi precisam de uma URL pública para enviar o webhook. Seu `localhost:3000` só existe no seu computador. O ngrok cria um endereço público temporário que redireciona para o seu computador.

### 5.1 — Iniciar o ngrok

Abra um **segundo terminal** (no VS Code: clique no `+` no canto do terminal) e digite:

```bash
ngrok http 3000
```

Vai aparecer algo como:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copie a URL `https://abc123.ngrok-free.app`** — este é seu endereço público temporário.

### 5.2 — Configurar no Kiwify

1. Entre no painel do Kiwify
2. Vá em **Configurações → Integrações → Webhooks**
3. Clique em **"Adicionar Webhook"**
4. Cole a URL: `https://abc123.ngrok-free.app/api/webhook/SEU_TENANT_ID/kiwify`
5. Evento: **Compra aprovada**
6. Copie o **Token secreto** gerado pelo Kiwify
7. Cole esse token no painel Vaultly → **Configurações → Webhook Secret Kiwify**
8. Clique em **"Testar"** no Kiwify

### 5.3 — Configurar na Yampi

1. Entre no painel da Yampi
2. Vá em **Configurações → Webhooks**
3. Clique em **"+ Novo webhook"**
4. Cole a URL: `https://abc123.ngrok-free.app/api/webhook/SEU_TENANT_ID/yampi`
5. Selecione o evento: **order.paid** (Pedido pago)
6. Copie a **Chave secreta** gerada pela Yampi
7. Cole no painel Vaultly → **Configurações → Webhook Secret Yampi**

---

## 🗂️ PARTE 6 — Verificando as entregas

Acesse o painel em `http://localhost:3000` e faça login. Lá você encontra:

- **Dashboard** — estatísticas de entregas
- **Produtos** — cadastro e gerenciamento
- **Entregas** — histórico completo
- **Webhook** — URLs e logs de eventos
- **Configurações** — email, secrets, integrações

---

## 🗂️ PARTE 7 — Colocando em produção (quando estiver pronto)

O ngrok é só para testes — ele para quando você fecha o terminal. Para produção, você precisa de um servidor real na internet.

### Opção mais simples: Railway (gratuito para começar)

1. Acesse: https://railway.app
2. Crie uma conta com o GitHub
3. Clique em **"New Project → Deploy from GitHub repo"**
4. Conecte seu repositório
5. Vá em **"Variables"** e adicione todas as variáveis do seu `.env`
6. O Railway vai gerar uma URL pública automática
7. Use essa URL nos webhooks do Kiwify e Yampi (sem ngrok)

### Alternativas gratuitas similares:
- **Render.com** — https://render.com
- **Fly.io** — https://fly.io

---

## ❓ Problemas comuns

| Problema | Solução |
|---|---|
| `command not found: node` | Node.js não foi instalado corretamente. Reinstale. |
| `EADDRINUSE: port 3000` | Já tem algo rodando na porta 3000. Mude `PORT=3001` no `.env` |
| Email não chega | Verifique a `RESEND_API_KEY` no `.env` |
| Webhook retorna 401 | O secret no painel Vaultly é diferente do cadastrado no Kiwify/Yampi |
| Produto não encontrado | Verifique se o `kiwify_id`/`yampi_id` bate com o ID da plataforma |
| ngrok para de funcionar | O plano gratuito expira após 2h. Reinicie com `ngrok http 3000` |

---

## 📋 Resumo rápido dos comandos

```bash
npm install          # Instalar dependências (só na primeira vez)
npm run dev          # Iniciar servidor em modo desenvolvimento
npm start            # Iniciar servidor em produção
ngrok http 3000      # Expor servidor para a internet (só para testes)
```

---

> 💡 **Dica final:** Deixe o terminal com `npm run dev` aberto em uma janela, e o ngrok em outra. Assim você vê os logs em tempo real enquanto faz testes no Kiwify/Yampi.
