import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('As variáveis SUPABASE_URL e SUPABASE_ANON_KEY devem estar definidas no arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);