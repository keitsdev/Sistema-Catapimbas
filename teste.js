import { supabase } from './supabaseClient.js';

async function consultarTabela() {
  const { data, error } = await supabase
    .from('TSenha')
    .select('*')
    .limit(5);

  if (error) {
    console.error('Erro:', error.message);
    console.error('Código:', error.code);
    return;
  }

  console.log('Consulta executada!');
  console.log('Registros:', data);
}

consultarTabela();