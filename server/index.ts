import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";

const env = getEnv();
const server = createServer(createApp());
const port = env.PORT ?? env.API_PORT;

server.listen(port, "0.0.0.0", () => {
  console.info(`API disponível na porta ${port}`);
});

function shutdown(signal: string) {
  console.info(`${signal} recebido; encerrando a API`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
