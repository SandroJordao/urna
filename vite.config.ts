import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Onde o PHP está rodando durante o `npm run dev` (XAMPP ou `php -S`).
const php = process.env.PHP_SERVER ?? 'http://localhost/urna'

export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'web/index.html'),
        votar: resolve(import.meta.dirname, 'web/votar.html'),
        resultados: resolve(import.meta.dirname, 'web/resultados.html'),
        admin: resolve(import.meta.dirname, 'web/admin.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: php, changeOrigin: true },
      '/uploads': { target: php, changeOrigin: true },
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts'],
  },
})
