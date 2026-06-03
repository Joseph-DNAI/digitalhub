# Feature D — Termos com tabela de taxas + Asaas + ressalva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma seção "Taxas da venda direta" em `/termos` com as tabelas de taxas, o processador/custódia (Asaas + CNPJ) e a ressalva de variação — só informativo (sem re-aceite).

**Architecture:** Edição estática de `public/termos.html` (3 alterações: link no índice, nova `<section id="taxas">`, data do topo). Sem backend, sem banco, sem cálculo. O script de realce por scroll já é genérico (pega todos `.toc-link`), então não muda.

**Tech Stack:** HTML/CSS/JS estático em `public/termos.html`.

---

## Task 1: Seção de taxas em termos.html

**Files:**
- Modify: `public/termos.html`

- [ ] **Step 1: Link no índice (TOC)**

Em `public/termos.html`, no `<aside class="toc">`, após a linha do link de Responsabilidade, adicionar o novo link. Trocar:
```html
    <a href="#responsabilidade" class="toc-link">Termo de Responsabilidade</a>
  </aside>
```
por:
```html
    <a href="#responsabilidade" class="toc-link">Termo de Responsabilidade</a>
    <a href="#taxas" class="toc-link">Taxas da venda direta</a>
  </aside>
```

- [ ] **Step 2: Nova seção `<section id="taxas">`**

Inserir a nova seção logo após o fechamento da seção de Responsabilidade e antes do `</main>`. Trocar:
```html
      <div class="box"><p>Ao criar uma conta na Vaultly, você declara ter lido e concordado com os <strong>Termos de Uso</strong>, a <strong>Política de Privacidade</strong> e este <strong>Termo de Responsabilidade</strong>.</p></div>
    </section>

  </main>
```
por:
```html
      <div class="box"><p>Ao criar uma conta na Vaultly, você declara ter lido e concordado com os <strong>Termos de Uso</strong>, a <strong>Política de Privacidade</strong> e este <strong>Termo de Responsabilidade</strong>.</p></div>
    </section>

    <!-- TAXAS DA VENDA DIRETA -->
    <section id="taxas">
      <h2><i class="ti ti-receipt-2"></i> Taxas da venda direta</h2>
      <div class="updated">Versão 2026-06-03</div>

      <p>As taxas abaixo se aplicam às vendas feitas pelo <strong>checkout próprio da Vaultly</strong> (venda direta) e são diferentes da assinatura do seu plano. Os valores são debitados no momento da venda.</p>

      <h3>1. Tabela de taxas</h3>
      <ul>
        <li><strong>Pix:</strong> sem taxa por venda — você recebe o valor cheio, na hora.</li>
        <li><strong>Cartão à vista (1x):</strong> 1,99% + R$0,49 (processamento) + 1,15% (antecipação automática).</li>
        <li><strong>Cartão 2x:</strong> 1,99% + R$0,49 + 2,40% (antecipação).</li>
        <li><strong>Cartão 3x:</strong> 1,99% + R$0,49 + 3,20% (antecipação).</li>
        <li><strong>Taxa Vaultly:</strong> R$0,10 + 1,49% por venda — cobrada <strong>somente no plano Free</strong>; nos planos pagos a assinatura cobre e você é isento.</li>
      </ul>
      <p>Se você ativar a opção <strong>"repassar a taxa do cartão ao comprador"</strong>, a taxa do cartão é embutida no valor pago pelo comprador e você recebe o preço cheio. No Pix, nada muda.</p>

      <h3>2. Processamento e custódia dos valores</h3>
      <div class="box"><p>O processamento dos pagamentos, a custódia e o repasse dos valores das vendas são realizados pela instituição de pagamento <strong>Asaas Gestão Financeira Instituição de Pagamento S.A.</strong>, inscrita no CNPJ <strong>19.540.550/0001-21</strong>, autorizada a funcionar pelo Banco Central do Brasil. A Vaultly não retém nem custodia os valores das vendas; atua apenas como ferramenta de checkout e entrega.</p></div>

      <h3>3. Variação das taxas</h3>
      <div class="box"><p>As taxas de processamento e de antecipação são definidas pela instituição de pagamento e <strong>podem variar</strong> conforme ajustes do banco e do mercado. A versão vigente publicada nesta página prevalece.</p></div>
    </section>

  </main>
```

- [ ] **Step 3: Data do topo (hero)**

Trocar a linha de data no `<section class="hero">`:
```html
  <p>Última atualização: 29 de maio de 2026 · versão 2026-05-29</p>
```
por:
```html
  <p>Última atualização: 3 de junho de 2026 · versão 2026-06-03</p>
```

- [ ] **Step 4: Verificar**

(a) Confirmar que a âncora e o link existem:
```bash
node -e "const h=require('fs').readFileSync('public/termos.html','utf8'); const ok = h.includes('id=\"taxas\"') && h.includes('href=\"#taxas\"') && h.includes('19.540.550/0001-21') && h.includes('versão 2026-06-03'); console.log(ok ? 'CONTENT_OK' : 'FALTANDO'); process.exit(ok?0:1);"
```
Expected: `CONTENT_OK`.

(b) Validar o script inline (não quebrou o HTML/JS):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('public/termos.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,a='';while((m=re.exec(h))){a+='\n;{\n'+m[1]+'\n};\n';}fs.writeFileSync('_sc.js',a);" && node --check _sc.js && echo OK && rm -f _sc.js
```
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add public/termos.html
git commit -m "feat: termos — secao de taxas da venda direta (Pix/cartao + Asaas + ressalva)"
```
End the commit message body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

- [ ] **Step 6:** Seguir `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**Spec coverage:**
- §2.1 link no TOC → Step 1. ✅
- §2.2 nova seção com tabela de taxas, nota de repasse, box do Asaas (nome/CNPJ), box da ressalva → Step 2. ✅
- §2.3 data do topo (informativa; sem mexer no `terms_version`) → Step 3. ✅
- §4 critérios (seção presente, link no menu, realce por scroll inalterado, data atualizada, script válido) → Step 4. ✅

**Placeholder scan:** sem TBD; todo o HTML está completo e literal.

**Type consistency:** âncora `#taxas` (Step 1) ↔ `id="taxas"` (Step 2); classes `.box`/`.updated`/`<h2>`/`<h3>`/`<ul>` já existem na página (sem CSS novo). CNPJ `19.540.550/0001-21` e "versão 2026-06-03" usados de forma consistente no conteúdo e na verificação (Step 4). ✅

**Gaps conhecidos (aceitos):**
- Mudança puramente informativa — `terms_version` do banco não muda (decisão da spec; sem re-aceite).
