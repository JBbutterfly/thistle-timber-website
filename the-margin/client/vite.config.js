import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.MARGIN_API_URL || 'http://localhost:5175';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
