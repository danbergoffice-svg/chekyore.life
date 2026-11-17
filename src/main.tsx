import { render } from 'preact'
import { initPlatform, platform } from './platform'
import { applyTheme, savedTheme } from './theme'
import { App } from './ui/App'
import { CrashGuard, watchErrors } from './ui/Crash'
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

applyTheme(savedTheme())
initPlatform()
// В index.html внутри #app - текст для поисковиков и первых мгновений загрузки; игра рисуется на его месте.
const root = document.getElementById('app')!
root.textContent = ''
watchErrors()
// Галерея и редактор живописных сцен (?gallery=painted) - отдельным куском кода, игре не мешает.
if (new URLSearchParams(location.search).get('gallery') === 'painted') {
  import('./pixel/PaintedGallery').then(({ PaintedGallery }) => {
    document.documentElement.classList.add('gallery')
    render(<PaintedGallery />, root)
  })
} else {
  render(
    <CrashGuard text={crashText()}>
      <App />
    </CrashGuard>,
    root,
  )
}

/** Тексты экрана ошибки - без словарей игры (они могли и сломаться): язык из настроек или браузера. */
function crashText() {
  let lang = ''
  try {
    lang = JSON.parse(localStorage.getItem('thousands.prefs') ?? '{}').lang ?? ''
  } catch {
    // нет настроек
  }
  lang ||= navigator.language.slice(0, 2)
  if (lang === 'ru') return { title: 'Что-то пошло не так', body: 'Игра споткнулась. Жизнь сохранена - нажмите, чтобы продолжить.', button: 'Продолжить' }
  if (lang === 'tr') return { title: 'Bir şeyler ters gitti', body: 'Oyun takıldı. Hayatın kaydedildi - devam etmek için dokun.', button: 'Devam et' }
  return { title: 'Something went wrong', body: 'The game stumbled. Your life is saved - tap to continue.', button: 'Continue' }
}

// Офлайн-кэш - только на своём сайте: на порталах игру отдаёт их сервер.
if (import.meta.env.PROD && platform.name === 'web' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
