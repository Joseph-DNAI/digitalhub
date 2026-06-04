# Spec — Botão de reativação da conta de recebimento (via suporte)

> Data: 2026-06-03
> Status: aprovado no brainstorming. Fecha um gap da Feature A (o aviso "reative" não tinha ação).

---

## 1. Contexto e decisão

O aviso de reativação (aba Loja, quando `has_payout_key === false`) não tinha botão. Reativação automática **não é viável**: o Asaas só entrega a apiKey da subconta na criação (não reexpõe), e apagar a subconta exige a própria apiKey que falta. Decisão: **botão que abre um chamado de suporte** (a equipe reativa manualmente regenerando a chave no Asaas), com uma explicação do porquê não é automático.

Reaproveita `POST /api/support/ticket` (já existe, `requireAuth`, anexa o tenant). **Sem backend novo.**

---

## 2. Frontend (`public/index.html`, `renderSellerActive`)

Trocar o bloco de aviso atual (`account.has_payout_key === false ? ... : ''`) por uma versão com título, explicação e botão:
- Título: "Saque automático indisponível nesta conta".
- Texto: explica que a conta foi criada antes do recurso; que o banco (Asaas) só fornece a chave de acesso da subconta uma única vez, na criação, e não a reexpõe; por isso a reativação é feita pela equipe, junto ao banco, **sem perder os dados de venda**.
- Botão `id="btn-reactivate"` → `requestSellerReactivation(this)`.

Nova função `requestSellerReactivation(btn)`:
- `POST /api/support/ticket` com `{ subject: 'Reativacao da conta de recebimento', message: <texto explicando o pedido p/ a equipe> }`.
- Sucesso → toast + botão vira "Pedido enviado" (desabilitado).
- Erro → toast + reabilita o botão.

---

## 3. Fora de escopo
- Reativação automática (regenerar apiKey / apagar subconta) — inviável sem setup operacional no Asaas.
- Mudança de backend (reusa o endpoint de chamado existente).

## 4. Critérios de sucesso
- O aviso só aparece com `has_payout_key === false` e agora traz a explicação + botão.
- O botão cria um chamado de suporte (visível na caixa do admin) e confirma o envio.
- `node --check` no script do `index.html` passa.
