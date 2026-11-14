// Ошибка при отрисовке не оставляет пустой экран: игрок видит «Что-то пошло не так» и кнопку продолжить
// (перезагрузка - сохранение остаётся), а ошибка уходит в аналитику (js_error) со стеком и экраном.
import { Component } from 'preact'
import type { ComponentChildren } from 'preact'
import { platform } from '../platform'

let sent = 0

/** Отправить ошибку в аналитику (не больше 5 за сессию, стек укорочен). where - файл:строка:столбец (у ошибок окна). */
export function reportError(kind: string, err: unknown, where = ''): void {
  if (sent >= 5) return
  sent++
  const e = err as { message?: string; stack?: string } | undefined
  const msg = String(e?.message ?? err).slice(0, 300)
  const stack = String(e?.stack ?? '').split('\n').slice(0, 6).join(' | ').slice(0, 900)
  try {
    platform.track('js_error', { kind, msg, stack, ...(where ? { where: where.slice(0, 200) } : {}), screen: typeof document === 'undefined' ? '' : (document.querySelector('.screen')?.className ?? '') })
  } catch {
    // Аналитика не должна ронять игру ещё раз.
  }
}

/** Сбой загрузки куска сборки: после выкладки новой версии старые файлы удалены, а открытая вкладка их ещё ищет. */
export function isChunkError(err: unknown): boolean {
  const msg = String((err as { message?: string } | undefined)?.message ?? err)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch module|Unable to preload CSS|ChunkLoadError/i.test(msg)
}

const RELOADED = 'thousands.chunk_reload'

/** Перезагрузить страницу один раз за сессию (сохранение остаётся): подтянется новая сборка. true - перезагрузка пошла. */
export function reloadForChunk(err: unknown, reload: () => void = () => location.reload()): boolean {
  if (platform.sessionFlag(RELOADED)) return false
  platform.setSessionFlag(RELOADED)
  reportError('chunk', err)
  reload()
  return true
}

/** Ловить и необработанные ошибки вне отрисовки (таймеры, обещания). */
export function watchErrors(): void {
  window.addEventListener('error', (e) => {
    // «Script error.» без стека - ошибка чужого скрипта (Метрика, расширения браузера): помечаем отдельно, с адресом.
    const cross = !e.error && /^Script error\.?$/i.test(e.message ?? '')
    reportError(cross ? 'cross' : 'window', e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '')
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkError(e.reason) && reloadForChunk(e.reason)) return
    reportError('promise', e.reason)
  })
  // Vite сообщает о сбое подгрузки куска отдельным событием.
  window.addEventListener('vite:preloadError', (e) => {
    const err = (e as Event & { payload?: unknown }).payload
    if (reloadForChunk(err)) e.preventDefault()
  })
}

export class CrashGuard extends Component<{ children: ComponentChildren; text: { title: string; body: string; button: string } }, { failed: boolean }> {
  state = { failed: false }

  componentDidCatch(err: unknown) {
    reportError('render', err)
    this.setState({ failed: true })
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { title, body, button } = this.props.text
    return (
      <div class="screen crash" role="alert">
        <h1>{title}</h1>
        <p>{body}</p>
        <button class="primary" onClick={() => location.reload()}>
          {button}
        </button>
      </div>
    )
  }
}
