import type { ComponentChildren } from 'preact'
import { iconRects, iconSize, type IconName, ICONS } from './icons'

/** Пиксельный значок (вместо эмодзи): высота - в em, чтобы стоять в строке рядом с текстом. */
export function Icon(props: { name: IconName; size?: number; class?: string; label?: string }) {
  const [w, h] = iconSize(props.name)
  const em = props.size ?? 1
  return (
    <svg
      class={`icon ${props.class ?? ''}`}
      viewBox={`0 0 ${w} ${h}`}
      style={{ height: `${em}em`, width: `${(em * w) / h}em` }}
      shape-rendering="crispEdges"
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      {iconRects(props.name).map((r) => (
        <rect x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  )
}

/** Текст со значками: метки {i:имя} в строках интерфейса превращаются в значки. */
export function IconText({ text }: { text: string }): ComponentChildren {
  const parts = text.split(/\{i:(\w+)\}/)
  return parts.map((p, i) => (i % 2 ? p in ICONS ? <Icon name={p as IconName} /> : '' : p))
}
