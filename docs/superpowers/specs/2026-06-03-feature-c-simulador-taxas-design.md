# Spec — Feature C: Simulador de taxas/recebimento no painel

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do projeto maior: venda direta. Specs irmãs: **A** (saque automático, em produção), **B** (antecipação + parcelamento, em produção), **D** (Termos de Uso, futura). Esta é a **Feature C**.

---

## 1. Objetivo

Dar ao vendedor um **simulador interativo** na aba Loja para consultar, a partir de um valor de venda, quanto ele recebe e quanto o comprador paga em cada método (Pix, cartão 1x/2x/3x), comparando os dois cenários: **sem repasse** (vendedor absorve as taxas) e **com repasse** (comprador paga, vendedor recebe o preço cheio). A conta reusa o `pricing.js` (mesma matemática do checkout), evitando divergência.

---

## 2. Matemática — `feeSimulation` (puro, em `src/services/pricing.js`)

Nova função pura `feeSimulation(amountCents, overrides)`. Assume **plano pago** (venda direta é exclusiva de assinantes → sem taxa Vaultly). Itera o cartão de 1 até `MAX_INSTALLMENTS` (default 3).

Retorno:
```
{
  amount_cents,
  pix: { seller_cents },          // = amountCents (Pix sem taxa por venda)
  card: [
    {
      n,
      sem_repasse_seller_cents,   // amountCents - asaasFeeCents('card', amountCents, {installments:n})
      com_repasse_buyer_cents,    // cardChargeCents(amountCents, n)
      com_repasse_seller_cents    // liquido do vendedor na cobranca com gross-up (via buildSplit)
    }
    // ... n = 1..MAX_INSTALLMENTS
  ]
}
```

Definições (em centavos, inteiros):
- `pix.seller_cents = amountCents`.
- `sem_repasse_seller_cents = amountCents − asaasFeeCents('card', amountCents, { installments: n })`. A `asaasFeeCents` (Feature B) já soma cartão 1,99%+R$0,49 + antecipação(n). Travar em `Math.max(0, ...)`.
- `com_repasse_buyer_cents = cardChargeCents(amountCents, n)`.
- `com_repasse_seller_cents` = líquido do vendedor na cobrança grossed-up. Derivar do `buildSplit({ amountCents: com_repasse_buyer_cents, sellerWalletId: 'sim', method: 'card', chargeVaultlyFee: false, installments: n })`: pegar `fixedValue` (em reais) e converter para centavos (`Math.round(fixedValue * 100)`). Será ≈ `amountCents` (arredondamento a favor do vendedor).

Exportar `feeSimulation` no `module.exports`.

### Testes (TDD)
- `feeSimulation(10000)`: `pix.seller_cents === 10000`.
- `card` tem `MAX_INSTALLMENTS` itens (3 por default), com `n` = 1,2,3.
- Para cada `n`: `sem_repasse_seller_cents < amountCents` (taxa descontada) e `com_repasse_buyer_cents > amountCents` (gross-up).
- `com_repasse_seller_cents >= amountCents` (vendedor recebe ao menos o preço cheio) e `<= amountCents + 2` (arredondamento de poucos centavos).
- `sem_repasse_seller_cents` decresce conforme `n` aumenta (mais antecipação); `com_repasse_buyer_cents` cresce com `n`.

---

## 3. Endpoint — `GET /api/seller/fee-simulator`

Em `src/routes/seller.js`, com `requireAuth`:
- Query: `amount_cents` (inteiro).
- Validação: `Number.isInteger(amount)` E `amount >= MIN` (`DIRECT_MIN_PRICE_CENTS`, default 900) E `amount <= 100000000` (R$1.000.000, trava de abuso). Inválido → 400 `{ success:false, error }`.
- Resposta: `{ success: true, simulation: feeSimulation(amount) }`.
- Stateless: não carrega a conta nem depende do toggle (mostramos os dois cenários sempre). Sem I/O de banco.
- Erro inesperado → 500 padrão (log + mensagem genérica), seguindo o padrão dos outros handlers do arquivo.

---

## 4. Frontend — card simulador (aba Loja, `public/index.html`)

Em `renderSellerActive(body, account)`, após o `sellerFeesNote()`, adicionar um card "Simulador de recebimento":
- **Input** "Valor da venda" (`id="sim-amount"`), default `R$ 100,00`, `inputmode` numérico, com formatação simples (centavos).
- Texto curto: "Veja quanto você recebe e quanto o comprador paga em cada forma de pagamento."
- Container `id="sim-result"` para a tabela/estados.

Comportamento (JS isolado):
- `loadFeeSimulator()` — lê o input, converte para `amount_cents`, faz `GET /api/seller/fee-simulator?amount_cents=X` (via `apiFetch`), e chama `renderFeeSimulator(data.simulation)`. Mostra "Carregando..." enquanto busca e "Não foi possível simular agora." em erro.
- Disparo: ao renderizar a aba Loja (chamar `loadFeeSimulator()` uma vez com o default) e no `input` do campo com **debounce ~400ms**.
- `renderFeeSimulator(sim)` — monta a tabela de 2 colunas:

```
Venda de R$ X

Metodo     | Sem repasse (voce recebe) | Com repasse (comprador paga -> voce recebe)
Pix        | R$ ...                    | R$ ... (mesmo valor; Pix nao tem repasse)
Cartao 1x  | R$ ...                    | R$ ... -> R$ ...
Cartao 2x  | R$ ...                    | R$ ... -> R$ ...
Cartao 3x  | R$ ...                    | R$ ... -> R$ ...
```
- Linha do Pix: a coluna "com repasse" repete o valor do Pix (não há gross-up no Pix).
- Nota curta: "Pix: recebe na hora, sem taxa. Cartão: recebimento rápido via antecipação automática. Valores ilustrativos; as taxas do banco podem variar."

Formatação de moeda reusa o padrão do arquivo (`(cents/100).toFixed(2).replace('.', ',')`).

Verificação: extrair os `<script>` inline do `index.html` + `node --check`.

---

## 5. Fora de escopo (YAGNI)
- Persistir/registrar simulações.
- Considerar o toggle real da loja (mostramos sempre os dois cenários).
- Parcelas acima de `MAX_INSTALLMENTS`.
- **Feature D** (Termos de Uso) — spec própria.

---

## 6. Critérios de sucesso
- O vendedor digita um valor na aba Loja e vê, para Pix e cartão 1x/2x/3x, quanto recebe (sem repasse) e quanto o comprador paga / ele recebe (com repasse).
- Os números batem com o checkout (mesma origem: `pricing.js`).
- `feeSimulation` tem testes cobrindo Pix, os dois cenários e o crescimento por parcela.
- Entrada inválida no endpoint retorna 400; o card trata carregando/erro.
