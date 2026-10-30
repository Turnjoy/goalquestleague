import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['goalquest-logo.webp'],
      devOptions: {
        enabled: true
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/goalquestleague\.com\.ng\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'goalquest-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'GoalQuest League',
        short_name: 'GoalQuest',
        description: 'GoalQuest League eFootball platform powered by Turnjoy Innovation Services.',
        theme_color: '#07182f',
        background_color: '#07182f',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/goalquest-logo.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        proxyTimeout: 320000,
        timeout: 320000,
      },
    },
  },
});
