import inject from '@rollup/plugin-inject';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path, { resolve } from 'path';
import license from 'rollup-plugin-license';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        svelte({
            preprocess: [vitePreprocess({ script: true })],
        }),
        visualizer({
            open: true,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
        }),
        inject({
            include: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
            exclude: ['**/*.svelte'],
            $: 'jquery',
            jQuery: 'jquery',
            'window.jQuery': 'jquery',
            'window.$': 'jquery',
        }),
        license({
            thirdParty: {
                output: [path.join(import.meta.dirname, 'dist', 'THIRD_PARTY_LICENSES.txt'), path.join(import.meta.dirname, '..', 'THIRD_PARTY_LICENSES.txt')],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
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
