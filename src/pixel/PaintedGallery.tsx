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
import { buildPainted, composePainted, getLayout, PH, PW, saveLayout, setLayout } from './painted'
import type { PaintedLayout, PaintedScene } from './painted'
import DEFAULT_LAYOUT from './painted-layout.json'

const REGIONS = Object.values(ERA_META).flatMap((e) => e.regions.map((r) => r.id))
const STYLES = [...new Set(REGIONS.map((r) => lookOf(r).style))].sort()
const PLACES = ['street', 'home', 'yard', 'market', 'temple', 'palace', 'field', 'river', 'harbor', 'road', 'workshop', 'school', 'bath', 'battle']
const TIMES = ['day', 'dawn', 'sunset', 'night', 'overcast'] as const
const MOODS = ['', 'feast', 'war', 'epidemic', 'famine'] as const
const WEATHER = ['', 'rain', 'snow', 'fog'] as const

interface Frame {
  id: string
  region: string
  place: string
  scene: PaintedScene | null
  problems: string[]
}

/** Поля раскладки, которые правятся ползунками: путь в JSON, подпись, мин, макс, шаг. */
const FIELDS: [string, string, number, number, number][] = [
  ['ground', 'Линия ног (y)', 180, 260, 1],
  ['groundStripH', 'Земля: подъём над линией ног (до 25)', 4, 25, 1],
  ['groundStripY', 'Земля: сдвиг от линии ног', -20, 20, 1],
  ['groundStripTexture', 'Земля: сила текстуры', 0, 1, 0.05],
  ['groundStripSrc', 'Земля: откуда брать текстуру', 0, 0.75, 0.05],
  ['far.y', 'Даль: сдвиг вниз', -80, 80, 1],
  ['landmark.y', 'Ориентир: сдвиг вниз', -80, 80, 1],
  ['home.x', 'Свой дом: x', 0, 960, 5],
  ['home.scale', 'Свой дом: масштаб', 0.4, 1.6, 0.05],
  ['street.houses', 'Улица: сколько домов (0–2)', 0, 2, 1],
  ['street.x', 'Улица: дом от края', 60, 480, 5],
  ['street.scale', 'Улица: масштаб дома', 0.4, 1.6, 0.05],
  ['people.center', 'Люди: центр', 200, 760, 5],
  ['people.step', 'Люди: шаг', 20, 120, 1],
  ['people.scale', 'Люди: масштаб', 0.5, 1.6, 0.05],
  ['animals.x', 'Животные: x', 0, 960, 5],
  ['animals.scale', 'Животные: масштаб', 0.4, 1.8, 0.05],
  ['props.scale', 'Предметы: масштаб', 0.4, 1.8, 0.05],
  ['fx.rain.alpha', 'Дождь: непрозрачность', 0, 1, 0.05],
  ['fx.snow.alpha', 'Снег: непрозрачность', 0, 1, 0.05],
  ['fx.fog.alpha', 'Туман: непрозрачность', 0, 1, 0.05],
  ['fx.feast.band', 'Праздник: высота полосы', 0.1, 1, 0.05],
  ['tint.night.alpha', 'Ночь: сила тона', 0, 0.8, 0.02],
  ['tint.war.alpha', 'Война: сила тона', 0, 0.8, 0.02],
  ['tint.epidemic.alpha', 'Мор: сила тона', 0, 0.8, 0.02],
]
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
  const missing = s.plan.layers.filter((l) => !s.img.has(l.key)).map((l) => l.key)
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
          out.push({ id: `${region}:${place}`, region, place, scene: s, problems })
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
            <FrameView f={open} onOpen={() => undefined} />
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
