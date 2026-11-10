import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: ['es2019', 'safari13'], chunkSizeWarningLimit: 900 },
  server: { port: 5183, strictPort: true, watch: { ignored: ['**/.claude/**', '**/raw/**'] } },
});
