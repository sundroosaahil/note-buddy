import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
registerSW({ immediate: true }) // service worker: caches the app shell so it works offline (production build only)
createRoot(document.getElementById('root')).render(<App />)
