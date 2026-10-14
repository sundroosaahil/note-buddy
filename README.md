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

## Stage 6: objects layer
Each page has `strokes` (freehand ink) and `objects` (shapes, sticky notes, text boxes, stickers, images). An object is a box `{x, y, w, h, rot}` in world units plus type-specific fields, so selection, move, resize, rotate, lock, copy/paste, undo, autosave and PDF export treat every type the same way.
Layer order: highlighter, then objects, then ink (so writing stays readable on top of notes and shapes).
- `src/engine/geom.js` pure math (hit tests, resize/rotate, lasso), `snap.js` shape recognition, `objects.js` drawing, `stickers.js` the library.
- `src/engine/selection.js` and `objectOps.js` are mixed into `Engine` (selection/transform, and creating/editing objects).
- Images are stored as blobs in IndexedDB (store `blobs`, db version 2); pages only keep the blob id.
- Shortcuts: Delete, Esc, Ctrl+C copy, Ctrl+V paste (also images from the clipboard), Ctrl+D duplicate, Ctrl+A select all.
- Tests: `npm test` runs engine, pointer/barrel, geometry/snapping and object-layer tests (a fake canvas stands in for the browser).
