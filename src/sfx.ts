// Звуки барабана лотереи: рычаг (трещотка, удар внизу, пружина), шорох разгона, щелчки барабанов в такт строкам,
// стук остановки каждого барабана и тихий звон, когда встал последний. Всё синтезируется из шума и тонов – без файлов.
// Функции только строят звук на данном контексте: живом (src/audio.ts) или офлайн (tools/qa/sfx.cjs – для прослушки).

type Out = AudioNode

const noiseFor = new WeakMap<BaseAudioContext, AudioBuffer>()
/** Белый шум на секунду (свой у каждого контекста). */
function noise(c: BaseAudioContext): AudioBuffer {
  let b = noiseFor.get(c)
  if (b) return b
  b = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  noiseFor.set(c, b)
  return b
}

/** Короткий всплеск шума через фильтр: щелчок, стук, шорох. */
function burst(c: BaseAudioContext, out: Out, at: number, o: { freq: number; q?: number; type?: BiquadFilterType; vol: number; attack?: number; decay: number }) {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const f = c.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.value = o.freq
  f.Q.value = o.q ?? 1
  const g = c.createGain()
  const a = o.attack ?? 0.001
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(o.vol, at + a)
  g.gain.exponentialRampToValueAtTime(0.0001, at + a + o.decay)
  src.connect(f).connect(g).connect(out)
  src.start(at, Math.random() * 0.8, a + o.decay + 0.02)
}

/** Затухающий тон (с падением высоты, если задан f1): деревянный призвук, удар, звон. */
function tone(c: BaseAudioContext, out: Out, at: number, o: { f0: number; f1?: number; type?: OscillatorType; vol: number; decay: number }) {
  const osc = c.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.f0, at)
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, at + o.decay)
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(o.vol, at + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.decay)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + o.decay + 0.02)
}

/** Рычаг: трещотка, пока его тянут вниз, тяжёлый удар внизу (~0,28 с) и звяканье пружины на обратном ходу. */
export function leverSound(c: BaseAudioContext, out: Out, at: number): void {
  for (let k = 0; k < 7; k++) {
    const t = at + 0.26 * Math.pow(k / 7, 0.8)
    burst(c, out, t, { freq: 2600 + k * 90, q: 8, vol: 0.32, decay: 0.022 })
    tone(c, out, t, { f0: 3100 + k * 60, type: 'triangle', vol: 0.04, decay: 0.012 })
  }
  const hit = at + 0.28
  burst(c, out, hit, { freq: 900, type: 'lowpass', vol: 0.55, decay: 0.07 })
  tone(c, out, hit, { f0: 120, f1: 55, vol: 0.6, decay: 0.16 })
  tone(c, out, hit, { f0: 640, type: 'triangle', vol: 0.06, decay: 0.08 })
  const back = at + 0.5
  for (const [f, v] of [[520, 0.05], [1310, 0.035], [2150, 0.02]] as const) tone(c, out, back, { f0: f, vol: v, decay: 0.28 })
  burst(c, out, back, { freq: 3000, q: 4, vol: 0.12, decay: 0.03 })
}

/** Когда проезжает строка и когда барабан встаёт – секунды от начала вращения. */
export interface ReelTiming {
  ticks: number[]
  land: number
}

/** Вращение: шорох разгона, щелчок на каждую строку (у барабанов чуть разный тон и место слева-направо),
 *  стук остановки и звон после последнего барабана. */
export function reelsSound(c: BaseAudioContext, out: Out, at: number, reels: ReelTiming[]): void {
  // Шорох разгона: шум с фильтром, который поднимается вверх.
  const src = c.createBufferSource()
  src.buffer = noise(c)
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.2
  f.frequency.setValueAtTime(350, at)
  f.frequency.exponentialRampToValueAtTime(1400, at + 0.35)
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(0.09, at + 0.12)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7)
  src.connect(f).connect(g).connect(out)
  src.start(at)
  src.stop(at + 0.75)

  const pans = [-0.35, 0, 0.35]
  const pitch = [1, 0.9, 1.12]
  let last = 0
  reels.forEach((r, i) => {
    let node: Out = out
    if (typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner()
      p.pan.value = pans[i % 3]
      p.connect(out)
      node = p
    }
    const k = pitch[i % 3]
    for (const t of r.ticks) {
      burst(c, node, at + t, { freq: 1900 * k, q: 5, vol: 0.2, decay: 0.03 })
      tone(c, node, at + t, { f0: 820 * k, type: 'triangle', vol: 0.05, decay: 0.02 })
    }
    const land = at + r.land
    burst(c, node, land, { freq: 700, type: 'lowpass', vol: 0.4, decay: 0.06 })
    tone(c, node, land, { f0: 210 * k, f1: 95 * k, vol: 0.38, decay: 0.12 })
    last = Math.max(last, land)
  })
  // Встал последний барабан – тихий звон.
  const ding = last + 0.08
  for (const [fr, v] of [[1320, 0.07], [1980, 0.04], [2640, 0.02]] as const) tone(c, out, ding, { f0: fr, vol: v, decay: 0.9 })
}
