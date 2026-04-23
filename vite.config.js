import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built assets use relative URLs (base: './') so file:// loading works when
// Electron opens dist/renderer/index.html from inside app.asar.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: '../public',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
