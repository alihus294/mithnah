import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built assets use relative URLs (base: './') so file:// loading works when
// Electron opens dist/renderer/index.html from inside app.asar.
export default defineConfig(({ mode }) => ({
    root: 'src/renderer',
    base: './',
    publicDir: '../public',
    plugins: [react()],
    build: {
        target: 'es2020',
        outDir: '../../dist/renderer',
        emptyOutDir: true,
        sourcemap: mode !== 'production',
        // [PERF] Chunk splitting for better caching in Electron builds.
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom'],
                },
            },
        },
        // [PERF] Reduce chunk size warnings for Electron bundles.
        chunkSizeWarningLimit: 600,
    },
    server: {
        port: 5173,
        strictPort: true,
    },
}));
