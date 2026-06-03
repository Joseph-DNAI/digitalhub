# Spec — B2: Config honesto + notificação real de falha

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do Grupo B. Irmãos: B1 (mobile, feito), B3 (surfacing venda direta), B4 (polimentos).

---

## 1. Objetivo

O card "Comportamento do sistema" (aba Config) tem 3 toggles **falsos** (`onclick="this.classList.toggle('on')"`, sem persistência) descrevendo proteções que já são **sempre ativas**. Trocar os 2 primeiros por **indicadores de status honestos** e transformar o 3º num **opt-in real**: avisar o dono da conta por email quando uma entrega falhar de vez (após as 3 tentativas de retry).

---

## 2. Comportamento atual (confirmado)

- **Validação de assinatura** (`webhookAuth.js`): HMAC é validado automaticamente sempre que o tenant cadastra o secret; sem secret, passa sem validar. Não há flag on/off.
- **Reenvio automático** (`deliveryService.js`): job global de retry; `findPending/findAllPending` pegam `status IN ('pending','failed') AND attempts < 3`. `updateStatus` incrementa `attempts`. Logo, **falha permanente = status 'failed' e attempts ≥ 3** (o retry deixa de pegar).
- **Notificar admin em falha**: não existe hoje.

---

## 3. Frontend (`public/index.html`, card "Comportamento do sistema")

Substituir os 3 `toggle-row` atuais por:

1. **Status — Validação de assinatura** (sem toggle): ícone de check verde + título "Validação de assinatura HMAC" + descrição "Ativa automaticamente quando você cadastra o Secret na aba Webhook."
2. **Status — Reenvio automático** (sem toggle): ícone de check verde + "Reenvio automático em falha" + "O sistema tenta reenviar até 3 vezes, automaticamente."
3. **Toggle real — Notificar falha**: `toggle-row` com botão `toggle` que reflete e salva `notify_on_failure`:
   - Título "Avisar quando uma entrega falhar de vez"
   - Descrição "Você recebe um email no endereço da sua conta quando uma entrega esgota as 3 tentativas."
   - `id="toggle-notify-failure"`; ao clicar: `this.classList.toggle('on')` e chama `saveNotifyFailure()`.

JS:
- Em `loadConfig()` (já existe e chama `GET /api/tenants/me`), ler `data.notify_on_failure` e setar a classe `on` no `#toggle-notify-failure`.
- Nova função `saveNotifyFailure()`: lê o estado do toggle e faz `PUT /api/tenants/me` com `{ notify_on_failure: <bool> }`; toast de sucesso/erro.

> Observação: os indicadores de status (1 e 2) usam o mesmo visual de `toggle-row`/`toggle-info` porém com um ícone `ti ti-circle-check` (cor emerald) no lugar do botão toggle.

---

## 4. Backend

### 4.1 DB (`src/models/database.js`)
Migração incremental:
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notify_on_failure BOOLEAN DEFAULT FALSE;
```

### 4.2 Rota (`src/routes/tenants.js`)
- `GET /me`: incluir no `data` retornado `notify_on_failure: !!(tenant && tenant.notify_on_failure)`.
- `PUT /me`: adicionar `'notify_on_failure'` à lista `allowed`. (O valor booleano flui para `tenants.update`, que faz SET dinâmico.)

### 4.3 Email (`src/services/emailService.js`)
Nova função `sendDeliveryFailedEmail({ userEmail, userName, productName, buyerEmail, error })`, no mesmo padrão de `sendLimitWarningEmail` (HTML simples, remetente da plataforma). Conteúdo: avisa que a entrega do produto `productName` para `buyerEmail` falhou após 3 tentativas, com o `error`, e orienta verificar o arquivo do produto / a aba Entregas (com link para `BASE_URL`). Exportar a função.

### 4.4 Disparo (`src/services/deliveryService.js`)
No `catch` de `attemptDelivery`, após `await deliveries.updateStatus(deliveryId, 'failed', err.message)`:
- Se `tenant && tenant.notify_on_failure && user`:
  - Consultar `queryOne("SELECT attempts FROM deliveries WHERE id=$1", [deliveryId])`.
  - Se `attempts >= 3` (falha permanente), chamar `sendDeliveryFailedEmail({ userEmail: user.email, userName: user.name, productName: product.name, buyerEmail: normalized.buyerEmail, error: err.message })`.
  - Tudo dentro de `try/catch` que só loga `warn` (a notificação nunca pode quebrar a entrega/retry).
- Importar `sendDeliveryFailedEmail` no topo (junto de `sendProductEmail, sendLimitWarningEmail`).

Dispara **uma vez**: ao atingir attempts=3 o retry deixa de reprocessar; entregas de teste (`is_test`) seguem o mesmo caminho (aceitável — é o dono que recebe).

---

## 5. Fora de escopo
- Tornar assinatura/retry desligáveis (decidido: são sempre ativos).
- Notificações in-app / webhooks de falha.
- Reprocessar manualmente (já existe na aba Entregas).

---

## 6. Critérios de sucesso
- O card do Config não tem mais toggles falsos: 2 status honestos + 1 toggle real que **persiste**.
- `notify_on_failure` é salvo/lido via `/api/tenants/me`.
- Quando uma entrega esgota as 3 tentativas e o opt-in está ligado, o dono recebe 1 email de aviso; a falha de envio do aviso nunca quebra o fluxo.
- `node -c` nos arquivos backend + `node --check` no script do `index.html` passam; suíte de testes existente continua verde.
