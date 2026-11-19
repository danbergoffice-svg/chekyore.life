// Конструктор герба рода (19.11, вместо 20 готовых): живое превью сверху, ниже ряды вариантов - форма щита, поле,
// деление и второй цвет, знак, цвет знака, имя рода. Утверждают один раз (setArms); герб остаётся в хронике,
// мемориале и на карточке рода.
import { useState } from 'preact/hooks'
import { ARMS_NAME_MAX, CHARGES, DIVISIONS, LEGACY_CHARGES, legacyArms, METALS, readable, SHAPES, TINCTURE_HEX, TINCTURES } from '../engine/arms'
import type { ArmsSpec, Tincture } from '../engine/arms'
import { setArms } from '../engine/dynasty'
import type { GameState } from '../engine/types'
import { platform } from '../platform'
import { Arms, houseName } from './Arms'
import { useUi } from './text'

/** Начальный герб: один из прежних готовых, по роду (у каждого рода свой). */
function initial(familyId: string): ArmsSpec {
  let h = 0
  for (const c of familyId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return legacyArms(LEGACY_CHARGES[h % LEGACY_CHARGES.length])!
}

/** Второй цвет поля: прежний, если он не сливается с полем и знаком, иначе - металл к цвету (цвет к металлу). */
function second(a: ArmsSpec): Tincture {
  if (a.field2 !== a.field && a.field2 !== a.ink) return a.field2
  const order: Tincture[] = METALS.includes(a.field) ? ['gules', 'azure', 'sable', 'vert', 'purpure', 'or', 'argent'] : ['argent', 'or', 'gules', 'azure', 'sable', 'vert', 'purpure']
  return order.find((x) => x !== a.field && x !== a.ink)!
}

function Swatches({ value, onPick, label }: { value: Tincture; onPick: (t: Tincture) => void; label: string }) {
  const { t } = useUi()
  return (
    <div class="arms-swatches" role="radiogroup" aria-label={label}>
      {TINCTURES.map((x) => (
        <button type="button" role="radio" aria-checked={value === x} aria-label={t(`arms.tincture.${x}`)} class={`arms-swatch${value === x ? ' on' : ''}`} onClick={() => onPick(x)}>
          <span class="arms-chip" style={{ background: TINCTURE_HEX[x] }} />
          <span class="arms-swatch-name">{t(`arms.tincture.${x}`)}</span>
        </button>
      ))}
    </div>
  )
}

export function ArmsBuilder({ state, onChange }: { state: GameState; onChange: () => void }) {
  const { t } = useUi()
  const [a, setA] = useState<ArmsSpec>(() => initial(state.family.id))
  const [own, setOwn] = useState(false)
  const [name, setName] = useState('')
  const set = (p: Partial<ArmsSpec>) => setA({ ...a, ...p })
  const spec: ArmsSpec = { ...a, name: own && name.trim() ? name : undefined }
  const confirm = () => {
    if (!setArms(state, spec)) return
    platform.track('house_pick', { house: spec.charge, shape: spec.shape, division: spec.division, own: spec.name ? 1 : 0 })
    onChange()
  }
  const row = (title: string, body: preact.ComponentChildren) => (
    <div class="arms-row">
      <h3 class="arms-row-title">{title}</h3>
      {body}
    </div>
  )
  return (
    <section class="block house-pick arms-builder">
      <h2 class="section-title">{t('house.pick')}</h2>
      <p class="small muted">{t('house.pick_hint')}</p>
      <div class="arms-sheet">
        <div class="arms-preview" aria-live="polite">
          <Arms arms={spec} size={92} label={houseName(t, { arms: spec })} />
          <strong class="arms-preview-name">{houseName(t, { arms: spec })}</strong>
          {!readable(spec) && <p class="small arms-warn">{t('arms.hint_contrast')}</p>}
        </div>

        {row(t('arms.shape'), (
          <div class="arms-options" role="radiogroup" aria-label={t('arms.shape')}>
            {SHAPES.map((x) => (
              <button type="button" role="radio" aria-checked={a.shape === x} aria-label={t(`arms.shape.${x}`)} class={`arms-option${a.shape === x ? ' on' : ''}`} onClick={() => set({ shape: x })}>
                <Arms arms={{ ...a, shape: x }} size={34} />
              </button>
            ))}
          </div>
        ))}

        {row(t('arms.field'), <Swatches value={a.field} label={t('arms.field')} onPick={(x) => set({ field: x })} />)}

        {row(t('arms.division'), (
          <div class="arms-divisions" role="radiogroup" aria-label={t('arms.division')}>
            {DIVISIONS.map((x) => (
              <button type="button" role="radio" aria-checked={a.division === x} aria-label={t(`arms.division.${x}`)} class={`arms-option labeled${a.division === x ? ' on' : ''}`} onClick={() => set({ division: x, field2: second(a) })}>
                <Arms arms={{ ...a, division: x, field2: second(a) }} size={30} />
                <span class="arms-swatch-name">{t(`arms.division.${x}`)}</span>
              </button>
            ))}
          </div>
        ))}

        {a.division !== 'plain' && row(t('arms.field2'), <Swatches value={a.field2} label={t('arms.field2')} onPick={(x) => set({ field2: x })} />)}

        {row(t('arms.charge'), (
          <div class="arms-charges" role="radiogroup" aria-label={t('arms.charge')}>
            {CHARGES.map((c) => (
              <button type="button" role="radio" aria-checked={a.charge === c} aria-label={t(`house.${c}`)} title={t(`house.${c}`)} class={`arms-option${a.charge === c ? ' on' : ''}`} onClick={() => set({ charge: c })}>
                <Arms arms={{ ...a, charge: c }} size={34} />
              </button>
            ))}
          </div>
        ))}

        {row(t('arms.ink'), <Swatches value={a.ink} label={t('arms.ink')} onPick={(x) => set({ ink: x })} />)}

        {row(t('arms.name'), (
          <div class="arms-name">
            <label class="arms-name-opt">
              <input type="radio" name="arms-name" checked={!own} onChange={() => setOwn(false)} />
              <span>{t(`house.${a.charge}`)}</span>
            </label>
            <label class="arms-name-opt">
              <input type="radio" name="arms-name" checked={own} onChange={() => setOwn(true)} />
              <span>{t('arms.name_own')}</span>
            </label>
            {own && (
              <input
                type="text"
                class="arms-name-input"
                maxLength={ARMS_NAME_MAX}
                value={name}
                placeholder={t('arms.name_placeholder')}
                aria-label={t('arms.name_own')}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />
            )}
          </div>
        ))}

        <button type="button" class="primary arms-confirm" onClick={confirm}>{t('arms.confirm')}</button>
      </div>
    </section>
  )
}
