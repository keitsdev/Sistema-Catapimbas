import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || key.startsWith('COLE_AQUI')) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env');
}

// Usa a API HTTPS do Supabase, sem abrir uma conexao PostgreSQL direta.
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});