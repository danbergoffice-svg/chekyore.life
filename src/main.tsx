import { render } from 'preact'
import { initPlatform, platform } from './platform'
import { App } from './ui/App'
import './style.css'

initPlatform()
render(<App />, document.getElementById('app')!)

// Шрифт на портале лежит в самой сборке: внешних запросов к Google Fonts нет.
if (import.meta.env.VITE_PLATFORM === 'crazygames') {
  // Наборы символов (кириллица, латиница…) браузер грузит по необходимости.
  import('@fontsource/pt-serif/400.css')
  import('@fontsource/pt-serif/700.css')
  import('@fontsource/pt-serif/400-italic.css')
}

// Офлайн-кэш — только на своём сайте: на порталах игру отдаёт их сервер.
if (import.meta.env.PROD && platform.name === 'web' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
