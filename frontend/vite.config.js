import inject from '@rollup/plugin-inject';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        svelte({
            compilerOptions: {
                // runes: true,
            },
        }),
        visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
        }),
        inject({
            $: 'jquery',
            jQuery: 'jquery',
            'window.jQuery': 'jquery',
            'window.$': 'jquery',
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('svelte-jsoneditor') || id.includes('codemirror')) {
                            return 'json-editor';
                        }
                        if (id.includes('gridstack')) {
                            return 'gridstack';
                        }
                        return 'core-vendor';
                    }
                },
            },
        },
    },
    css: {
        postcss: './postcss.config.js',
    },
    base: '/comfygrid/',
    server: {
        host: true,
        port: process.env.PORT ? Number.parseInt(process.env.PORT) : 6210,
        proxy: {
            // proxify all requests starting with /ws to the FastAPI backend
            '/comfygrid/ws/': {
                target: 'http://127.0.0.1:8000',
                ws: true,
                changeOrigin: true,
                secure: false,
            },
            // proxify all requests starting with /api to the FastAPI backend
            '/comfygrid/api/': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            },
            '^/(?!comfygrid/)': {
                target: 'http://127.0.0.1:8188',
                changeOrigin: false,
                ws: true,
                secure: false,
            },
        },
    },
});
