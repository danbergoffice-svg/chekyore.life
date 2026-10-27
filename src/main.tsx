import { render } from 'preact'
import { initPlatform, platform } from './platform'
import { App } from './ui/App'
import './style.css'

initPlatform()
render(<App />, document.getElementById('app')!)

// Офлайн-кэш — только на своём сайте: на порталах игру отдаёт их сервер.
if (import.meta.env.PROD && platform.name === 'web' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
