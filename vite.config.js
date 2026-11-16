import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative Pfade: läuft unter jeder Adresse, z. B. https://<name>.github.io/<repo>/
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
      manifest: {
        name: 'wire.tool – Kabelbaum-Editor',
        short_name: 'wire.tool',
        description: 'Kabelbäume und Schaltpläne zeichnen – offline',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d0e11',
        theme_color: '#131418',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { port: 5173, open: false },
});
