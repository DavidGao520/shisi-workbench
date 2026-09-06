import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./standalone', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: '../dist-local',
    emptyOutDir: true,
    assetsInlineLimit: 2000000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
