# Whiteboard
```
npm install
npm run dev          # http://localhost:5173 (strict port)
npm test             # eraser, history, export bounds, barrel detector
npm run build        # dist/ (also generates manifest + service worker)
npm run preview      # serves the production build on :4173, needed to test install/offline
```
Phone over USB: `adb reverse tcp:5173 tcp:5173` (dev) or `adb reverse tcp:4173 tcp:4173` (preview), then open http://localhost:PORT in Chrome.
Install: Chrome menu > Install app. The service worker only exists in the production build, so test offline with `npm run preview`.
Vercel: framework Vite, build `npm run build`, output `dist` (HTTPS is automatic, which PWA install needs).
Layout: `src/engine` canvas/strokes/eraser/history (no React), `src/input` pointer/keys/barrel/actions, `src/store` IndexedDB + settings, `src/export` PDF/PNG.
