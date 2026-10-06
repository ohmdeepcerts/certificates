import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          'cert-gas': [
            './src/certs/gas/cp12.js',
            './src/certs/gas/wizard.js',
            './src/certs/gas/pdf.js',
          ],
          'cert-el': ['./src/certs/el/wizard.js'],
          'cert-pat': ['./src/certs/pat/form.js'],
          directory: ['./src/directory/directory.js'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
});
