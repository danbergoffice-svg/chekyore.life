import { render } from 'preact'
import { initAnalytics } from './analytics'
import { App } from './ui/App'
import './style.css'

initAnalytics()
render(<App />, document.getElementById('app')!)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
