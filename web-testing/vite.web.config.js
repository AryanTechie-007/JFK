import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Website Testing Vite Configuration (used exclusively by web-testing/run-web-test.bat)
export default defineConfig({
  root: path.resolve(__dirname, '..'),
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    open: true
  }
});
