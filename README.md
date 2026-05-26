# Lumina Store — CaseCellShop Technical Challenge

Mini fullstack de checkout para capinhas de celular, desenvolvido como resposta ao desafio técnico CaseCellShop (Nível Pleno | Fullstack).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + TypeScript + Express |
| Banco de dados | PostgreSQL (via `pg`) |
| Validação | Zod |
| Frontend | React + TypeScript + Vite |
| HTTP client | Axios |
| Testes | Jest + ts-jest + Supertest |

A stack escolhida é a preferencial do desafio (Node.js + TypeScript no backend, React + TypeScript no frontend).

## Funcionalidades implementadas

- **Lock atômico de estoque** via `UPDATE ... WHERE stock >= quantity` — elimina race conditions sem locks distribuídos.
- **Idempotência** com header `Idempotency-Key` persistido no banco — retentativas seguras sem pedidos duplicados.
- **Simulação de ERP** com latência artificial (3 s) e falha aleatória (10%) — exercita o caminho de rollback.
- **Rollback relativo** de estoque em caso de falha do ERP (`stock + N` em vez de valor absoluto) — seguro para operações concorrentes.
- **Endpoint de status** `GET /api/orders/:id` — permite polling após checkout assíncrono.
- **15 testes automatizados** cobrindo todos os cenários: sucesso, validação, estoque insuficiente, falha ERP, idempotência, concorrência.

## Como rodar

### Pré-requisitos

- Node.js 18+
- Uma instância PostgreSQL acessível (local ou remota)

### Backend

```bash
cd backend
npm install

# Crie um arquivo .env com a string de conexão:
echo "DATABASE_URL=postgresql://user:password@localhost:5432/lumina" > .env

npm run dev   # servidor na porta 3001
```

### Frontend

```bash
cd frontend
npm install

# Opcional: crie um .env.local se o backend não estiver em localhost:3001
echo "VITE_API_URL=http://localhost:3001/api" > .env.local

npm run dev   # acesse http://localhost:5173
```

### Testes

```bash
cd backend
npm test
```

Saída esperada: **15 testes passando** (5 unitários + 10 integração).

## Estrutura do projeto

```
backend/
├── src/
│   ├── app.ts                  # Express app
│   ├── routes/index.ts         # Rotas da API
│   ├── controllers/            # Orquestração HTTP
│   ├── services/               # Regras de negócio
│   ├── repositories/           # Acesso ao banco
│   ├── middlewares/            # Idempotência, validação, erros
│   ├── schemas/                # Schemas Zod
│   └── database/db.ts          # Conexão PostgreSQL + setup de tabelas
├── __tests__/
│   ├── CheckoutService.test.ts # Testes unitários do serviço
│   └── api.test.ts             # Testes de integração HTTP
└── __mocks__/uuid.js           # Stub CJS do uuid (ESM puro) para Jest

frontend/
└── src/
    ├── App.tsx                 # Componente principal + lógica de estado
    └── index.css               # Design system (dark mode, animações)
```

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/products` | Lista produtos com estoque |
| `POST` | `/api/checkout` | Finaliza uma compra |
| `GET` | `/api/orders/:id` | Consulta status de um pedido |

### Exemplo de checkout

```bash
curl -X POST http://localhost:3001/api/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "productId": "1", "quantity": 1 }'
```

### Códigos de resposta

| Código | `errorCode` | Situação |
|--------|-------------|---------|
| 201 | — | Pedido criado |
| 400 | `VALIDATION_ERROR` | Dados inválidos |
| 404 | `PRODUCT_NOT_FOUND` | Produto inexistente |
| 409 | `INSUFFICIENT_STOCK` | Estoque insuficiente |
| 503 | `ERP_ERROR` | Falha na integração com ERP |

## Decisões técnicas

### Lock atômico de estoque
`UPDATE products SET stock = stock - N WHERE id = X AND stock >= N` garante que apenas uma transação vence em cenários concorrentes. `rowCount = 0` sinaliza estoque insuficiente sem precisar de um SELECT anterior (que criaria a janela para race condition).

### Rollback relativo
Em caso de falha do ERP, o estoque é restaurado com `stock + N` (relativo), não com o valor lido antes do decremento (absoluto). Isso evita sobre-restauração caso outra transação tenha modificado o estoque no intervalo.

### Idempotency-Key estável por tentativa
A chave é gerada quando o usuário inicia o checkout e permanece a mesma para retentativas (ex.: falha de rede). Após um checkout bem-sucedido, uma nova chave é gerada automaticamente para a próxima compra.

### Sem autenticação
Omitida intencionalmente conforme o escopo do desafio.

## Limitações e próximos passos

### Limitações atuais

- **Checkout síncrono:** o ERP é chamado na mesma requisição. Em produção, seria assíncrono (fila + worker) para isolar a loja de instabilidades do ERP.
- **Sem cache de catálogo:** produtos são lidos diretamente do banco a cada requisição. Em produção, usaria Redis com TTL de minutos.
- **Sem job de sincronização:** não há mecanismo que reconcilie periodicamente estoque e catálogo entre loja e ERP.
- **Idempotency keys sem expiração:** as chaves persistem indefinidamente. Em produção, seria necessário um TTL (ex.: 24 h) com limpeza periódica.
- **Sem autenticação/autorização.**

### Próximos passos

1. Checkout assíncrono: `POST /checkout` retorna `202 Accepted` + fila BullMQ + worker para chamar o ERP.
2. Cache Redis para catálogo com TTL de 5 minutos.
3. Job de sincronização de estoque a cada minuto comparando banco da loja com ERP.
4. Testes de carga com k6 para validar o lock atômico sob concorrência real.
5. Testes de componente React com Vitest + React Testing Library.
6. Testes E2E com Playwright.
7. TTL e limpeza automática de `idempotency_keys`.

## Respostas conceituais

As respostas para as 6 perguntas conceituais da Parte 1.A estão em [theoretical_answers.md](./theoretical_answers.md).

## Uso de IA

Os prompts utilizados durante o desenvolvimento estão documentados em [PROMPTS.md](./PROMPTS.md).
