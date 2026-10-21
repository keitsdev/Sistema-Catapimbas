export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sistema Catapimbas API",
    version: "1.0.0",
    description: "API multi-institucional para gestão e avaliação de projetos acadêmicos.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      institutionContext: {
        type: "apiKey",
        in: "header",
        name: "x-institution-id",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
  security: [{ bearerAuth: [], institutionContext: [] }],
  paths: {
    "/health": {
      get: {
        security: [],
        summary: "Estado da API",
        responses: { 200: { description: "OK" } },
      },
    },
    "/auth/register": {
      post: {
        security: [],
        summary: "Cadastrar conta",
        responses: { 201: { description: "Criada" } },
      },
    },
    "/auth/login": {
      post: {
        security: [],
        summary: "Autenticar",
        responses: { 200: { description: "Sessão criada" } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Perfil e vínculos",
        responses: { 200: { description: "Perfil" } },
      },
    },
    "/institutions": {
      get: {
        summary: "Listar instituições acessíveis",
        responses: { 200: { description: "Lista" } },
      },
      post: {
        summary: "Criar instituição (superadmin)",
        responses: { 201: { description: "Criada" } },
      },
    },
    "/members": {
      get: {
        summary: "Listar vínculos institucionais",
        responses: { 200: { description: "Lista" } },
      },
    },
    "/projects": {
      get: {
        summary: "Filtrar projetos",
        responses: { 200: { description: "Lista paginada" } },
      },
      post: {
        summary: "Criar projeto",
        responses: { 201: { description: "Criado" } },
      },
    },
    "/boards": {
      get: {
        summary: "Listar bancas",
        responses: { 200: { description: "Lista" } },
      },
      post: {
        summary: "Criar banca",
        responses: { 201: { description: "Criada" } },
      },
    },
    "/evaluations": {
      post: {
        summary: "Enviar avaliação transacional",
        responses: { 201: { description: "Enviada" } },
      },
    },
    "/boards/{id}/ranking": {
      get: {
        summary: "Calcular ranking",
        responses: { 200: { description: "Ranking" } },
      },
    },
    "/boards/{id}/presentation": {
      get: {
        summary: "Pódio e configuração de música",
        responses: { 200: { description: "Apresentação" } },
      },
    },
    "/dashboard": {
      get: {
        summary: "Indicadores institucionais",
        responses: { 200: { description: "Indicadores" } },
      },
    },
    "/reports/projects.xlsx": {
      get: {
        summary: "Exportar projetos filtrados",
        responses: { 200: { description: "Planilha XLSX" } },
      },
    },
    "/reports/boards/{id}/ranking.xlsx": {
      get: {
        summary: "Exportar ranking",
        responses: { 200: { description: "Planilha XLSX" } },
      },
    },
  },
} as const;
