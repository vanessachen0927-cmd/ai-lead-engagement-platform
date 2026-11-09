import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { proxy: { '/auth': { target: process.env.API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true }, '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true }, '/health': { target: process.env.API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true } } } });
