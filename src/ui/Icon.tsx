import type { ComponentChildren } from 'preact'
import { ICON_ACCENT, type IconName, ICONS } from './icons'

/** Значок-линия (вместо эмодзи): размер - в em, чтобы стоять в строке рядом с текстом; цвет - цвет текста. */
export function Icon(props: { name: IconName; size?: number; class?: string; label?: string }) {
  const em = props.size ?? 1.15
  return (
    <svg
      class={`icon ${props.class ?? ''}`}
      viewBox="0 0 24 24"
      style={{ height: `${em}em`, width: `${em}em` }}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      {ICONS[props.name].map(([k, d]) => (k === 'a' ? <path d={d} fill={ICON_ACCENT} stroke={ICON_ACCENT} /> : <path d={d} />))}
    </svg>
  )
}

/** Текст со значками: метки {i:имя} в строках интерфейса превращаются в значки. */
export function IconText({ text }: { text: string }): ComponentChildren {
  const parts = text.split(/\{i:(\w+)\}/)
  return parts.map((p, i) => (i % 2 ? p in ICONS ? <Icon name={p as IconName} /> : '' : p))
}
