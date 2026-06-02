# Spec — Repasse da Taxa do Cartão ao Comprador + Aba "Loja"

> Data: 2026-06-02
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Tópico: opção (por loja) de repassar a taxa do cartão ao comprador no checkout de venda direta, com uma nova aba "Loja" consolidando a configuração de Venda Direta

---

## 1. Objetivo

Permitir que o vendedor (cliente da Vaultly) **receba o valor cheio do produto mesmo nas vendas no cartão**, repassando a taxa do gateway (Asaas) ao comprador final. No checkout:

- **Pix:** comprador paga o **valor real** (Pix é gratuito).
- **Cartão (com repasse ligado):** comprador paga o **valor com a taxa do cartão embutida** (gross-up), e o vendedor recebe o preço cheio.

A configuração mora numa **nova aba "Loja"** que consolida toda a Venda Direta (onboarding da conta de recebimento + métodos aceitos + o novo toggle de repasse), saindo da aba Config.

### Premissa que simplifica tudo
Venda direta é **exclusiva de planos pagos**, e planos pagos são **isentos da taxa Vaultly**. Logo, **não há taxa Vaultly para repassar** — o gross-up cobre apenas a **taxa do banco (Asaas) no cartão**. O Pix de recebimento é gratuito (notificações desabilitadas), então Pix nunca tem repasse.

---

## 2. O cálculo (gross-up do cartão)

Para o vendedor receber o preço `P` (em centavos) mesmo após a taxa do cartão (percentual `pct` + fixo `fixo`), a cobrança no cartão precisa ser:

```
cardChargeCents(P) = ceil( (P + fixo) / (1 − pct) )
```

- `pct` = `ASAAS_CARD_PERCENT/100` (default 1,99% → 0,0199)
- `fixo` = `ASAAS_CARD_FEE_CENTS` (default 49)
- **Arredonda para cima** (`Math.ceil`) para o vendedor nunca receber a menos.

Exemplo, `P = 2700` (R$27,00): `(2700 + 49) / 0,9801 = 2804,8…` → `ceil` = **2805** (R$28,05). Após a taxa (2805×1,99% + 49 ≈ 105), o vendedor recebe ~2700.

### O split NÃO muda
A cobrança é criada na conta master e o split já envia ao vendedor `valorCobrado − taxaAsaas − taxaVaultly` (taxaVaultly = 0 em planos pagos). Se o valor cobrado no cartão for o `cardChargeCents`, então o split entrega ao vendedor `cardChargeCents − taxaAsaas(cardChargeCents) ≈ P` automaticamente. Nenhuma mudança em `buildSplit`. A única mudança é **qual valor é cobrado** no cartão quando o repasse está ligado.

### Função pura nova
`src/services/pricing.js` ganha `cardChargeCents(priceCents, overrides)` (pura, testável), reutilizando `asaasFeeCents`/configs já existentes.

---

## 3. Modelo de dados

- `seller_accounts` ganha **`pass_card_fee_to_buyer BOOLEAN DEFAULT FALSE`** (configuração por loja/tenant).
- Migration incremental: `ALTER TABLE seller_accounts ADD COLUMN IF NOT EXISTS pass_card_fee_to_buyer BOOLEAN DEFAULT FALSE;`.
- `sellerAccounts.upsert` já é genérico (aceita o campo novo). `findByTenant` retorna `*` (já traz o campo).

---

## 4. Checkout (backend)

### `GET /api/checkout/:slug`
Passa a retornar **dois preços**:
- `pix_cents` = `price_cents` (valor real).
- `card_cents` = se a loja tem `pass_card_fee_to_buyer = true` → `cardChargeCents(price_cents)`; senão `price_cents`.
- Inclui `pass_card_fee` (bool) para a página exibir a explicação.

Para isso, o handler busca a `seller_account` do tenant do produto (já busca `acc` hoje) e lê `pass_card_fee_to_buyer`.

### `POST /api/checkout/:slug`
- `pm === 'pix'` → cobra `price_cents` (inalterado).
- `pm === 'card'` → se `pass_card_fee_to_buyer` da loja for true, cobra `cardChargeCents(price_cents)`; senão cobra `price_cents` (comportamento atual).
- O `amountCents` usado na cobrança Asaas e no `orders.amount_cents` passa a ser esse valor efetivamente cobrado (o que o comprador paga). O split (já existente) entrega ao vendedor o líquido — que, com gross-up, é ≈ o preço cheio.
- `platform_fee_cents` (Vaultly) continua 0 em planos pagos.

### Validação
O preço mínimo (R$9) continua sobre o `price_cents` (preço base), não sobre o valor com gross-up.

---

## 5. Nova aba "Loja" (painel)

- Novo item no menu lateral: **"Loja"** (ícone de loja). Visível apenas para planos pagos (Free não vê — só usa checkout externo).
- A aba recebe TODA a seção de Venda Direta que hoje vive na aba **Config** (`cfg-venda-direta-body` e suas funções `loadVendaDiretaSection`/`renderSellerOnboarding`/`renderSellerActive`/etc.):
  - Onboarding da conta de recebimento (Asaas).
  - Métodos aceitos (Pix/cartão) — toggles existentes.
  - **Novo:** toggle **"Repassar a taxa do cartão ao comprador"** (só aparece no estado "conta ativa"), que salva `pass_card_fee_to_buyer` via um endpoint (ex.: reutilizar `PUT /api/seller/methods` estendido, ou um `PUT /api/seller/store`).
- A seção de Venda Direta **sai da aba Config** (uma casa só). O bloco de transparência de taxas (Pix×cartão) acompanha.
- Implementação: mover o container e a chamada `loadVendaDiretaSection()` da Config para a nova aba; ajustar a navegação (`switchTab`/menu) para incluir "Loja" e carregar a seção ao abrir.

### Endpoint de configuração
- Estender `PUT /api/seller/methods` para também aceitar `pass_card_fee_to_buyer` (ou criar `PUT /api/seller/store`). Recomenda-se estender `/methods` (já existe e já faz upsert em `seller_accounts`), renomeando conceitualmente para "configurações da loja".

---

## 6. Página de checkout (comprador)

`public/checkout.html`:
- Ao carregar (`GET /api/checkout/:slug`), exibe os **dois preços**:
  - **Pix:** `pix_cents` (valor real).
  - **Cartão:** `card_cents` (com a taxa embutida quando o repasse está ligado).
- Mostra a diferença de forma transparente, ex.: ao selecionar o método, o valor exibido muda (Pix R$27,00 / Cartão R$28,05). Quando `pass_card_fee` é true, uma nota curta explica: "No cartão, a taxa de processamento é adicionada."
- No POST, o valor cobrado é decidido pelo backend conforme o método (a página não precisa recalcular; só envia `method`).

---

## 7. Arquitetura e componentes

### Backend
- `src/services/pricing.js` — nova função pura `cardChargeCents(priceCents, overrides)` + testes em `test/pricing.test.js`.
- `src/models/database.js` — migration `pass_card_fee_to_buyer` em `seller_accounts`.
- `src/routes/checkout.js` — GET retorna `pix_cents`/`card_cents`/`pass_card_fee`; POST cobra o valor com gross-up no cartão quando ligado.
- `src/routes/seller.js` — `PUT /methods` aceita `pass_card_fee_to_buyer`.

### Frontend
- `public/index.html` — nova aba "Loja"; mover a seção Venda Direta para lá; toggle de repasse no estado ativo; remover a seção da Config.
- `public/checkout.html` — exibir os dois preços e a nota de cartão.

### Decisões
- **Split inalterado** — o gross-up vive só na escolha do valor cobrado; a divisão já entrega o líquido correto.
- **Configuração por loja** (não por produto) — uma decisão simples, alinhada à "aba Loja".
- **Arredonda para cima** no gross-up — protege o vendedor.

---

## 8. Gating por plano
| | Free | Pago |
|---|---|---|
| Aba "Loja" / Venda Direta | — (só checkout externo) | ✅ |
| Repassar taxa do cartão | — | ✅ (opcional, por loja) |

---

## 9. Fora de escopo (YAGNI)
- Repasse por produto (é por loja).
- Repasse no Pix (Pix é gratuito; sempre valor real).
- Repasse parcial/customizável da taxa (é tudo-ou-nada).
- Parcelamento com juros repassados (só à vista por enquanto; a taxa usada é a de cartão à vista configurada).

---

## 10. Critérios de sucesso
- Vendedor (pago) acessa a aba "Loja", ativa "Repassar taxa do cartão".
- No checkout do produto, Pix mostra o valor real e Cartão mostra o valor com a taxa embutida.
- Pagando no cartão, o vendedor recebe ~o preço cheio (líquido ≈ `price_cents`).
- Com o toggle desligado, o comportamento atual é mantido (vendedor absorve a taxa do cartão).
- A configuração de Venda Direta agora vive na aba "Loja", não na Config.
