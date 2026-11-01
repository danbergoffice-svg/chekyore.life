import { render } from 'preact'
import { initPlatform, platform } from './platform'
import { App } from './ui/App'
// Шрифты лежат в сборке (внешних запросов нет): Alegreya - основной текст, «Летопись» - крупные надписи (style.css).
import '@fontsource-variable/alegreya/wght.css'
import '@fontsource-variable/alegreya/wght-italic.css'
import './style.css'
import './skin.css'

// Игра во вложенном окне (itch.io, порталы): окно часто фиксированного размера и само не прокручивается -
// тогда прокручивается страница игры (style.css, html.framed).
try {
  if (window.self !== window.top) document.documentElement.classList.add('framed')
} catch {
  document.documentElement.classList.add('framed')
}

initPlatform()
// В index.html внутри #app - текст для поисковиков и первых мгновений загрузки; игра рисуется на его месте.
const root = document.getElementById('app')!
root.textContent = ''
render(<App />, root)

// Офлайн-кэш - только на своём сайте: на порталах игру отдаёт их сервер.
if (import.meta.env.PROD && platform.name === 'web' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
