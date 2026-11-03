// Ошибка при отрисовке не оставляет пустой экран: игрок видит «Что-то пошло не так» и кнопку продолжить
// (перезагрузка - сохранение остаётся), а ошибка уходит в аналитику (js_error) со стеком и экраном.
import { Component } from 'preact'
import type { ComponentChildren } from 'preact'
import { platform } from '../platform'

let sent = 0

/** Отправить ошибку в аналитику (не больше 5 за сессию, стек укорочен). */
export function reportError(kind: string, err: unknown): void {
  if (sent >= 5) return
  sent++
  const e = err as { message?: string; stack?: string } | undefined
  const msg = String(e?.message ?? err).slice(0, 300)
  const stack = String(e?.stack ?? '').split('\n').slice(0, 6).join(' | ').slice(0, 900)
  try {
    platform.track('js_error', { kind, msg, stack, screen: document.querySelector('.screen')?.className ?? '' })
  } catch {
    // Аналитика не должна ронять игру ещё раз.
  }
}

/** Ловить и необработанные ошибки вне отрисовки (таймеры, обещания). */
export function watchErrors(): void {
  window.addEventListener('error', (e) => reportError('window', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason))
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
