import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://iihnfgmsfshrgrhargxz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpaG5mZ21zZnNocmdyaGFyZ3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTA1MDAsImV4cCI6MjEwMzkyNjUwMH0.h3N4tW20cByuA28lmbYd5iSsfJoQ7lelvzWDKHMfK5Q';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
