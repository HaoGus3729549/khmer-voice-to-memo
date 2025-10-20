import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3002 },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
    include: ['@xenova/transformers > onnxruntime-web']
  },
  define: { global: 'globalThis' }
});
