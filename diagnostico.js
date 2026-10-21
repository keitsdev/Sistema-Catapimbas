import 'dotenv/config';
import dns from 'node:dns/promises';
import net from 'node:net';
import pg from 'pg';

const host = process.env.DB_HOST;
const port = Number(process.env.DB_PORT || 5432);
console.log('Host:', host || '(ausente)');
console.log('Porta:', port);
console.log('Senha configurada:', Boolean(process.env.DB_PASSWORD && !process.env.DB_PASSWORD.startsWith('COLE_AQUI')));
if (!host) process.exit(1);

try {
  const ips = await dns.lookup(host, { all: true });
  console.log('DNS resolvido:', ips.map(x => x.address).join(', '));
} catch (e) { console.error('Falha DNS:', e.message); }

await new Promise(resolve => {
  const socket = net.connect({ host, port });
  socket.setTimeout(8000);
  socket.once('connect', () => { console.log('TCP acessivel'); socket.destroy(); resolve(); });
  socket.once('timeout', () => { console.error('Timeout TCP'); socket.destroy(); resolve(); });
  socket.once('error', e => { console.error('Falha TCP:', e.code, e.message); resolve(); });
});

if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.startsWith('COLE_AQUI')) {
  console.log('Teste PostgreSQL ignorado: configure DB_PASSWORD no .env');
  process.exit(1);
}
const cliente = new pg.Client({
  host, port, database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, // Apenas desenvolvimento/diagnostico.
  connectionTimeoutMillis: 15000
});
try {
  await cliente.connect();
  const result = await cliente.query('SELECT NOW() AS horario');
  console.log('PostgreSQL conectado:', result.rows[0].horario);
} catch (e) {
  console.error('Erro PostgreSQL:', e.code || 'sem codigo', e.message);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}