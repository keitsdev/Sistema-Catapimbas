# Banca Viva – Frontend (React + TypeScript + Vite)

## Rodar
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # checagem de tipos + build de produção
```
Contas de demonstração (senha `demo1234`): `admin@demo.dev`, `andre@demo.dev` (avaliador na Instituição 1, orientador na 2), `coord@demo.dev`, `aluno@demo.dev`, `super@demo.dev`.

## Estrutura
- `src/api.ts` – **única** camada de dados. Hoje é simulada em memória, com as regras de negócio (RN01–RN10) como contrato. Troque cada função por `fetch('/api/...', { credentials: 'include' })`; o `vite.config.ts` já tem proxy `/api`.
- `src/auth.tsx` – sessão, vínculo institucional ativo (um usuário pode ter papéis diferentes em instituições diferentes) e menu por papel.
- `src/pages/` – Login, Dashboard (RF11), Projetos (RF05/RF10), Avaliar (RF09), Resultados (RF12–RF14), Aprovações (RF03), Instituições (RF01).

## Importante
Esconder menus **não** é segurança. O backend deve validar autenticação, papel e `instituicao_id` em cada rota (RN10) – o frontend responde 403/404 do servidor sem expor dados.

## Ainda a implementar (pede o backend ou mais telas)
Formulários de criação/edição (projetos, equipes, bancas, critérios e descritores), cadastro/recuperação de senha, bloqueio/revogação de permissões, trilha de auditoria (RF15) e testes automatizados (Vitest + Testing Library; Playwright para acesso entre instituições).
