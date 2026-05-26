# Respostas Conceituais — CaseCellShop

---

## Pergunta 1 — Diagnóstico e trade-offs

### Problema 01 — Performance da Vitrine

**Causa raiz**
A loja consulta o ERP de forma síncrona a cada carregamento de página. O ERP é um monolito legado que não foi projetado para escala web — cada query passa por camadas de negócio (financeiro, contábil) que não são necessárias para exibir um produto na vitrine. O tempo de resposta piora sob carga porque o banco MySQL do ERP não tem índices ou caches voltados para consultas de e-commerce.

**Impacto**
- Cliente: abandono de página nos primeiros segundos (estudos mostram abandono acima de 3 s).
- Negócio: conversão cai diretamente com o tempo de carregamento; escalabilidade impossível sem resolver o gargalo.

**Caminhos possíveis**

| Caminho | Como funciona | Trade-offs |
|---------|--------------|-----------|
| Cache de leitura (Redis/Memcached) | A loja consulta o cache; um worker sincroniza com o ERP periodicamente | Simples de implementar; dados podem estar defasados por minutos |
| Banco próprio da loja (read replica) | Replica os dados do ERP em um banco dedicado à loja via ETL/CDC | Dados mais frescos; exige pipeline de sincronização |

**Prioridade:** Cache de leitura. É o menor risco e pode ser entregue em dias. A defasagem de minutos é aceitável para catálogo de produtos; estoque tem controle próprio (Problema 02).

---

### Problema 02 — Consistência de Estoque

**Causa raiz**
O fluxo clássico com race condition: dois requests concorrentes leem `stock = 1`, ambos validam `>= quantidade`, ambos decrementam. O MySQL do ERP não está sendo consultado com `SELECT ... FOR UPDATE` ou similar, e a loja não tem controle transacional próprio.

**Impacto**
- Cliente: compra confirmada sem produto disponível, gerando cancelamento e frustração.
- Negócio: prejuízo financeiro (diferença de custo, logística reversa), risco de reputação.

**Caminhos possíveis**

| Caminho | Como funciona | Trade-offs |
|---------|--------------|-----------|
| UPDATE atômico com condição | `UPDATE products SET stock = stock - N WHERE stock >= N` — só uma transação ganha | Sem locks distribuídos; simples; funciona em único nó DB |
| Reserva pessimista com fila | Fila serializa pedidos; um worker processa um por vez | Elimina concorrência mas introduz latência e complexidade de fila |

**Prioridade:** UPDATE atômico. Resolve o problema no banco com uma linha de SQL, sem infraestrutura adicional. Este projeto implementa exatamente essa abordagem em `ProductRepository.decrementStock`.

---

### Problema 03 — Resiliência do Checkout

**Causa raiz**
O faturamento no ERP é síncrono e lento (operações contábeis, geração de NF). A loja espera a resposta na mesma requisição HTTP, que sofre timeout no gateway ou no cliente antes do ERP terminar.

**Impacto**
- Cliente: perde a compra mesmo com pagamento autorizado (ou pior, é cobrado sem ter pedido confirmado).
- Negócio: pedidos em estado inconsistente, suporte manual, retrabalho.

**Caminhos possíveis**

| Caminho | Como funciona | Trade-offs |
|---------|--------------|-----------|
| Checkout assíncrono com fila | A loja aceita o pedido (201 Accepted), publica em fila, retorna status "em processamento" | Desacopla ERP; exige polling/webhook no front; UX de confirmação muda |
| Timeout curto + retry automático | Mantém sincronia mas com timeout agressivo e retry com idempotência | Simples; mas ERP lento continua sendo gargalo sob carga |

**Prioridade:** Checkout assíncrono. A fila isola completamente a loja do ERP. O cliente recebe confirmação imediata, e o faturamento acontece em background. Este projeto simula o comportamento com `simulateERP()` (3 s de delay + 10% de falha).

---

## Pergunta 2 — Arquitetura Alvo Incremental

### Componentes Principais

```
┌─────────────────────────────────────────────────────┐
│  CLIENTE (React SPA)                                │
│  Vitrine · Carrinho · Checkout · Status do Pedido   │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│  API GATEWAY / BFF (Node.js + Express)              │
│  Auth · Rate Limit · Roteamento                     │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
┌──────▼──────┐   ┌───────────▼──────────┐
│  Cache      │   │  Banco Próprio Loja   │
│  (Redis)    │   │  (PostgreSQL)         │
│  Catálogo   │   │  Pedidos · Estoque    │
│  TTL 5 min  │   │  Idempotência         │
└─────────────┘   └───────────┬──────────┘
                               │ Fila de eventos
                    ┌──────────▼──────────┐
                    │  Message Broker      │
                    │  (RabbitMQ/BullMQ)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Worker ERP          │
                    │  Integração assínc.  │
                    └──────────┬──────────┘
                               │ API REST
                    ┌──────────▼──────────┐
                    │  ERP Central         │
                    │  (MySQL — read-only) │
                    └─────────────────────┘
```

### Fluxo por jornada

**Catálogo:** Cliente → API → Redis (hit em <10ms) | miss → ERP → preenche Redis → responde.

**Estoque:** Consulta no banco próprio da loja (espelho do ERP, atualizado a cada N minutos por um job de sincronização). Lock atômico no checkout via `UPDATE ... WHERE stock >= qty`.

**Checkout:**
1. Loja valida entrada e decrementa estoque atomicamente no banco próprio.
2. Publica evento `order.created` na fila.
3. Retorna `202 Accepted` com `orderId` para o cliente.
4. Worker consome a fila, chama o ERP para faturamento.
5. Worker atualiza o status do pedido no banco da loja.
6. Cliente faz polling em `GET /orders/:id` ou recebe notificação via WebSocket.

### Sincronização Loja ↔ ERP

- **Catálogo/Preços:** Job agendado (cron) a cada 5–10 min lê o MySQL do ERP (acesso de leitura disponível) e atualiza Redis + banco da loja.
- **Estoque:** Mesmo job, com reconciliação a cada minuto para o estoque. Em caso de divergência (ERP tem menos do que a loja), o banco da loja é corrigido para baixo e alertas são disparados.
- **Pedidos:** Worker confirma com o ERP e atualiza status. Se o ERP rejeitar, o worker executa a transação compensatória (incrementa estoque de volta).

### Plano de 30–90 dias

| Período | Entregas |
|---------|---------|
| **0–30 dias** | Banco próprio (PostgreSQL), API de checkout com lock atômico, idempotência, simulação ERP. Cache Redis para catálogo. |
| **31–60 dias** | Job de sincronização estoque/catálogo. Worker assíncrono com fila BullMQ. Endpoint de status do pedido. |
| **61–90 dias** | Circuit breaker no worker (se ERP indisponível, acumula na fila). Alertas de divergência de estoque. Dashboard básico de pedidos. |

---

## Pergunta 3 — Estoque, Concorrência e Idempotência

### Como a solução evita venda duplicada

Usamos um **UPDATE atômico com condição** no banco de dados:

```sql
UPDATE products
SET stock = stock - $quantidade
WHERE id = $productId AND stock >= $quantidade
```

O banco de dados garante que apenas uma transação vence quando dois pedidos concorrentes competem pela última unidade. Se `rowCount = 0`, o estoque era insuficiente — não há race condition possível porque o decremento e a validação acontecem na mesma operação atômica.

### Reserva de estoque

Nesta implementação, **não há reserva explícita com expiração** — o estoque é decrementado definitivamente no momento do checkout. Se o ERP falhar depois, uma **transação compensatória** (incremento relativo) restaura o estoque:

```sql
UPDATE products SET stock = stock + $quantidade WHERE id = $productId
```

O uso de incremento relativo (não valor absoluto) garante que operações concorrentes não se interfiram durante o rollback.

Em uma versão futura, poderíamos adicionar uma tabela de reservas com TTL (ex.: 15 minutos) para o modelo de carrinho abandonado. A reserva seria criada ao adicionar ao carrinho e confirmada ou revertida ao finalizar/expirar.

### Como o checkout lida com retry, timeout e duplo clique

- **Duplo clique:** O frontend desabilita todos os botões imediatamente ao iniciar o processamento (`processingId !== null`). A UI não permite uma segunda requisição enquanto a primeira está em andamento.
- **Retry seguro:** A chave de idempotência é gerada por tentativa de checkout (estável para retentativas, renovada após sucesso). Assim, se a rede cair e o usuário tentar de novo, a mesma chave é enviada e o backend devolve a resposta cacheada sem processar duas vezes.
- **Timeout do ERP:** O ERP é chamado de forma simulada com delay de 3 s. Em produção, o checkout seria assíncrono: a loja responde imediatamente e o ERP é chamado pelo worker. O cliente não fica esperando o ERP.

### Como a idempotência evita pedidos duplicados

O header `Idempotency-Key` é verificado antes de processar o checkout:

1. Se a chave existe no banco → devolve a resposta cacheada (sem processar).
2. Se não existe → processa e salva `(key, status, response_body)` ao concluir com sucesso.
3. Chaves de erro **não são cacheadas** — o cliente pode tentar novamente com a mesma chave.

A chave é gerada no frontend quando o usuário inicia a tentativa de compra (não a cada clique). Isso garante que retentativas após falha de rede reutilizem a mesma chave.

### Reconciliação de divergências entre loja e ERP

- **Job periódico** compara estoque do banco da loja com o ERP a cada N minutos.
- Se o ERP tem **menos** que a loja: corrigi para baixo e dispara alerta (indica que houve venda não registrada ou erro no rollback).
- Se o ERP tem **mais** que a loja: investiga se há pedidos pendentes de confirmação antes de ajustar.
- Pedidos em estado `pending_erp` por mais de X horas são revisados manualmente ou reprocessados pelo worker.

---

## Pergunta 4 — Contrato de API e Modelo de Erros

### Endpoint: `POST /api/checkout`

**Payload mínimo de entrada**
```json
{
  "productId": "string (uuid)",
  "quantity": "number (integer >= 1)"
}
```
Header obrigatório: `Idempotency-Key: <uuid-v4>`

---

**Resposta de sucesso — 201 Created**
```json
{
  "message": "Order created successfully",
  "order": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "productId": "1",
    "quantity": 2,
    "totalPrice": 198.00
  }
}
```
Frontend: exibe confirmação, rotaciona a `Idempotency-Key`, atualiza estoque na tela.

---

**Resposta para erro de validação — 400 Bad Request**
```json
{
  "status": 400,
  "errorCode": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "issues": [
    { "path": ["body", "quantity"], "message": "quantity must be at least 1" }
  ]
}
```
Frontend: exibe mensagem inline no campo específico. Não rotaciona a chave.

---

**Resposta para estoque insuficiente — 409 Conflict**
```json
{
  "status": 409,
  "errorCode": "INSUFFICIENT_STOCK",
  "message": "Insufficient stock"
}
```
Frontend: exibe toast de erro, atualiza estoque na tela (pode ter mudado). Não rotaciona a chave.

---

**Resposta para falha temporária do ERP — 503 Service Unavailable**
```json
{
  "status": 503,
  "errorCode": "ERP_ERROR",
  "message": "ERP Timeout / Service Unavailable"
}
```
Frontend: exibe mensagem "Tente novamente em instantes". **Mantém a mesma chave** para retry seguro. Em arquitetura assíncrona, este caso não ocorre — o checkout retorna 202 e o ERP é processado em background.

---

**Resposta para processamento assíncrono — 202 Accepted** *(arquitetura futura)*
```json
{
  "status": 202,
  "message": "Order received and is being processed",
  "orderId": "550e8400-e29b-41d4-a716-446655440000"
}
```
Frontend: redireciona para tela de status, faz polling em `GET /orders/:id` a cada 3 s.

---

### Endpoint: `GET /api/orders/:id`

**Resposta de sucesso — 200 OK**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "productId": "1",
  "quantity": 2,
  "totalPrice": 198.00,
  "createdAt": "2026-05-26T10:00:00.000Z"
}
```

**Pedido não encontrado — 404 Not Found**
```json
{
  "status": 404,
  "errorCode": "ORDER_NOT_FOUND",
  "message": "Order not found"
}
```

---

## Pergunta 5 — Testes e Estratégia de Validação

### Testes unitários

Foco no `CheckoutService`, pois é onde mora a lógica crítica. Os repositórios são mockados para isolar completamente o comportamento:

- Produto não encontrado → `PRODUCT_NOT_FOUND` (404)
- Decremento falha → `INSUFFICIENT_STOCK` (409)
- ERP falha → `ERP_ERROR` (503) + `incrementStock` chamado com quantidade correta
- Concorrência: dois processos simultâneos, apenas um vence

Arquivo: `__tests__/CheckoutService.test.ts` — 5 casos cobrindo todos os branches críticos.

### Testes de integração da API

Testam o contrato HTTP completo (status codes, `errorCode`, corpo da resposta) mockando apenas os repositórios via `jest.spyOn` no protótipo. A stack Express + middlewares (validação, idempotência, erro) é exercida de verdade:

- `GET /api/products` → 200 com lista
- `POST /api/checkout` → 201 sucesso, 400 validação, 404 produto, 409 estoque, 503 ERP, 201 idempotente
- `GET /api/orders/:id` → 200 encontrado, 404 não encontrado

Arquivo: `__tests__/api.test.ts` — 10 casos.

### Testes de contrato front-end / back-end

Hoje garantidos pela tipagem TypeScript compartilhada (interfaces `Product` e `Order`). Como próximo passo, ferramentas como **Pact** ou **OpenAPI + Zod** gerariam contratos formais verificáveis em CI, impedindo que mudanças silenciosas no backend quebrem o frontend.

### Cenários de concorrência

O teste unitário "two race for the last unit" simula o cenário com `mockResolvedValueOnce` alternando true/false. Em um teste de carga real (próximo passo), ferramentas como **k6** ou **Artillery** disparariam N requests simultâneos no mesmo produto com estoque 1 e validariam que exatamente 1 pedido foi criado.

### Testes de estado do front-end

Hoje a validação é manual (inspeção visual). Como próximo passo:
- **Vitest + React Testing Library**: testar que o botão fica desabilitado durante loading, que o toast aparece com a mensagem correta, que o estoque é atualizado após compra.
- **Playwright**: teste E2E cobrindo o fluxo completo de compra no browser.

### O que foi automatizado agora

- 15 testes automatizados (5 unitários + 10 integração) cobrindo todos os cenários de erro do backend.

### Próximos passos documentados

- Testes de carga concorrente com k6
- Testes de componentes React com Vitest + RTL
- Testes E2E com Playwright
- Contrato formal Pact entre front e back

---

## Pergunta 6 — Uso de IA no Desenvolvimento

### Que tipo de prompt foi usado

Prompts orientados a **decisão técnica**, não a geração de código bruto. Exemplos:

- *"Como implementar decremento de estoque atômico em PostgreSQL para evitar race conditions sem locks distribuídos?"*
- *"Implemente um middleware de idempotência em Express que intercepte a resposta via monkey-patch do res.json e persista a chave no banco."*
- *"Gere a estrutura de pastas para um projeto Express com TypeScript seguindo Clean Architecture (controllers, services, repositories, middlewares)."*

### O que foi delegado à IA

- Boilerplate e scaffolding (estrutura de pastas, tsconfig, package.json)
- CSS moderno (dark mode, glassmorphism, animações de toast)
- Primeiros rascunhos de middlewares e repositories
- Sugestões de casos de teste para cenários que eu poderia ter esquecido

### O que não foi delegado

- **Decisões de concorrência:** o ponto mais crítico (UPDATE atômico vs SELECT+UPDATE) foi decidido e revisado manualmente. A IA sugeria SELECT seguido de UPDATE (race condition clássica); a intervenção humana garantiu a abordagem correta.
- **Estratégia de rollback:** a IA propôs `updateStock(id, stock_original)` (absoluto); foi corrigido para `incrementStock(id, quantidade)` (relativo e seguro para concorrência).
- **Arquitetura geral:** a estrutura incremental, os trade-offs entre abordagens e as decisões de quando usar cache vs banco foram definidos por raciocínio próprio.

### Como a resposta foi verificada

- Toda lógica crítica foi revisada linha a linha antes de aceitar.
- Os testes automatizados foram escritos para validar especificamente o comportamento gerado — especialmente o teste de concorrência e o rollback.
- O middleware de idempotência teve o ciclo de vida do `res.json` inspecionado manualmente no debugger para confirmar o comportamento do monkey-patch.

### Riscos de aceitar sugestão de IA sem revisão

- **Race condition silenciosa:** a IA gera código funcionalmente correto para testes de unidade mas incorreto sob carga (SELECT+UPDATE vs UPDATE atômico). Testes unitários passam; produção falha.
- **Exposição de dados sensíveis:** a IA frequentemente inclui `stack`, `detail` e variáveis de ambiente nas respostas de erro para facilitar debug — inadequado para produção.
- **Código idiomático mas frágil:** monkey-patching de `res.json` é uma técnica válida mas dependente de detalhes do ciclo de vida do Express. A IA pode gerar uma implementação que funciona na maioria dos casos mas quebra com middlewares de compressão ou streaming.
- **Dependências desnecessárias:** a IA tende a sugerir bibliotecas adicionais para problemas que têm solução nativa (ex.: body-parser quando o Express já inclui).
