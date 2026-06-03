# Spec — Feature D: Termos de Uso com tabela de taxas + Asaas + ressalva

> Data: 2026-06-03
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Parte do projeto maior: venda direta. Specs irmãs: **A** (saque automático), **B** (antecipação + parcelamento), **C** (simulador) — todas implementadas. Esta é a **Feature D**, a última da série.

---

## 1. Objetivo

Documentar nos Termos (`public/termos.html`, rota `/termos`) as **taxas da venda direta** (Pix, cartão à vista e parcelado com antecipação, taxa Vaultly no Free), deixar explícito que a **instituição de pagamento Asaas** (nome + CNPJ) processa e custodia os valores, e incluir a **ressalva** de que as taxas podem variar conforme o banco. Mudança **somente informativa** — sem re-aceite (não mexe em `terms_version`).

---

## 2. Onde e como

Arquivo único: `public/termos.html`. Três alterações, no estilo visual já existente (mesmo padrão de `<h2>/<h3>/<ul>/.box` das outras seções; sem CSS novo).

### 2.1 TOC (menu lateral) — novo link
Em `<aside class="toc">` (após o link `#responsabilidade`), adicionar:
```html
    <a href="#taxas" class="toc-link">Taxas da venda direta</a>
```
O script de scroll já seleciona todos `.toc-link` e suas seções por âncora — funciona sem mexer no JS.

### 2.2 Nova seção `<section id="taxas">`
Inserir **entre** o fechamento `</section>` do "Termo de Responsabilidade" (linha ~205) e o `</main>` (linha ~207). Conteúdo:

- Cabeçalho: `<h2><i class="ti ti-receipt-2"></i> Taxas da venda direta</h2>` + `<div class="updated">Versão 2026-06-03</div>`.
- Parágrafo introdutório: explica que estas taxas se aplicam ao **checkout próprio da Vaultly** (venda direta), distinto da assinatura do plano.
- **Tabela de taxas** (como `<ul>`, padrão da página):
  - **Pix:** sem taxa por venda; o vendedor recebe o valor cheio, na hora.
  - **Cartão à vista (1x):** 1,99% + R$0,49 (processamento) + 1,15% (antecipação automática).
  - **Cartão 2x:** 1,99% + R$0,49 + 2,40% (antecipação).
  - **Cartão 3x:** 1,99% + R$0,49 + 3,20% (antecipação).
  - **Taxa Vaultly:** R$0,10 + 1,49% por venda — cobrada **somente no plano Free**; planos pagos são isentos (a assinatura cobre).
- Nota sobre repasse (`<p>`): quando o vendedor ativa "repassar a taxa do cartão ao comprador", a taxa do cartão é embutida no valor pago pelo comprador, e o vendedor recebe o preço cheio; no Pix nada muda.
- **Box (custódia/processador):**
  > "O processamento dos pagamentos, a custódia e o repasse dos valores das vendas são realizados pela instituição de pagamento **Asaas Gestão Financeira Instituição de Pagamento S.A.**, inscrita no CNPJ **19.540.550/0001-21**, autorizada a funcionar pelo Banco Central do Brasil. A Vaultly não retém nem custodia os valores das vendas; atua apenas como ferramenta de checkout e entrega."
- **Box (ressalva de variação):**
  > "As taxas de processamento e de antecipação são definidas pela instituição de pagamento e **podem variar** conforme ajustes do banco e do mercado. A versão vigente publicada nesta página prevalece."

### 2.3 Data do topo
No `<section class="hero">`, atualizar a linha de data (atual: "Última atualização: 29 de maio de 2026 · versão 2026-05-29") para **3 de junho de 2026 · versão 2026-06-03**. É a data informativa da página — não é o `terms_version` do banco (que não muda).

---

## 3. Fora de escopo (YAGNI)
- Bump de `terms_version` / fluxo de re-aceite (decidido: só informativo).
- Cláusula extra no Termo de Responsabilidade (a seção dedicada já cobre).
- Qualquer mudança de backend, banco ou cálculo (os números espelham o que o `pricing.js` já aplica; aqui é texto).

---

## 4. Critérios de sucesso
- `/termos` passa a ter uma seção "Taxas da venda direta" com as tabelas (Pix, cartão 1x/2x/3x, taxa Vaultly no Free), o nome+CNPJ do Asaas como processador/custódia, e a ressalva de variação.
- O link aparece no menu lateral e o realce por scroll funciona (sem alterar o JS).
- A data do topo reflete a atualização; `terms_version` (banco) inalterado.
- `node --check` no script inline do `termos.html` passa (sem quebrar o HTML/JS).

---

## 5. Dados confirmados
- Asaas: **Asaas Gestão Financeira Instituição de Pagamento S.A.**, CNPJ **19.540.550/0001-21** (confirmado pelo usuário).
