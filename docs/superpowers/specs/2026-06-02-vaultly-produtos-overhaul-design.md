# Spec — Reestruturação do Cadastro de Produtos da Vaultly

> Data: 2026-06-02
> Status: aprovado no brainstorming, aguardando revisão final do usuário
> Tópico: cadastro de produto padrão Vaultly, modelo ativo/inativo com limite por plano, botão "Importar produtos" e import por CSV com seleção

---

## 1. Objetivo

Tornar o cadastro de produtos mais claro e flexível:

- **Cadastro padrão é venda direta pela Vaultly** (para planos pagos); o vínculo com Kiwify/Yampi vira opção.
- **Limite do plano passa a contar produtos ATIVOS**, não o total cadastrado. O usuário pode cadastrar muitos produtos (até um teto global) e ativar quantos o plano permitir.
- **Botão único "Importar produtos"** consolida Kiwify, Yampi e um novo **import por CSV com seleção** (lista com checkboxes).

### Problema atual
Ao criar um produto novo, não há opção de cadastrá-lo como venda direta — só dá pra configurar venda depois, via "Vender" no card, o que confunde. E o limite do plano bloqueia o cadastro pelo total, não pela quantidade em uso.

---

## 2. Modelo ativo/inativo + limites

### Conceito
- O campo **`status`** dos produtos (`active` | `inactive`, **já existe**) vira o liga/desliga de uso.
  - `active`: no ar — entregando (automação, casa webhooks) e/ou vendendo (checkout no ar).
  - `inactive`: cadastrado, mas desligado (não entrega, não vende, checkout fora do ar).
- **Limite do plano (`max_products`)** passa a significar **máximo de produtos ATIVOS** simultâneos:
  - Free=1, Starter=2, Basic=5, Pro=-1 (ilimitado), Business=-1 (ilimitado).
- **Teto global anti-abuso:** **100 produtos cadastrados** (ativos + inativos) por tenant. Constante `MAX_PRODUCTS_TOTAL=100`.

### Regras
- **Ao cadastrar um produto:**
  - Se a contagem de **ativos < limite do plano** → nasce **`active`**.
  - Senão → nasce **`inactive`**, com aviso ("limite de ativos do plano atingido — produto cadastrado como inativo").
- **Ao ativar** um produto inativo:
  - Se ativos < limite do plano (ou ilimitado) → ativa.
  - Senão → bloqueia (HTTP 403) com `needs_upgrade: true` e mensagem de upgrade.
- **Desativar** é sempre permitido.
- **No teto global (100):** ao tentar cadastrar um novo produto:
  - Identifica o produto **inativo há mais tempo** (status='inactive', menor `created_at`).
  - Retorna um aviso pedindo confirmação: "Você atingiu 100 produtos. O produto _X_ (inativo desde _data_) será apagado para liberar espaço. Confirmar?"
  - Com a confirmação (flag no request), apaga o mais antigo inativo e cria o novo.
  - **Se não houver nenhum inativo** (todos os 100 ativos — só possível em planos ilimitados) → bloqueia (HTTP 409) pedindo desativar/apagar algum manualmente.

### Mudança no middleware
- `requirePlanLimit('product')` (em `src/middleware/auth.js`) **deixa de bloquear por total**. A criação passa a validar:
  1. Teto global (100) com lógica de eviction.
  2. Define `status` inicial conforme o limite de ativos.
  - A checagem de limite de ATIVOS é aplicada na **ativação** (toggle e no momento do cadastro para decidir `active` vs `inactive`), não como bloqueio de criação.

---

## 3. Cadastro de produto (modal) adaptativo por plano

O modal de "Novo produto" passa a ser sensível ao plano (via `currentUser.plan_id`) e ao onboarding:

- **Plano pago:** seção de **venda direta** (preço, Pix/cartão) aparece como **padrão** no topo do modal, além dos campos básicos (nome, descrição, arquivo) e do vínculo opcional Kiwify/Yampi.
  - Se o usuário ainda **não** tem conta de recebimento ativa, os campos de venda aparecem mas, ao salvar com venda ligada, o sistema responde `needs_onboarding` e orienta a ativar a conta na aba Config (comportamento já existente em `/selling`).
- **Plano Free:** o modal mostra **só os campos básicos + vínculo Kiwify/Yampi** (automação). **Sem campos de checkout** (sem preço/Pix/cartão). Mantém o gate de venda direta que já existe (Free não cria subconta).

A configuração de venda no cadastro reaproveita a mesma lógica do endpoint `PUT /api/products/:id/selling` (preço mínimo R$9, slug = código aleatório, etc.). Na prática, o fluxo de criação pode: (a) criar o produto, depois (b) aplicar a config de venda — ou um endpoint de criação que já aceita os campos de venda. Ver Seção 6 (arquitetura).

---

## 4. Botão "Importar produtos"

- Um botão único **"Importar produtos"** na aba Produtos abre um menu/modal com três opções:
  - **Importar da Kiwify** (fluxo existente)
  - **Importar da Yampi** (fluxo existente)
  - **Importar de CSV** (novo — Seção 5)
- Consolida a UI de import que hoje está espalhada, deixando o **"Novo produto"** como ação primária separada.

---

## 5. Importar de CSV com seleção

### Fluxo
1. Usuário clica "Importar de CSV" → escolhe um arquivo `.csv`.
2. O CSV é **lido e parseado no navegador** (FileReader + parse em JS) — **não sobe arquivo pro servidor**.
3. Mostra uma **lista com checkboxes** dos produtos encontrados (nome, preço, descrição), todos marcados por padrão.
4. Usuário desmarca os que não quer → clica "Importar selecionados".
5. Os selecionados são enviados como **JSON** (array) para `POST /api/products/bulk`.

### Formato do CSV
- Colunas esperadas (cabeçalho na 1ª linha): **`nome,preco,descricao`**.
  - `nome` (obrigatório), `preco` (opcional, em reais ex: `27,00` ou `27.00`), `descricao` (opcional).
- Um **modelo/exemplo** é oferecido para download (link "baixar modelo" gera um CSV de exemplo no próprio navegador).
- **Sem arquivo PDF** no CSV — produtos entram sem arquivo; o PDF é enviado depois, por produto (opção combinada no brainstorming).
- Parsing tolera campos entre aspas e o separador `,` (e idealmente `;`, comum no Excel pt-BR).

### Regras de import
- Cada produto importado respeita o **teto global (100)** e o **limite de ativos** (nasce ativo se houver espaço, senão inativo).
- Se a importação selecionada estourar o teto global, importa até onde der e avisa quantos não couberam (sem eviction automática no bulk, para não apagar em massa sem clareza).
- Preço só se aplica a planos pagos (vira `price_cents`); no Free, o preço é ignorado (sem venda direta).

---

## 6. Arquitetura e componentes

### Backend (`src/`)
- **`src/models/database.js`** — model `products`:
  - `count(tenantId)` já existe (total). Adicionar `countActive(tenantId)` (status='active') e `findOldestInactive(tenantId)`.
  - `create` aceita `status` inicial e os campos de venda (sellable, price_cents, slug, checkout_*).
- **`src/routes/products.js`**:
  - `POST /` (criar) — nova lógica: teto global + eviction (com flag de confirmação `confirm_evict`), define `status` inicial conforme limite de ativos, aplica campos de venda quando plano pago.
  - `PUT /:id/status` (ou reusar `PUT /:id`) — toggle ativo/inativo com checagem do limite de ativos na ativação.
  - `POST /bulk` — cria vários produtos a partir do array JSON (nome/preco/descricao), aplicando teto e limite de ativos; retorna criados + ignorados.
  - Mantém `PUT /:id/selling` (config de venda por produto).
- **`src/middleware/auth.js`** — `requirePlanLimit('product')` deixa de bloquear criação por total (a lógica de limite migra para a rota de criação/ativação). Pode ser simplificado ou removido do POST de produtos.

### Frontend (`public/index.html`)
- **Modal "Novo produto"** — adaptativo por plano (Seção 3): mostra/oculta a seção de venda direta.
- **Botão "Importar produtos"** + menu (Kiwify/Yampi/CSV).
- **Import CSV** — parse client-side, lista com checkboxes, POST para `/bulk`.
- **Aba Produtos** — abas/filtro **Ativos / Inativos**, contador "X/Y ativos", toggle de ativação por card, e tratamento dos avisos (limite de ativos, eviction no teto, upgrade).

### Decisões de design
- **CSV parseado no cliente** (sem upload + sem dependência nova de parser no servidor). O servidor recebe JSON limpo.
- **`status` reaproveitado** como flag ativo/inativo — sem coluna nova; já é usado no casamento de webhooks (`findByPlatformId` filtra `status='active'`), o que é coerente: produto inativo não entrega nem vende.
- **Eviction só de inativos e só na criação unitária** (não no bulk), com confirmação explícita — evita perda acidental de dados.

---

## 7. Gating por plano (consolidado)

| | Free | Starter | Basic | Pro | Business |
|---|---|---|---|---|---|
| Cadastrar produto (automação) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Campos de venda direta no cadastro | — | ✅ | ✅ | ✅ | ✅ |
| Máx. produtos **ativos** | 1 | 2 | 5 | ∞ | ∞ |
| Teto global cadastrados | 100 | 100 | 100 | 100 | 100 |
| Importar CSV | ✅ | ✅ | ✅ | ✅ | ✅ |

(Venda direta segue exigindo conta de recebimento ativa — Free não cria subconta.)

---

## 8. Fora de escopo (YAGNI)
- Upload de PDF dentro do CSV/bulk (arquivo entra depois, por produto).
- Import por XML (CSV cobre o caso; XML descartado).
- Eviction automática no import em massa.
- Reordenação/priorização manual de quais ativos contam no limite (é só contagem simples de `status='active'`).
- Agendamento de ativação/desativação.

---

## 9. Critérios de sucesso
- Plano pago cria produto já como venda direta pela Vaultly, em um fluxo.
- Free cria produto de automação (Kiwify/Yampi) sem ver campos de checkout.
- Usuário cadastra mais produtos que o limite do plano, ativando só os permitidos; vê Ativos/Inativos separados com contador.
- Import CSV mostra lista com seleção e importa só os marcados.
- No teto de 100, novo cadastro descarta o inativo mais antigo (com confirmação), ou bloqueia se não houver inativos.
