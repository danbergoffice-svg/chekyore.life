import { useEffect, useRef, useState } from 'preact/hooks'
import { useUi } from './text'

interface SoundProps {
  on: boolean
  volume: number
  onChange: (on: boolean, volume: number) => void
}

/** Значок динамика: волн столько, сколько громкости; выключено - перечёркнут. */
function SpeakerIcon({ on, volume }: { on: boolean; volume: number }) {
  const waves = !on || volume === 0 ? 0 : volume < 0.34 ? 1 : volume < 0.67 ? 2 : 3
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor" />
      {waves >= 1 && <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />}
      {waves >= 2 && <path d="M18 7a7 7 0 0 1 0 10" />}
      {waves >= 3 && <path d="M20.5 4.5a10.5 10.5 0 0 1 0 15" />}
      {waves === 0 && <path d="M16 9l5 6M21 9l-5 6" />}
    </svg>
  )
}

/** Кнопка музыки: нажатие открывает панель с переключателем и ползунком громкости. */
export function SoundControl({ on, volume, onChange }: SoundProps) {
  const { t } = useUi()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div class="sound" ref={box}>
      <button type="button" class={on ? 'sound-button' : 'sound-button off'} aria-expanded={open} aria-label={t('sound.title')} title={t('sound.title')} onClick={() => setOpen(!open)}>
        <SpeakerIcon on={on} volume={volume} />
      </button>
      {open && (
        <div class="sound-panel" role="group" aria-label={t('sound.title')}>
          <button type="button" class="sound-toggle" aria-pressed={on} onClick={() => onChange(!on, on || volume > 0 ? volume : 0.5)}>
            <SpeakerIcon on={on} volume={volume} />
            <span>{on ? t('sound.off') : t('sound.on')}</span>
          </button>
          <VolumeSlider on={on} volume={volume} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/** Ползунок громкости 0–100; сдвиг ползунка при выключенной музыке включает её. */
export function VolumeSlider({ on, volume, onChange }: SoundProps) {
  const { t } = useUi()
  return (
    <label class="volume">
      <span class="small muted">{t('sound.volume')}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round((on ? volume : 0) * 100)}
        aria-label={t('sound.volume')}
        onInput={(e) => {
          const v = Number(e.currentTarget.value) / 100
          onChange(v > 0, v > 0 ? v : volume)
        }}
      />
    </label>
  )
}
