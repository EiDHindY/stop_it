import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://miucyfyeghcpqhmrcvtk.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pdWN5ZnllZ2hjcHFobXJjdnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMTUxMjksImV4cCI6MjA4OTY5MTEyOX0.26d-o8AI2p9mdxRT5b08nQyxIR0iIKVuHhbuCfQ7_2s'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
