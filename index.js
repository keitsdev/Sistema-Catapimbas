import { pool } from './db.js';

try {
  console.log('Testando conexao PostgreSQL...');
  const resultado = await pool.query('SELECT NOW() AS horario, current_database() AS banco');
  console.table(resultado.rows);
  console.log('Conexao PostgreSQL estabelecida!');
} catch (erro) {
  console.error('Falha PostgreSQL:', erro.message);
  console.error('Codigo:', erro.code ?? 'nao informado');
  process.exitCode = 1;
} finally {
  await pool.end();
}