# Spec — Feature B: Antecipação automática do cartão + parcelamento (até 3x)

> Data: 2026-06-02
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do projeto maior: venda direta. Specs irmãs: **A** (saque automático, já implementada), **C** (card de taxas no painel), **D** (Termos de Uso). Esta é a **Feature B**.

---

## 1. Objetivo

Fazer o vendedor receber o dinheiro do **cartão** rápido (antecipação automática no Asaas, ~1–2 dias em vez de D+30) e oferecer **parcelamento até 3x** no checkout. O custo da antecipação (1,15% à vista / 1,6% ao mês parcelado) entra:
- na **taxa publicada** ao vendedor (transparência), e
- no **gross-up** do cartão **quando o toggle "repassar a taxa do cartão ao comprador" está ligado** (aí o comprador paga a antecipação; senão o vendedor a absorve).

A antecipação **só se aplica ao cartão**. Pix não muda (recebimento imediato, sem antecipação).

---

## 2. Matemática da taxa (`src/services/pricing.js`)

### Custo de antecipação (% sobre a venda)
Modelo "média de meses" (taxa mensal × meses adiantados, somada por parcela; cada parcela liberada em ~D+30×k):

| Parcelas | Fórmula | Antecipação |
|---|---|---|
| 1x (à vista) | taxa à vista | **1,15%** |
| 2x | 1,6% × (2+1)/2 | **2,40%** |
| 3x | 1,6% × (3+1)/2 | **3,20%** |

### Nova função pura
```
anticipationFeeCents(amountCents, installments, overrides) -> cents
```
- `installments <= 1` → `round(amount × ANTICIP_AVISTA_PERCENT/100)` (1,15%).
- `installments >= 2` → `round(amount × (ANTICIP_PARCELADO_PERCENT/100) × (N+1)/2)`.
- Taxas configuráveis: `ANTICIP_AVISTA_PERCENT` (default 1.15), `ANTICIP_PARCELADO_PERCENT` (default 1.6).

### Integração nas funções existentes
- **`asaasFeeCents(method, amountCents, overrides)`** — passa a aceitar `overrides.installments`. Para `method === 'card'`, retorna `1,99%×amount + 0,49 + anticipationFeeCents(amount, installments)`. **Pix continua 0** (não recebe `installments`).
- **`buildSplit({ amountCents, sellerWalletId, method, chargeVaultlyFee, installments, overrides })`** — `gatewayCents` agora inclui a antecipação (via `asaasFeeCents` com `installments`). Com o toggle de repasse **desligado**, o vendedor absorve `vaultlyFee + asaasFee + antecipação` (já refletido porque o split envia `amount − vaultlyFee − gatewayCents`). Com o toggle **ligado**, o `amount` recebido já é o grossed-up e o vendedor recebe ~o preço cheio.
- **`cardChargeCents(priceCents, installments, overrides)`** — gross-up que cobre `pct (1,99%) + fixo (0,49) + antecipação(N)`. Como a antecipação é um % do **valor cobrado**, ela entra junto do `pct` no denominador:
  - `pctTotal = (ASAAS_CARD_PERCENT + anticipPercent(N)) / 100`, onde `anticipPercent(1)=1,15` e `anticipPercent(N≥2)=1,6×(N+1)/2`.
  - `cardChargeCents = ceil((priceCents + fixed) / (1 − pctTotal))`.
  - Arredonda p/ cima (vendedor nunca recebe a menos).

### Testes (TDD)
- `anticipationFeeCents`: 1x=1,15%, 2x=2,40%, 3x=3,20% (valores em centavos de um exemplo, ex.: R$100,00).
- `cardChargeCents` com `installments` 1/2/3: após a taxa do cartão + antecipação, o vendedor recebe ≈ preço cheio.
- `buildSplit` cartão com toggle on/off para 1x e 3x: líquido do vendedor correto.

---

## 3. Fluxo de checkout (parcelamento até 3x)

### `GET /api/checkout/:slug`
Além de `pix_cents`, `card_cents`, `pass_card_fee`, devolve uma lista `installments`:
```
installments: [
  { n: 1, total_cents, parcela_cents, label: "1x de R$X (a vista)" },
  { n: 2, total_cents, parcela_cents, label: "2x de R$Y" },
  { n: 3, total_cents, parcela_cents, label: "3x de R$Z" }
]
```
- **Toggle ligado** (e plano pago): `total_cents = cardChargeCents(price, n)` — cresce com `n`. `parcela_cents = ceil(total_cents / n)`.
- **Toggle desligado** ou plano Free sem repasse: `total_cents = price` para todo `n`; `parcela_cents = ceil(price / n)` (vendedor absorve a antecipação).
- **Mínimo por parcela:** só inclui o `n` se `parcela_cents >= MIN_PARCELA_CENTS` (default **500** = R$5,00). Sempre inclui ao menos `n=1`.
- Respeita `MAX_INSTALLMENTS` (default 3).
- Free / sem venda direta: a lista pode vir só com `n=1` (cartão à vista) ou vazia conforme o produto — mantém o comportamento atual de não gerar checkout pago pra Free.

### `checkout.html`
- Ao selecionar **Cartão**, mostra um seletor de parcelas (1x–3x) com os labels/valores vindos do GET; trocar a parcela atualiza o total exibido.
- **Pix:** sem parcelamento (inalterado).

### `POST /api/checkout/:slug`
- Passa a aceitar `installments` (inteiro 1–`MAX_INSTALLMENTS`); default 1.
- Valida: `1 <= installments <= MAX_INSTALLMENTS` e `parcela >= MIN_PARCELA_CENTS`; senão 400.
- Cobra `cardChargeCents(price, installments)` somente quando `pm === 'card' && acc.pass_card_fee_to_buyer && !isFreePlan` (mesma regra atual, agora com `installments`). Caso contrário cobra o preço base.

---

## 4. Integração Asaas

### Cobrança parcelada (`asaasService.js`)
- `buildChargePayload(d)` — quando `d.method === 'card'` e `d.installments >= 2`, monta `installmentCount: N` + `installmentValue` (valor de cada parcela) em vez de `value` único. Pix e cartão 1x seguem com `value` único.
- O **split** acompanha o líquido do vendedor (preço cheio com toggle ligado; preço − antecipação − taxas com toggle desligado).

### Antecipação automática na subconta
- Habilitar **antecipação automática** na subconta Asaas (config de conta, via API usando a apiKey da subconta — já guardada criptografada na Feature A).
- Acionada no **onboarding** (após criar a subconta) e exposta como ação reexecutável na aba Loja ("ativar recebimento rápido") caso falhe na primeira vez.
- Tratamento resiliente: se a antecipação ainda não estiver disponível/aprovada para a conta, **não quebra o checkout** — a venda ocorre com recebimento padrão e o vendedor é avisado.

> ⚠️ **Gates de validação (sandbox, https://docs.asaas.com):**
> - Endpoint/flag exato da **antecipação automática** (ex.: configuração da conta ou `POST` específico) e se exige aprovação prévia da subconta.
> - Payload de **cobrança parcelada** no cartão (`installmentCount` / `installmentValue`) e o retorno.
> - Como a antecipação aparece no **saldo** (impacta a Feature A: o saldo disponível passa a incluir o cartão antecipado mais cedo).

---

## 5. Taxa exibida ao vendedor

Atualizar `sellerFeesNote()` (texto já existente no painel) para refletir Vaultly + Asaas + antecipação:
- **Pix:** recebe na hora, sem taxa por venda.
- **Cartão à vista:** 1,99% + R$0,49 + 1,15% (antecipação).
- **Cartão parcelado:** + antecipação da tabela (2x +2,40%, 3x +3,20%), com recebimento rápido via antecipação automática.

Exibido como mini-tabela/nota. O card de taxas completo é a **Feature C** (fora de escopo aqui).

---

## 6. Variáveis de ambiente
- `ANTICIP_AVISTA_PERCENT` (default 1.15)
- `ANTICIP_PARCELADO_PERCENT` (default 1.6)
- `MAX_INSTALLMENTS` (default 3)
- `MIN_PARCELA_CENTS` (default 500)

---

## 7. Gating por plano
- Parcelamento + antecipação valem só para **planos pagos** (venda direta é exclusiva de assinantes). Free não gera checkout pago (inalterado).
- O gross-up só ocorre com `pass_card_fee_to_buyer` ligado E plano pago (regra atual, agora com `installments`).

---

## 8. Fora de escopo (YAGNI / próximas specs)
- **Feature C** — card informativo de taxas na aba pagamentos (consulta do usuário).
- **Feature D** — Termos de Uso com as tabelas de taxas + Asaas (nome/CNPJ) + ressalva "as taxas podem variar conforme o banco".
- Parcelamento acima de 3x.
- Antecipação sob demanda / parcial (escolhemos automática).

---

## 9. Critérios de sucesso
- O cartão (à vista e 2x/3x) cobra corretamente, com a antecipação somada na taxa publicada e no gross-up (quando o repasse está ligado).
- O comprador escolhe parcelas (1x–3x) no checkout e vê o total atualizar; o mínimo por parcela é respeitado.
- A cobrança parcelada é criada no Asaas com `installmentCount`/`installmentValue`; o split entrega o líquido correto ao vendedor.
- A antecipação automática é habilitada na subconta (ou o checkout segue sem quebrar caso ainda não esteja disponível).
- `pricing.js` tem testes cobrindo 1x/2x/3x e toggle on/off.
