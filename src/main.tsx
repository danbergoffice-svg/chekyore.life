import { render } from 'preact'
import { initPlatform } from './platform'
import { App } from './ui/App'
import './style.css'

initPlatform()
render(<App />, document.getElementById('app')!)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
