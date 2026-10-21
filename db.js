import 'dotenv/config';
import pg from 'pg';

const obrigatorias = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const faltando = obrigatorias.filter(nome => !process.env[nome] || process.env[nome].startsWith('COLE_AQUI'));
if (faltando.length) throw new Error(`Variaveis ausentes no .env: ${faltando.join(', ')}`);

const { Pool } = pg;
// A conexao PostgreSQL usa o Session Pooler indicado no painel do Supabase.
// Em producao, configure validacao do certificado TLS conforme o ambiente.
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, // Somente para diagnostico/desenvolvimento.
  connectionTimeoutMillis: 15000,
  max: 5
});