import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Notes Buddy', short_name: 'Notes Buddy', description: 'A simple classroom whiteboard for your notes and lessons',
      start_url: '/', scope: '/', theme_color: '#ffffff', background_color: '#ffffff',
      display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'any',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], maximumFileSizeToCacheInBytes: 3_000_000 },
  })],
  server: { port: 5173, strictPort: true },
})
