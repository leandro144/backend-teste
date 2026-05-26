# Lumina Store — E-commerce & Scalability

Este é um projeto desenvolvido para um desafio técnico, focando em robustez de backend, consistência de dados (concorrência) e experiência do usuário (idempotência e UI premium).

## 🚀 Funcionalidades Chave

- **Lock de Estoque Atômico:** Implementado via SQL (`UPDATE ... WHERE stock >= quantity`) para evitar race conditions sem necessidade de locks distribuídos complexos.
- **Idempotência:** Middleware no backend que utiliza o header `Idempotency-Key` para garantir que cliques duplos não resultem em compras duplicadas.
- **Simulação de ERP Realista:**
  - Latência artificial de 3 segundos.
  - Falha aleatória (10%) para testar resiliência e rollback de estoque.
- **UI Premium:** Interface React com dark mode, animações, estados de loading e feedback instantâneo via toasts.

## 🛠️ Stack Técnica

- **Backend:** Node.js, TypeScript, Express, Zod, UUID, SQLite.
- **Frontend:** React, TypeScript, Vite, Axios, Lucide-React.

## 🏃 Como Rodar

### 1. Backend
```bash
cd backend
npm install
npm run dev
```
O servidor rodará em `http://localhost:3001`.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Acesse `http://localhost:5173`.

## 📁 Estrutura do Projeto

- `backend/src/`
  - `controllers/`: Orquestração das requisições.
  - `services/`: Regras de negócio (Checkout, Estoque).
  - `repositories/`: Acesso a dados (Abstração do SQLite).
  - `middlewares/`: Idempotência, Validação e Erros.
  - `database/`: Configuração e Seeding inicial.
- `frontend/src/`
  - `App.tsx`: Lógica principal e estado.
  - `index.css`: Design system e estilos premium.

## 📝 Respostas Teóricas
As respostas para as perguntas conceituais do desafio podem ser encontradas no arquivo `theoretical_answers.md` na raiz ou no diretório de artefatos.
