# Spec — Venda Direta + Retenção na Vaultly

> Data: 2026-05-30
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Tópico: checkout próprio com split de pagamento (Asaas) + funil de retenção (gotejamento)

---

## 1. Objetivo

Permitir que o usuário da Vaultly **venda os produtos cadastrados diretamente na plataforma**, recebendo o valor já descontadas as taxas, com uma taxa da Vaultly por venda. Hoje a Vaultly só faz **automação de entrega** (recebe webhook da Kiwify/Yampi e envia o arquivo por email). Este projeto adiciona um segundo modo: **venda direta** (checkout próprio + pagamento + split + entrega), além de um módulo de **retenção** (gotejamento de conteúdo D+1..D+7) que serve aos dois modos.

### Resultados esperados
- Vendedor cria um produto vendável, gera um link de checkout (`/c/:slug`) e vende sem depender de Kiwify/Yampi.
- O dinheiro é dividido **na fonte** pelo gateway: vendedor recebe o líquido, Vaultly recebe sua taxa. A Vaultly **nunca custodia** o dinheiro (fica fora da regulação do Bacen).
- O pagamento confirmado dispara o **núcleo de entrega que já existe** (mesmo fluxo do webhook Kiwify).
- Vendedores (de ambos os modos) podem montar uma sequência de retenção para reduzir reembolsos.

---

## 2. Restrição regulatória (decisão fundante)

A Vaultly **não pode** receber o dinheiro do comprador e repassar ao vendedor por conta própria — isso a tornaria uma instituição de pagamento regulada pelo Bacen. A solução é **split de pagamento via subadquirente licenciado (Asaas)**: o gateway recebe, divide automaticamente e deposita direto em cada parte. A Vaultly nunca toca no dinheiro de terceiros.

---

## 3. Modelo de modo duplo

A Vaultly passa a ter dois modos de uso, escolhidos por **intenção no registro** mas **não travados** (o usuário liga venda direta quando quiser; o onboarding bancário só aparece nesse momento).

| | 🔁 Modo Automação | 💰 Modo Venda Direta |
|---|---|---|
| Pra quem | Já vende na Kiwify/Yampi | Quer vender pela própria Vaultly |
| O que faz | Webhook + entrega por email (produto atual) | Checkout + split + entrega |
| Asaas / banco | Não precisa | Precisa (onboarding leve, sob demanda) |
| Atrito de entrada | Zero | Só quando decide vender direto |
| Monetização Vaultly | Assinatura (Stripe) | Taxa por venda (split via Asaas) |

Os dois modos desembocam no **mesmo núcleo de entrega atual**. A venda direta adiciona uma "porta de entrada" (checkout + pagamento) antes da entrega. A retenção é uma "saída" agendada compartilhada pelos dois modos.

### Decisão: Stripe e Asaas permanecem separados
- **Stripe** = Vaultly cobra o usuário (assinatura recorrente, receita própria/MRR). Mantido.
- **Asaas** = usuário cobra o comprador dele (marketplace, split). Novo.
- Razões: isolamento de risco (o MRR não pode depender do gateway do marketplace), o Stripe é superior em billing recorrente, e unificar agora seria escopo desnecessário (YAGNI). Revisitar só se dados mostrarem que falta Pix na assinatura.

---

## 4. Gateway: Asaas

Escolhido pelo **onboarding white-label** (vendedor cria a conta de recebimento sem sair da Vaultly, via API), split nativo, Pix + cartão, taxas baixas e KYC mais leve.

### Custo (sem custo fixo pra Vaultly; variável por transação, descontado da venda)
Taxas promocionais do Asaas válidas até **30/08/2026** (podem subir depois — por isso a taxa da Vaultly é configurável):
- **Pix:** R$0,99 fixo por pagamento recebido.
- **Cartão de crédito:** 1,99% + R$0,49 por pagamento recebido.

Abrir a conta é grátis; a taxa do Asaas é descontada **antes** do split, então a margem da Vaultly sai do que sobra (a confirmar na implementação se há custo por saque da subconta — geralmente centavos).

---

## 5. Precificação

### Margem da Vaultly (receita real, registrada separada para contabilidade)
**R$0,10 fixo + 1,49%** por venda.

### Taxa publicada ao vendedor (all-in = Vaultly + Asaas, para comparação justa com concorrência)
A Vaultly "assume" a taxa do gateway como parte da sua e apresenta **um número único** (a concorrência divulga taxa all-in; comparar maçã com maçã exige o mesmo):

| Meio | Taxa Vaultly (tudo incluído) |
|---|---|
| **Pix** | **1,49% + R$1,09** (= R$0,99 Asaas + R$0,10 Vaultly fixo; 1,49% margem) |
| **Cartão** | **3,48% + R$0,59** (= 1,99% Asaas + 1,49% Vaultly; R$0,49 + R$0,10 fixo) |

### Comparação all-in (honesta) vs Hotmart (~9,9% + R$1)
| Preço | Vaultly Pix | Vaultly Cartão | Hotmart (ref.) |
|---|---|---|---|
| R$10 | 12,4% | 9,4% | 19,9% |
| R$27 | 5,5% | 5,7% | 13,6% |
| R$50 | 3,7% | 4,7% | 11,9% |
| R$97 | 2,6% | 4,1% | 10,9% |

### Regras de precificação
- **Margem e repasse são guardados separados e configuráveis** no sistema. Se o Asaas mexer na taxa, ajusta-se o repasse sem reescrever lógica. A Vaultly "dona" a taxa publicada.
- **Preço mínimo de produto de venda direta: R$9** (abaixo disso o empilhamento de fixos fica desproporcional e queima a imagem de "barato").
- O painel pode exibir a **quebra da taxa** ("R$0,99 processamento + nossa taxa") como transparência e proteção de imagem.

---

## 6. Meios de pagamento e transparência

Pix + Cartão de crédito. O vendedor escolhe quais aceita, vendo a tabela de trade-off:

| | Pix | Cartão |
|---|---|---|
| Recebimento | Na hora (D+0) | D+1 a D+30 |
| Taxa | Menor | Maior |
| Chargeback/estorno | Não existe | Existe (comprador pode contestar após baixar o PDF) |
| Risco | Baixíssimo | Vendedor pode perder venda + produto |

O vendedor pode optar por **aceitar só Pix** se quiser zero risco. Dados de cartão **não passam pelo servidor da Vaultly** — usa-se a tokenização do Asaas (tira a Vaultly do escopo pesado de PCI).

---

## 7. Estorno / chargeback

**Estratégia: só registra e avisa** (não há como "desentregar" um PDF já enviado; entrega atual é por anexo). A venda é marcada como estornada, o vendedor é notificado, e o prejuízo do chargeback segue as regras do cartão (Asaas/vendedor). Sem antifraude próprio (o Asaas já tem camada).

**Disclaimer obrigatório:** aviso claro no painel de venda direta de que a Vaultly **não se responsabiliza** por compras estornadas nem pelo material já entregue. Reforça os termos de responsabilidade já existentes.

---

## 8. Retenção (gotejamento de conteúdo)

Aba no painel onde o vendedor anexa materiais complementares a um produto, programados em **D+1..D+7** (contados a partir da compra). Cada passo é um email com link de vídeo e/ou PDF. Objetivo: segurar o cliente até passar a janela de reembolso (7 dias) e aumentar valor percebido.

- A aba **explica o porquê** e **sugere o preenchimento** para quem vende direto, reforçando que a técnica reduz perda por reembolso e que a Vaultly não se responsabiliza por estornos.
- **Aviso de limite:** cada passo de retenção é 1 email e **consome do limite mensal** do vendedor (mesma filosofia dos testes de envio). Ex.: 7 dias ativos = até 8 envios por venda (1 entrega + 7 retenções). A aba mostra esse aviso (idealmente com projeção).
- **Vale para os dois modos** (automação e venda direta), pois ancora na entrega.

### Gating de dias por plano
| Plano | Dias de retenção |
|---|---|
| Starter | 1 (escolhe D+3 ou D+7) |
| Basic | 3 (D+1, D+3, D+7) |
| Pro | 7 completos |
| Business | 7 completos |

### Comportamento em estouro de limite
Se o vendedor estourar o limite mensal no meio de uma sequência em andamento, o passo pendente fica **`skipped`** com notificação ("retenção não enviada — limite atingido, faça upgrade"), virando gatilho de upgrade. (Decisão preliminar; confirmar na implementação do SP2.)

---

## 9. Arquitetura e fluxo

```
                        ┌─────────────────── VAULTLY ───────────────────┐
  🔁 AUTOMAÇÃO          │   Kiwify/Yampi ──webhook──┐                    │
                        │                           ▼                    │
                        │                    ┌──────────────┐            │
  💰 VENDA DIRETA       │   Checkout ──pago──┤   Núcleo de  │──email──►  │  Comprador
                        │   Vaultly  (Asaas) │   Entrega    │  (PDF +    │
                        │      │  split      │  (já existe) │  retenção) │
                        │      ▼             └──────┬───────┘            │
                        │  R$0,10+1,49%             ▼                    │
                        │  → Vaultly         ⏰ Agendador Retenção        │
                        └────────────────────────────────────────────────┘
```

### Fluxo de venda direta
1. Comprador acessa `vaultly.com/c/:slug`.
2. Página de checkout (marca Vaultly) mostra produto/preço; escolhe Pix ou Cartão; preenche nome, email, CPF (+ cartão tokenizado se for o caso).
3. Backend cria a cobrança no Asaas **com split embutido**: total cobrado do comprador; split fixedValue+percentual para a wallet da Vaultly; restante para a wallet do vendedor.
4. Pix → exibe QR Code; Cartão → processa e retorna aprovado/recusado.
5. Asaas confirma pagamento → dispara **webhook** para `POST /api/asaas/webhook` (validado por assinatura/token, igual aos webhooks atuais).
6. Vaultly marca `order='paid'` e **chama o núcleo de entrega existente** (acha produto → anexa PDF(s) → envia email). Reaproveita 100% do `deliveryService`.
7. Entrega concluída → **matricula** o comprador na retenção (cria `retention_jobs`).

### Pontos de engenharia
- Split configurado **na criação da cobrança** (mantém a Vaultly fora do Bacen).
- **Idempotência:** guardar `asaas_payment_id` e ignorar webhooks duplicados (Asaas reenvia) — senão entrega/cobra em dobro.
- **`asaasService.js`** concentra tudo do Asaas (subconta, cobrança+split, validação de webhook), isolado e testável.
- **`retentionService.js`** concentra `enroll()` + `processDue()`.
- O agendador entra junto do agendamento que o servidor já inicializa (mesmo padrão do job de retry em `deliveryService.js`) — não é cron novo.

### Onboarding do vendedor (white-label, baixo atrito)
1. No painel, clica "Quero vender direto aqui".
2. Formulário enxuto (nome, CPF/CNPJ, email, telefone, nascimento, dados bancários) + escolhe meios aceitos.
3. `asaasService.createSubaccount()` → Asaas devolve account_id, wallet_id, api_key.
4. Grava em `seller_accounts` (api_key **criptografada**), status `active`.
5. Pronto — já pode criar produto vendável. Documentos só são pedidos depois, se o Asaas exigir (status reflete `kyc_status`), sem travar o que já funciona.

### Página de checkout
- Hospedada pela Vaultly: cada produto ganha URL própria `/c/:slug` com marca Vaultly (QR Pix + form cartão).
- **Slug personalizável** desde o lançamento (o link "é do vendedor").
- **Domínio próprio (CNAME)** como feature Pro+ (SP3). **Embed/botão** opcional para quem tem site (SP3).

---

## 10. Modelo de dados

Migrations incrementais (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), models em `src/models/database.js`. Tudo multi-tenant (`tenant_id`).

### Colunas em tabelas existentes
```
users / tenants
  + usage_mode            'automation' | 'direct' | 'both'

products
  + sellable              boolean default false
  + price_cents           integer
  + slug                  text UNIQUE
  + checkout_title        text
  + checkout_description  text
  + accept_pix            boolean default true
  + accept_card           boolean default true
```
(combo de PDFs já existe via `product_files`.)

### Tabelas novas
```
seller_accounts (1 por tenant)
  tenant_id, asaas_account_id, asaas_wallet_id,
  asaas_api_key (CRIPTOGRAFADO), status ('pending'|'active'|'blocked'),
  kyc_status, accept_pix, accept_card, created_at

orders (cada venda direta — porta de entrada do modo venda direta)
  tenant_id, product_id, buyer_name, buyer_email, buyer_doc,
  amount_cents, payment_method ('pix'|'card'),
  asaas_payment_id, status ('pending'|'paid'|'refunded'|'chargeback'|'failed'),
  platform_fee_cents (margem Vaultly), gateway_fee_cents (repasse Asaas),
  net_cents (líquido do vendedor), delivery_id,
  created_at, paid_at, refunded_at

retention_steps (template do vendedor, por produto)
  product_id, tenant_id, day_offset (1..7),
  email_subject, email_body, file_path (PDF opcional), link (opcional), enabled

retention_jobs (fila real, 1 por comprador × passo)
  delivery_id (origem — serve aos dois modos), retention_step_id,
  recipient_email, scheduled_for (compra + day_offset),
  status ('pending'|'sent'|'failed'|'skipped'), sent_at
```

### Decisões de modelagem
- **Retenção ancora na `delivery`, não no `order`** — como todo modo gera uma `delivery`, a retenção funciona nos dois sem duplicar lógica.
- **Gating de plano não vira coluna** — é regra aplicada ao salvar passos e ao matricular.
- `asaas_api_key` criptografado igual aos secrets atuais.

---

## 11. Gating de planos (consolidado)

| Recurso | Starter | Basic | Pro | Business |
|---|---|---|---|---|
| Automação (webhook+email) | ✅ | ✅ | ✅ | ✅ |
| Venda direta (checkout+split) | ✅ | ✅ | ✅ | ✅ |
| Dias de retenção | 1 (D+3/D+7) | 3 | 7 | 7 |
| Combo de PDFs | — | — | ✅ | ✅ |
| BYOK Resend | — | ✅ | ✅ | ✅ |
| Slug personalizado | ✅ | ✅ | ✅ | ✅ |
| Domínio próprio (CNAME) | — | — | ✅ | ✅ |

Venda direta liberada em **todos os planos** — monetização vem da taxa por transação; travar afastaria volume.

---

## 12. Decomposição em sub-projetos (ordem de construção)

Cada sub-projeto entrega valor sozinho e terá seu próprio plano de implementação.

### SP1 — Venda Direta (o coração)
- Modo duplo no registro + `usage_mode`.
- Onboarding Asaas (white-label, subconta).
- Página de checkout `/c/:slug` (Pix + Cartão).
- Split na cobrança + webhook de pagamento do Asaas + idempotência.
- Pagamento pago → dispara o núcleo de entrega existente.
- Disclaimer de estorno.
- **Entregável:** vender um PDF direto pela Vaultly com o dinheiro dividido na fonte.

### SP2 — Retenção (gotejamento)
- `retention_steps` + `retention_jobs`.
- Aba "Retenção" no painel (explicação + aviso de limite + projeção).
- Agendador (gêmeo do job de retry) + matrícula na entrega.
- Gating de dias por plano + integração com limite mensal + comportamento de estouro.
- **Entregável:** funil de retenção D+1..D+7 nos dois modos.

### SP3 — Refinamentos
- Domínio próprio (CNAME) Pro+.
- Botão/embed para quem tem site.
- Quebra de transparência da taxa no checkout/painel.
- **Entregável:** polimento competitivo.

**Processo:** este spec único captura toda a visão. A fase de plano ataca o **SP1 primeiro** (plano detalhado, implementação, validação), depois SP2, depois SP3 — para não ficar sem nada no ar.

---

## 13. Segurança e conformidade
- `asaas_api_key` e dados sensíveis criptografados (padrão atual dos secrets).
- Webhook do Asaas validado por assinatura/token (postura do `webhookAuth.js`).
- Cartão tokenizado no Asaas (Vaultly fora do escopo PCI pesado).
- Idempotência de webhooks de pagamento.
- Multi-tenant: toda query filtra por `tenant_id`.
- Disclaimers de responsabilidade integrados aos termos já existentes.

---

## 14. Fora de escopo (YAGNI)
- Hospedagem de vídeo/curso/área de membros (a Vaultly entrega arquivo/PDF; vídeo é link do vendedor, sem responsabilidade de gestão).
- Antifraude próprio.
- Boleto.
- Unificação de assinatura no Asaas.
- Sistema de afiliados.
- Revogação de acesso pós-chargeback (entrega é por anexo).
