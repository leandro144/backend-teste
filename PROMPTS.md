# PROMPTS.md — Uso de IA no Projeto

Este documento detalha como a IA foi utilizada durante o desenvolvimento deste desafio.

## Estratégia de Delegação

1. **Boilerplate e Estrutura:** Delegado à IA a criação da estrutura de pastas baseada em princípios de SOLID/Clean Architecture e a configuração inicial de TSConfig e scripts.
2. **Design System:** Solicitação de estilos CSS modernos (glassmorphism, dark mode) para garantir uma estética premium sem depender de frameworks pesados.
3. **Lógica de Concorrência:** Orientação específica para implementar o decremento de estoque no banco de dados para garantir atomicidade.

## Prompts Utilizados

- *"Crie uma estrutura de pastas para um projeto Express com TypeScript separando controllers, services e repositories."*
- *"Implemente um middleware de idempotência em Node.js que intercepte a resposta e a salve em um banco de dados para retornar a mesma resposta em chaves repetidas."*
- *"Gere um arquivo CSS moderno para um e-commerce em dark mode, usando variáveis CSS e animações suaves para botões e toasts."*
- *"Como fazer um decremento de estoque atômico no SQLite para evitar race conditions?"*

## Validação e Riscos

- **Validação:** Cada middleware e repository foi revisado manualmente. O ponto mais crítico foi o `Idempotency Middleware`, onde foi necessário garantir que o "monkey-patching" do `res.json` funcionasse corretamente com o ciclo de vida do Express.
- **Riscos:** O maior risco identificado no uso de IA para este desafio seria a geração de um checkout "ingênuo" (query de SELECT seguida de UPDATE), que falharia em testes de concorrência real. A intervenção humana garantiu o uso de travas a nível de banco.
