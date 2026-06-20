# Spec — Entrega por webhook (Modelo A) na Vaultly

> Data: 2026-06-13
> Objetivo: produto cuja entrega é um **e-mail templado com dados vindos de um webhook
> externo** (ex.: chave de licença do Lucro App via Apps Script), em vez de anexar arquivo.

---

## 1. Contrato (definido por nós)
**Vaultly → endpoint do vendedor** (POST `application/x-www-form-urlencoded`):
- `acao=venda`
- `payload=<JSON string exata>`
- `sig=<HMAC-SHA256 hex do payload, com o segredo do produto>`

`payload` venda: `{event:"sale", transacao_id, produto_id, email, nome, valor_cents, data}`
`payload` refund: `{event:"refund", transacao_id}`

**Resposta esperada:** `{ok:true, codigo, link}` ou `{ok:false, erro}`. (Apps Script não lê
headers — por isso `sig` vai no corpo.)

---

## 2. DB (`products`, em `src/models/database.js`)
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_type            TEXT DEFAULT 'file'; -- 'file' | 'webhook'
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_webhook_url     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_webhook_secret_enc TEXT;            -- segredo HMAC, criptografado
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_email_subject   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_email_html      TEXT;               -- template com {{codigo}} {{link}} {{nome}} {{email}}
```

---

## 3. Serviço de webhook de venda (novo: `src/services/saleWebhookService.js`)
- `callSaleWebhook(product, order)`:
  - `secret = decrypt(product.delivery_webhook_secret_enc)`
  - `payload = JSON.stringify({ event:'sale', transacao_id: order.id, produto_id: product.slug, email: order.buyer_email, nome: order.buyer_name||'', valor_cents: (product.promo_price_cents||product.price_cents||order.amount_cents), data: new Date().toISOString() })`
  - `sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')`
  - POST `url` com body `new URLSearchParams({ acao:'venda', payload, sig })` (Content-Type form).
  - timeout ~12s (AbortController). Parse JSON. Se `!resp.ok` ou `json.ok !== true` → throw `Error('webhook: ' + (json.erro||status))`.
  - retorna `{ codigo: json.codigo||'', link: json.link||'' }`.
- `callRefundWebhook(product, order)`: igual, payload `{event:'refund', transacao_id: order.id}`; best-effort (loga, não lança).
- Exporta ambos.

---

## 4. Entrega (`src/services/deliveryService.js` → `attemptDelivery`)
No início do `try`, ramificar por tipo:
```js
if (product.delivery_type === 'webhook') {
  const { codigo, link } = await callSaleWebhook(product, { id: normalized.orderId, buyer_email: normalized.buyerEmail, buyer_name: normalized.buyerName, amount_cents: product.price_cents });
  await sendCodeEmail({
    buyerEmail: normalized.buyerEmail, buyerName: normalized.buyerName,
    productName: product.name,
    subject: product.delivery_email_subject || ('Seu acesso — ' + product.name),
    html: renderCodeTemplate(product.delivery_email_html, { codigo, link, nome: normalized.buyerName||normalized.buyerEmail, email: normalized.buyerEmail, produto: product.name }),
    resendApiKey: ..., fromName: ..., fromAddress: ..., showBranding
  });
} else {
  // ... fluxo de arquivo atual (sendProductEmail) ...
}
```
Se `callSaleWebhook` lançar (ok:false/timeout) → cai no `catch` existente → `deliveries.updateStatus('failed')` + retry job + aviso ao vendedor. (Idempotência fica no Apps Script: a mesma `transacao_id` devolve a mesma chave.)

---

## 5. E-mail templado sem anexo (`src/services/emailService.js`)
- `sendCodeEmail({ buyerEmail, productName, subject, html, resendApiKey, fromName, fromAddress, showBranding })`:
  - mesmo padrão Resend do `sendProductEmail`, mas **sem `attachments`**, `subject` custom, corpo = `html + DISCLAIMER`.
- `renderCodeTemplate(tpl, vars)`: se `tpl` vazio, usa um HTML default (saudação + `{{codigo}}` em destaque + botão `{{link}}`). Substitui `{{codigo}}`, `{{link}}`, `{{nome}}`, `{{email}}`, `{{produto}}` (escapando HTML em nome/email).

---

## 6. Reembolso (`src/routes/asaasWebhook.js`)
No ramo `REFUND_EVENTS`, após `orders.updateStatus`: carregar o produto da order; se `delivery_type==='webhook'` → `callRefundWebhook(product, order)` (best-effort, em `setImmediate`).

---

## 7. Salvar a config (`src/routes/products.js`)
- Novo endpoint `PUT /api/products/:id/delivery` (requireAuth): body `{ delivery_type, delivery_webhook_url, delivery_webhook_secret, delivery_email_subject, delivery_email_html }`.
  - valida `delivery_type ∈ {file, webhook}`. Se `webhook`: exige URL https. Se vier `delivery_webhook_secret` (texto) → `encrypt` e grava em `delivery_webhook_secret_enc`; se vier vazio e já existe, mantém.
  - `products.update` com os campos.
- `GET /:id` já devolve as colunas (spread). Mascarar o segredo: devolver `has_delivery_secret: !!delivery_webhook_secret_enc`, sem o enc.

---

## 8. UI (`public/index.html`, modal de produto)
- Em "Mais opções" (ou seção própria abaixo das Formas de pagamento): seletor **Tipo de entrega**: `Arquivo (padrão)` | `Webhook (código/licença)`.
  - Se `Webhook`: campos **URL do webhook**, **Segredo HMAC**, **Assunto do e-mail**, **Template HTML** (com dica das variáveis `{{codigo}} {{link}} {{nome}}`), e um aviso "este produto não exige arquivo".
  - Esconde/!exige o upload de arquivo quando `Webhook`.
- `saveProduct`: após salvar o produto, se tipo webhook → `PUT /:id/delivery`. `editProduct`: popular os campos (segredo via placeholder "•••• (mantém)").

---

## 9. Critérios de sucesso / teste
- Produto webhook: pagamento → Vaultly chama o endpoint (assinado) → recebe `{codigo,link}` → e-mail templado chega (sem anexo).
- Reenvio 3x (retry) **não duplica** chave (Apps Script idempotente por `transacao_id`).
- `ok:false` (estoque esgotado) → entrega `failed` + retry; quando houver chave, completa.
- Reembolso → POST refund → chave revogada no Apps Script.
- `curl` de exemplo do payload assinado documentado.
- `node -c` backend + `node --check` script + suíte verde.
