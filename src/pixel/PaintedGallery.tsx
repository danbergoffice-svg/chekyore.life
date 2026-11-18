// Галерея и редактор живописных сцен: ?gallery=painted (на сайте и в тестовой сборке).
// Собирает кадры так же, как игра (painted.ts), для всех краёв выбранного стиля и выбранных мест, и сама ищет
// косяки: прозрачные дыры в кадре, пустой низ, повторяющиеся дома, незагруженные картинки.
// Слева - раскладка (painted-layout.json): ползунки и цвета меняют все кадры сразу. Клик по кадру - его слои,
// любую картинку можно спрятать (тогда берётся другая). «Сохранить настройки» скачивает painted-layout.json -
// его нужно положить в src/pixel/ проекта (или прислать). Правки сразу действуют и в игре в этом браузере.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ERA_META } from '../content'
import type { SceneDef } from '../engine/types'
import { lookOf } from './scene'
import type { Cast } from './scene'
import { boxOf, buildPainted, composePainted, DEFAULT_ORDER, getLayout, PH, PW, saveLayout, setLayout, slotOf } from './painted'
import type { PaintedLayout, PaintedScene, Placed } from './painted'
import type { SceneInput } from './scene'
import DEFAULT_LAYOUT from './painted-layout.json'

const REGIONS = Object.values(ERA_META).flatMap((e) => e.regions.map((r) => r.id))
const STYLES = [...new Set(REGIONS.map((r) => lookOf(r).style))].sort()
const PLACES = ['street', 'home', 'yard', 'market', 'temple', 'palace', 'field', 'river', 'harbor', 'road', 'workshop', 'school', 'bath', 'battle']
const TIMES = ['day', 'dawn', 'sunset', 'night', 'overcast'] as const
const MOODS = ['', 'feast', 'war', 'epidemic', 'famine'] as const
const WEATHER = ['', 'rain', 'snow', 'fog'] as const

interface Frame {
  input: SceneInput
  id: string
  region: string
  place: string
  scene: PaintedScene | null
  problems: string[]
}

/** Поля раскладки, которые правятся ползунками: путь в JSON, подпись, мин, макс, шаг. */
const FIELDS: [string, string, number, number, number][] = [
  ['ground', 'Линия ног (y)', 60, 300, 1],
  ['groundStripH', 'Земля: подъём над линией ног', 4, 200, 1],
  ['groundStripY', 'Земля: сдвиг от линии ног (вниз +)', -220, 100, 1],
  ['groundStripTexture', 'Земля: сила текстуры', 0, 1, 0.05],
  ['groundStripSrc', 'Земля: откуда брать текстуру', 0, 0.75, 0.05],
  ['far.y', 'Даль: сдвиг вниз', -300, 300, 1],
  ['landmark.y', 'Ориентир: сдвиг вниз', -300, 300, 1],
  ['home.x', 'Свой дом: x', 0, 960, 5],
  ['home.y', 'Свой дом: глубина (вверх -)', -300, 100, 1],
  ['home.scale', 'Свой дом: масштаб', 0.4, 1.6, 0.05],
  ['street.houses', 'Улица: сколько домов (0–2)', 0, 2, 1],
  ['street.x', 'Улица: дом от края', -200, 960, 5],
  ['street.y', 'Улица: глубина дома', -300, 100, 1],
  ['street.scale', 'Улица: масштаб дома', 0.4, 1.6, 0.05],
  ['people.center', 'Люди: центр', 0, 960, 5],
  ['people.y', 'Люди: глубина (вверх -)', -300, 100, 1],
  ['people.step', 'Люди: шаг между людьми', 10, 220, 1],
  ['people.stepCrowded', 'Люди: шаг, если больше 6', 10, 160, 1],
  ['people.scale', 'Люди: масштаб', 0.5, 1.6, 0.05],
  ['animals.x', 'Животные: x', 0, 960, 5],
  ['animals.y', 'Животные: глубина', -300, 100, 1],
  ['animals.step', 'Животные: шаг', 20, 200, 1],
  ['animals.scale', 'Животные: масштаб', 0.4, 1.8, 0.05],
  ['props.scale', 'Предметы: масштаб', 0.4, 1.8, 0.05],
  ['props.x', 'Предметы: x', 0, 960, 5],
  ['props.fireX', 'Очаг: x', 0, 960, 5],
  ['props.y', 'Предметы: глубина', -300, 100, 1],
  ['fx.rain.alpha', 'Дождь: непрозрачность', 0, 1, 0.05],
  ['fx.snow.alpha', 'Снег: непрозрачность', 0, 1, 0.05],
  ['fx.fog.alpha', 'Туман: непрозрачность', 0, 1, 0.05],
  ['fx.feast.band', 'Праздник: высота полосы', 0.1, 1, 0.05],
  ['tint.night.alpha', 'Ночь: сила тона', 0, 0.8, 0.02],
  ['tint.war.alpha', 'Война: сила тона', 0, 0.8, 0.02],
  ['tint.epidemic.alpha', 'Мор: сила тона', 0, 0.8, 0.02],
]
/** Свободный сдвиг и масштаб каждого слоя целиком (move.<слой>). */
const MOVE_FIELDS = (slot: string): [string, string, number, number, number][] => [
  [`move.${slot}.x`, 'вбок', -960, 960, 1],
  [`move.${slot}.y`, 'вниз +, вверх -', -300, 300, 1],
  [`move.${slot}.scale`, 'масштаб', 0.2, 3, 0.05],
]
const NO_MOVE = { x: 0, y: 0, scale: 1 }
/** Раскладка с полным move (старые сохранения его не знают). */
function withMove(l: PaintedLayout): PaintedLayout {
  const m = { ...((l as { move?: Record<string, typeof NO_MOVE> }).move ?? {}) }
  for (const s of DEFAULT_ORDER) m[s] = { ...NO_MOVE, ...m[s] }
  return { ...l, move: m } as PaintedLayout
}

const COLORS: [string, string][] = [
  ['tint.night.color', 'Ночь'],
  ['tint.sunset.color', 'Закат'],
  ['tint.war.color', 'Война'],
  ['tint.epidemic.color', 'Мор'],
]

const get = (o: unknown, path: string): unknown => path.split('.').reduce((v: unknown, k) => (v as Record<string, unknown>)?.[k], o)
function set(o: PaintedLayout, path: string, value: unknown): PaintedLayout {
  const copy = JSON.parse(JSON.stringify(o)) as PaintedLayout
  const keys = path.split('.')
  let cur = copy as unknown as Record<string, unknown>
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>
  cur[keys[keys.length - 1]] = value
  return copy
}

const ORDER_NAMES: Record<string, string> = { sky: 'небо', interior: 'комната', far: 'даль', landmark: 'ориентир края', ground: 'земля под ногами', houses: 'дома', props: 'предметы', animals: 'животные', people: 'люди', fx: 'погода и праздник' }
const swap = (arr: string[], i: number, j: number) => {
  const a = [...arr]
  ;[a[i], a[j]] = [a[j], a[i]]
  return a
}

/** Семья для кадров: герой, супруга, двое детей, мать; куры, собака, конь. */
function familyCast(home: number, burned: boolean): Cast {
  return {
    members: [
      { role: 'hero', sex: 'm', age: 34, seed: 'h', cls: 'craftsman' },
      { role: 'spouse', sex: 'f', age: 30, seed: 's', cls: 'craftsman' },
      { role: 'child', sex: 'f', age: 8, seed: 'c', cls: 'craftsman' },
      { role: 'child', sex: 'm', age: 1, seed: 'b', cls: 'craftsman' },
      { role: 'parent', sex: 'f', age: 64, seed: 'p', cls: 'craftsman' },
    ],
    animals: ['chickens', 'dog', 'horse'],
    home,
    homeState: burned ? 'burned' : undefined,
  } as Cast
}

/** Косяки кадра по готовым пикселям и плану. */
function check(canvas: HTMLCanvasElement, s: PaintedScene): string[] {
  const out: string[] = []
  const ctx = canvas.getContext('2d')!
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let holes = 0
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) holes++
  const total = d.length / 4 / 7
  if (holes / total > 0.004) out.push(`дыры в кадре: ${Math.round((holes / total) * 100)}%`)
  let bottom = 0
  const W = canvas.width
  for (let y = canvas.height - 4; y < canvas.height; y++) for (let x = 0; x < W; x += 3) if (d[(y * W + x) * 4 + 3] < 250) bottom++
  if (bottom > 3) out.push('пустой низ')
  const houses = s.plan.layers.filter((l) => l.key.startsWith('house.')).map((l) => l.key)
  if (new Set(houses).size !== houses.length) out.push('одинаковые дома')
  const missing = s.plan.layers.filter((l) => !l.weather && !s.img.has(l.key)).map((l) => l.key)
  if (missing.length) out.push(`не загрузилось: ${missing.join(', ')}`)
  return out
}

function FrameView({ f, onOpen }: { f: Frame; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current && f.scene) composePainted(ref.current.getContext('2d')!, f.scene, 0)
  }, [f])
  return (
    <button type="button" class={`pg-frame ${f.problems.length ? 'bad' : ''}`} onClick={onOpen}>
      <canvas ref={ref} width={PW} height={PH} />
      <span class="pg-label">
        {f.region} · {f.place}
        {f.scene ? '' : ' · нет живописи (пиксельная сцена)'}
      </span>
      {f.problems.map((p) => (
        <span class="pg-problem">{p}</span>
      ))}
    </button>
  )
}

/** Увеличенный кадр: мышью (или пальцем) двигаются группы - люди, свой дом, соседний дом, животные, предметы. */
function EditFrame({ frame, layout, onLive, onDone }: { frame: Frame; layout: PaintedLayout; onLive: (l: PaintedLayout) => void; onDone: (l: PaintedLayout) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [scene, setScene] = useState<PaintedScene | null>(frame.scene)
  const drag = useRef<{ l: Placed | null; slot: string | null; x: number; y: number; start: PaintedLayout } | null>(null)
  const [grab, setGrab] = useState('')
  const [hint, setHint] = useState('')
  useEffect(() => {
    if (ref.current && scene) composePainted(ref.current.getContext('2d')!, scene, 0)
  }, [scene])
  const rebuild = async (l: PaintedLayout) => {
    setLayout(l)
    onLive(l)
    setScene(await buildPainted(frame.input))
  }
  const point = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * PW, y: ((e.clientY - r.top) / r.height) * PH }
  }
  const NAMES: Record<string, string> = { people: 'люди', home: 'свой дом', street: 'соседний дом', animals: 'животные', props: 'предметы' }
  const down = (e: PointerEvent) => {
    if (!scene) return
    const p = point(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // Выбран слой - тянем его целиком, где бы ни нажали.
    if (grab) {
      drag.current = { l: null, slot: grab, x: p.x, y: p.y, start: withMove(layout) }
      setHint(`Тяну слой: ${ORDER_NAMES[grab]}`)
      return
    }
    const hit = [...scene.plan.layers].reverse().find((l) => {
      const b = boxOf(scene, l)
      return b && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1
    })
    if (!hit) return
    const slot = hit.group ? null : slotOf(hit)
    drag.current = { l: hit, slot, x: p.x, y: p.y, start: withMove(layout) }
    setHint(`Тяну: ${slot ? `слой «${ORDER_NAMES[slot]}»` : NAMES[hit.group!]}`)
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    const dx = Math.round(p.x - d.x)
    const dy = Math.round(p.y - d.y)
    const L = JSON.parse(JSON.stringify(d.start)) as PaintedLayout
    if (d.slot || !d.l) {
      const m = (L as unknown as { move: Record<string, { x: number; y: number }> }).move[d.slot!]
      const st = (d.start as unknown as { move: Record<string, { x: number; y: number }> }).move[d.slot!]
      m.x = st.x + dx
      m.y = st.y + dy
      rebuild(L)
      return
    }
    const g = d.l.group!
    if (g === 'street') {
      // Дом слева задан расстоянием от правого края кадра, справа - от левого (зеркально).
      L.street.x = Math.max(0, Math.min(480, d.start.street.x + (d.l.x < PW / 2 ? -dx : dx)))
      L.street.y = d.start.street.y + dy
    } else if (g === 'props' && d.l.key === 'prop.fire') {
      L.props.fireX = d.start.props.fireX + dx
      L.props.y = d.start.props.y + dy
    } else {
      const grp = L[g] as { x?: number; center?: number; y: number }
      const st = d.start[g] as { x?: number; center?: number; y: number }
      if (g === 'people') grp.center = (st.center ?? 0) + dx
      else grp.x = (st.x ?? 0) + dx
      grp.y = st.y + dy
    }
    rebuild(L)
  }
  const up = () => {
    if (!drag.current) return
    drag.current = null
    setHint('')
    onDone(getLayout() as PaintedLayout)
  }
  return (
    <div>
      <canvas ref={ref} width={PW} height={PH} class="pg-edit" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <p class="pg-note">{hint || 'Тяните мышью что угодно: людей, дома, животных, предметы - а там, где их нет, землю, даль или ориентир. Двигается весь слой во всех кадрах.'}</p>
      <div class="pg-grab">
        Тянуть:{' '}
        <button type="button" class={grab === '' ? 'on' : ''} onClick={() => setGrab('')}>
          что под мышью
        </button>
        {DEFAULT_ORDER.map((s) => (
          <button type="button" class={grab === s ? 'on' : ''} onClick={() => setGrab(s)}>
            {ORDER_NAMES[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PaintedGallery() {
  const [style, setStyle] = useState('japanese')
  const [places, setPlaces] = useState<string[]>(['street', 'home', 'yard', 'market', 'temple', 'field'])
  const [time, setTime] = useState<(typeof TIMES)[number]>('day')
  const [mood, setMood] = useState<(typeof MOODS)[number]>('')
  const [weather, setWeather] = useState<(typeof WEATHER)[number]>('')
  const [home, setHome] = useState(2)
  const [burned, setBurned] = useState(false)
  const [layout, setL] = useState<PaintedLayout>(getLayout())
  const [frames, setFrames] = useState<Frame[]>([])
  const [onlyBad, setOnlyBad] = useState(false)
  const [open, setOpen] = useState<Frame | null>(null)
  const [busy, setBusy] = useState(false)
  const regions = useMemo(() => REGIONS.filter((r) => lookOf(r).style === style), [style])

  const update = (l: PaintedLayout) => {
    setL(l)
    setLayout(l)
    saveLayout(l)
  }

  useEffect(() => {
    let gone = false
    setBusy(true)
    ;(async () => {
      const out: Frame[] = []
      const probe = document.createElement('canvas')
      probe.width = PW
      probe.height = PH
      for (const region of regions)
        for (const place of places) {
          const scene: SceneDef = { place: place as SceneDef['place'], time, props: place === 'home' ? ['bed', 'lamp'] : place === 'market' ? ['coins', 'amphora'] : place === 'field' ? ['grain', 'goat'] : [] }
          const s = await buildPainted({ scene, region, seed: `${region}:${place}`, cast: familyCast(home, burned), mood: mood || undefined, weather: weather || null })
          let problems: string[] = []
          if (s) {
            composePainted(probe.getContext('2d')!, s, 0)
            problems = check(probe, s)
          }
          out.push({ input: { scene, region, seed: `${region}:${place}`, cast: familyCast(home, burned), mood: mood || undefined, weather: weather || null }, id: `${region}:${place}`, region, place, scene: s, problems })
        }
      if (!gone) {
        setFrames(out)
        setBusy(false)
      }
    })()
    return () => {
      gone = true
    }
  }, [regions, places.join(), time, mood, weather, home, burned, JSON.stringify(layout)])

  const bad = frames.filter((f) => f.problems.length)
  const toggleHide = (key: string) => {
    const id = `${style}/${key}`
    const hide = layout.hide.includes(id) ? layout.hide.filter((h) => h !== id) : [...layout.hide, id]
    update({ ...layout, hide })
  }
  const download = () => {
    const blob = new Blob([JSON.stringify(layout, null, 2) + '\n'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'painted-layout.json'
    a.click()
  }

  return (
    <div class="pg">
      <aside class="pg-side">
        <h1>Живописные сцены</h1>
        <p class="pg-note">Правки сразу видны во всех кадрах и действуют в игре в этом браузере. Чтобы они попали на сайт - «Сохранить настройки» и прислать файл.</p>
        <label>
          Стиль{' '}
          <select value={style} onChange={(e) => setStyle((e.target as HTMLSelectElement).value)}>
            {STYLES.map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Места</legend>
          {PLACES.map((p) => (
            <label class="pg-check">
              <input type="checkbox" checked={places.includes(p)} onChange={() => setPlaces(places.includes(p) ? places.filter((x) => x !== p) : [...places, p])} /> {p}
            </label>
          ))}
        </fieldset>
        <label>
          Время{' '}
          <select value={time} onChange={(e) => setTime((e.target as HTMLSelectElement).value as typeof time)}>
            {TIMES.map((x) => (
              <option value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Мир{' '}
          <select value={mood} onChange={(e) => setMood((e.target as HTMLSelectElement).value as typeof mood)}>
            {MOODS.map((x) => (
              <option value={x}>{x || 'обычно'}</option>
            ))}
          </select>
        </label>
        <label>
          Погода{' '}
          <select value={weather} onChange={(e) => setWeather((e.target as HTMLSelectElement).value as typeof weather)}>
            {WEATHER.map((x) => (
              <option value={x}>{x || 'ясно'}</option>
            ))}
          </select>
        </label>
        <label>
          Дом семьи: {home}
          <input type="range" min={0} max={4} value={home} onInput={(e) => setHome(+(e.target as HTMLInputElement).value)} />
        </label>
        <label class="pg-check">
          <input type="checkbox" checked={burned} onChange={() => setBurned(!burned)} /> дом сгорел
        </label>
        <h2>Раскладка</h2>
        {FIELDS.map(([path, label, min, max, step]) => (
          <label>
            {label}: <b>{String(get(layout, path))}</b>
            <input type="range" min={min} max={max} step={step} value={Number(get(layout, path))} onInput={(e) => update(set(layout, path, +(e.target as HTMLInputElement).value))} />
          </label>
        ))}
        <label class="pg-check">
          <input type="checkbox" checked={layout.groundStrip} onChange={() => update({ ...layout, groundStrip: !layout.groundStrip })} /> полоса земли под ногами
        </label>
        {COLORS.map(([path, label]) => (
          <label class="pg-check">
            <input type="color" value={String(get(layout, path))} onInput={(e) => update(set(layout, path, (e.target as HTMLInputElement).value))} /> {label}
          </label>
        ))}
        <h2>Порядок слоёв (снизу вверх)</h2>
        <p class="pg-note">Что выше в списке - рисуется позади. Стрелками можно, например, поставить животных перед людьми.</p>
        {(layout.order ?? DEFAULT_ORDER).map((slot, i, arr) => (
          <div class="pg-order">
            <span>{ORDER_NAMES[slot] ?? slot}</span>
            <button type="button" disabled={i === 0} onClick={() => update({ ...layout, order: swap(arr, i, i - 1) })} aria-label="ниже">↑</button>
            <button type="button" disabled={i === arr.length - 1} onClick={() => update({ ...layout, order: swap(arr, i, i + 1) })} aria-label="выше">↓</button>
          </div>
        ))}
        <h2>Свободно: каждый слой целиком</h2>
        <p class="pg-note">Сдвиг и масштаб всего слоя поверх остальных настроек. То же - мышью в открытом кадре: «Тянуть: земля» и т. п.</p>
        {DEFAULT_ORDER.map((slot) => (
          <details class="pg-move">
            <summary>{ORDER_NAMES[slot]}</summary>
            {MOVE_FIELDS(slot).map(([path, label, min, max, step]) => (
              <label>
                {label}: <b>{String(get(withMove(layout), path))}</b>
                <input type="range" min={min} max={max} step={step} value={Number(get(withMove(layout), path))} onInput={(e) => update(set(withMove(layout), path, +(e.target as HTMLInputElement).value))} />
              </label>
            ))}
          </details>
        ))}
        <h2>Спрятанные картинки ({layout.hide.length})</h2>
        {layout.hide.map((h) => (
          <div class="pg-hidden">
            {h}{' '}
            <button type="button" onClick={() => update({ ...layout, hide: layout.hide.filter((x) => x !== h) })}>
              вернуть
            </button>
          </div>
        ))}
        <div class="pg-buttons">
          <button type="button" class="primary" onClick={download}>
            Сохранить настройки
          </button>
          <button type="button" class="secondary" onClick={() => update(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)))}>
            Сбросить
          </button>
        </div>
      </aside>
      <main class="pg-main">
        <p class="pg-summary">
          {busy ? 'Собираю кадры…' : `Кадров: ${frames.length}, с косяками: ${bad.length}`}{' '}
          <label class="pg-check">
            <input type="checkbox" checked={onlyBad} onChange={() => setOnlyBad(!onlyBad)} /> только с косяками
          </label>
        </p>
        <div class="pg-grid">
          {(onlyBad ? bad : frames).map((f) => (
            <FrameView f={f} onOpen={() => setOpen(f)} />
          ))}
        </div>
      </main>
      {open && (
        <div class="pg-modal" onClick={() => setOpen(null)}>
          <div class="pg-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>
              {open.region} · {open.place}
            </h2>
            <EditFrame frame={open} layout={layout} onLive={setL} onDone={update} />
            <p class="pg-note">Слои снизу вверх. «Спрятать» - картинка больше не используется (берётся другая того же слоя).</p>
            {open.scene?.plan.layers.map((l) => (
              <div class="pg-layer">
                <code>{l.key}</code>
                <button type="button" onClick={() => toggleHide(l.key)}>
                  {layout.hide.includes(`${style}/${l.key}`) ? 'вернуть' : 'спрятать'}
                </button>
              </div>
            ))}
            <button type="button" class="secondary" onClick={() => setOpen(null)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
