# Spec — Passo 0 (apiKey da subconta criptografada) + Saque Automático

> Data: 2026-06-02
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Tópico: armazenar com segurança a apiKey da subconta Asaas e repassar automaticamente o saldo do vendedor para a chave Pix (CPF/CNPJ) dele

> Parte do projeto maior decomposto: **Passo 0 + Feature A**. As próximas features (B antecipação + ajuste de taxas, C card de taxas, D termos) terão seus próprios specs.

---

## 1. Objetivo

Fazer o dinheiro das vendas chegar **automaticamente na conta do vendedor**, sem ele tocar no Asaas. As vendas caem na subconta Asaas do vendedor (via split); um job periódico transfere o saldo disponível, via **Pix gratuito**, para a **chave Pix = CPF/CNPJ** do vendedor.

Pré-requisito (Passo 0): para agir sobre a subconta (consultar saldo, criar transferência), a Vaultly precisa da **apiKey da subconta** — que hoje não é guardada. Vamos guardá-la **criptografada**.

---

## 2. Passo 0 — Guardar a apiKey da subconta (criptografada)

### Util de criptografia
- Novo `src/services/crypto.js`: AES-256-GCM com chave de `process.env.ENCRYPTION_KEY` (32 bytes; aceitar hex de 64 chars ou base64).
  - `encrypt(plaintext)` → string (formato `iv:authTag:ciphertext` em base64/hex).
  - `decrypt(payload)` → plaintext.
  - Se `ENCRYPTION_KEY` não estiver setada, `encrypt`/`decrypt` lançam erro claro (não silenciar — a falta da chave é um erro de config).

### Persistência
- `seller_accounts` ganha `asaas_api_key_enc TEXT` (migration `ADD COLUMN IF NOT EXISTS`).
- Na criação da subconta (`asaasService.createSubaccount` já devolve `apiKey`), o `seller.js`/onboarding **criptografa** `created.apiKey` e salva em `asaas_api_key_enc` via `sellerAccounts.upsert`.
- Helper no model/serviço para obter a apiKey descriptografada de um tenant quando necessário (ex.: `getSubaccountApiKey(tenantId)`), usado só pelo job de saque.

### Vendedores já existentes
- A apiKey só é retornada **na criação** da subconta (Asaas não reexpõe). Vendedores onboardados antes desta mudança não terão `asaas_api_key_enc` → o saque automático não roda para eles.
- Tratamento: exibir no painel (aba Loja) um aviso "reative sua conta de recebimento para habilitar o saque automático" quando `asaas_api_key_enc` estiver vazio, com um botão que apaga (no Asaas + no nosso banco) e recria a subconta. Em sandbox/início isso é trivial. (A reativação reaproveita o fluxo de onboarding já existente.)

---

## 3. Onboarding — CPF/CNPJ como chave Pix obrigatória

- O formulário de onboarding já coleta `cpfCnpj`. Adicionar uma **declaração obrigatória** (checkbox) antes de ativar:
  > "Declaro que meu CPF/CNPJ está cadastrado como chave Pix no meu banco e autorizo a Vaultly a usar essa chave para repassar automaticamente os valores das minhas vendas."
- O backend de onboarding exige esse aceite (`pix_key_declared === true`), senão retorna 400.
- O `cpfCnpj` (limpo, só dígitos) é a chave Pix de repasse. O tipo (`CPF` vs `CNPJ`) é derivado do tamanho (11 = CPF, 14 = CNPJ).
- Alerta visível: "Se o CPF/CNPJ não estiver ativo como chave Pix no seu banco, o repasse não será concluído."

---

## 4. Saque automático (job)

### Comportamento
- Um job periódico (mesmo padrão do `startRetryJob` em `deliveryService.js` — `setInterval`), por ex. a cada algumas horas (`PAYOUT_INTERVAL_HOURS`, default 6h).
- Para cada `seller_account` com `status='active'` E `asaas_api_key_enc` presente:
  1. Descriptografa a apiKey da subconta.
  2. Consulta o **saldo disponível** da subconta (`asaasService.getSubaccountBalance(apiKey)`).
  3. Se saldo ≥ um mínimo (`PAYOUT_MIN_CENTS`, default ex. R$5 = 500; evita microtransferências), cria um **Pix transfer** (`asaasService.createPixTransfer(apiKey, { pixKey: cpfCnpj, value })`) para a chave CPF/CNPJ do vendedor.
  4. Registra o repasse (log) com tenant, valor, status, timestamp.
- "Conforme o Asaas libera": o saldo disponível já reflete o liberado (Pix imediato; cartão depende da antecipação — Feature B futura). Sem antecipação, o cartão entra no saldo disponível só após a compensação padrão.

### Registro (auditoria/transparência)
- Tabela `payouts` (simples): `id, tenant_id, amount_cents, asaas_transfer_id, status ('done'|'failed'), error, created_at`.
- Model `payouts` com `create` e `findAll(tenantId)`. (Exibição no painel pode vir depois; o registro já é criado agora.)

### Idempotência / segurança
- O job só transfere o **saldo disponível atual** (não há duplicação: após a transferência, o saldo zera/reduz; a próxima execução só transfere o que entrou desde então).
- Tratamento de erro por vendedor isolado (um falhar não derruba os outros), com log e registro `failed`.

---

## 5. asaasService — novas funções

- `getSubaccountBalance(apiKey)` → consulta o saldo da subconta usando a apiKey dela (header `access_token: apiKey`). Retorna o saldo em centavos.
- `createPixTransfer(apiKey, { pixKey, pixKeyType, valueReais })` → `POST /transfers` com `pixAddressKey`, `pixAddressKeyType`, `value`. Usa a apiKey da subconta.
- Essas funções **trocam o `access_token`** para a apiKey da subconta (não a master). A função `request()` atual usa sempre a master; será estendida para aceitar uma apiKey opcional por chamada (sem quebrar as chamadas existentes, que continuam usando a master por padrão).

---

## 6. Modelo de dados (resumo)
- `seller_accounts` + `asaas_api_key_enc TEXT`.
- Nova tabela `payouts` (registro dos repasses).
- Migrations incrementais (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).

---

## 7. Variáveis de ambiente
- `ENCRYPTION_KEY` — chave de 32 bytes para AES-256-GCM (obrigatória para o saque; sem ela, o onboarding não consegue guardar a apiKey).
- `PAYOUT_INTERVAL_HOURS` (default 6), `PAYOUT_MIN_CENTS` (default 500).

---

## 8. Validação no sandbox (gates de implementação)
Confirmar contra a doc/sandbox do Asaas (https://docs.asaas.com):
- Endpoint e payload exatos de **`POST /transfers`** para chave Pix (`pixAddressKey`/`pixAddressKeyType`/`value`) e o que retorna (`id`, `status`).
- Endpoint de **saldo** da conta (ex.: `GET /finance/balance`) e formato.
- Se a transferência via Pix para a própria chave do titular é liberada de imediato ou passa por validação (ver doc "Mecanismo para validação de saque via webhooks").
- Custo real da transferência Pix (esperado: gratuito).

---

## 9. Gating por plano
- Tudo isto vale só para **planos pagos** (venda direta é exclusiva de assinantes). Free não tem subconta nem saque.

---

## 10. Fora de escopo (YAGNI / próximos specs)
- **Feature B** (antecipação automática do cartão + somar a taxa no gross-up e na taxa publicada) — spec próprio.
- **Feature C** (card informativo de taxas na aba pagamentos) — spec próprio.
- **Feature D** (Termos de Uso com as taxas + Asaas nome/CNPJ + ressalva de variação) — spec próprio.
- Tela de histórico de repasses no painel (o registro `payouts` é criado agora; a UI pode vir depois).
- Saque sob demanda / agendado (escolhemos "conforme o Asaas libera").
- Criptografar retroativamente outros secrets (smtp_pass etc.) — fora de escopo; o `crypto.js` fica disponível para isso no futuro.

---

## 11. Critérios de sucesso
- Ao ativar a conta de recebimento, a apiKey da subconta é guardada **criptografada**.
- O vendedor declara seu CPF/CNPJ como chave Pix obrigatória no onboarding.
- Com saldo disponível na subconta, o job transfere automaticamente, via Pix, para a chave CPF/CNPJ do vendedor, e registra o repasse.
- Vendedores sem apiKey guardada veem o aviso para reativar a conta.
