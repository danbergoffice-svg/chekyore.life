// Всплывающая подсказка: мышью - при наведении, пальцем или клавиатурой - по касанию (второе касание или касание
// мимо закрывает). Используется на дарах: календарь даров за вход, ярлыки наград на барабане.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, JSX } from 'preact'

let openClose: (() => void) | null = null

export function Tip(props: {
  title: string
  text?: string
  /** Где пузырь относительно элемента по горизонтали: у краёв ряда - прижат к своему краю, чтобы не уйти за экран. */
  align?: 'start' | 'center' | 'end'
  /** Тег обёртки (li в списке). */
  as?: 'span' | 'li'
  class?: string
  label?: string
  children: ComponentChildren
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLElement>(null)
  const close = () => setOpen(false)
  const show = () => {
    // Открыта только одна подсказка.
    if (openClose && openClose !== close) openClose()
    openClose = close
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const Tag = (props.as ?? 'span') as 'span'
  const attrs: JSX.HTMLAttributes<HTMLSpanElement> = {
    class: `tip ${props.class ?? ''} ${open ? 'open' : ''}`,
    tabIndex: 0,
    role: 'button',
    'aria-expanded': open,
    'aria-label': props.label ?? props.title,
    onPointerEnter: (e) => e.pointerType === 'mouse' && show(),
    onPointerLeave: (e) => e.pointerType === 'mouse' && close(),
    onClick: (e) => {
      e.stopPropagation()
      // Мышь уже открыла по наведению - щелчок не закрывает; касание пальцем - переключает.
      if ((e as unknown as PointerEvent).pointerType === 'mouse' && open) return
      open ? close() : show()
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        open ? close() : show()
      }
    },
  }
  return (
    <Tag ref={root as never} {...attrs}>
      {props.children}
      {open && (
        <span class={`tip-bubble ${props.align ?? 'center'}`} role="tooltip">
          <b>{props.title}</b>
          {props.text && <span>{props.text}</span>}
        </span>
      )}
    </Tag>
  )
}
