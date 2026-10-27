// Ролик-пролёт над страницей игры: WebGL2, каждый кадр считается из времени t в seek(t) — без таймеров.
// Страница лежит на полу (текстура полосами), поднятые элементы — отдельные квады на своей высоте, рисуются снизу вверх
// без буфера глубины. Камера — одна кривая скорости (timeline.js), без поворотов. Глубина резкости — по пикселю,
// размытие движения — несколько подкадров на кадр. Финал: подъём, вид сверху, нырок в постер, надпись.
import '@fontsource-variable/alegreya/wght.css'
import '@fontsource-variable/alegreya/wght-italic.css'
import { T, travel, DURATION, FPS } from './timeline.js'
import posterUrl from './poster.webp'

const W = 1080
const H = 1920
const F = 1950 // фокусное расстояние, точки кадра
const TILT = (56 * Math.PI) / 180
const D0 = 1360
const D1 = 1700
const HAZE = [0xf6 / 255, 0xf8 / 255, 0xf9 / 255]
const params = new URLSearchParams(location.search)
const SUB = Number(params.get('sub') || 4) // подкадров размытия движения
const SHUTTER = 0.7 // доля кадра
const RFPS = Number(params.get('fps') || FPS) // частота рендера (затвор — доля её кадра)

const data = await (await fetch('./layers/layers.json')).json()
const PH = data.height
const PW = data.width
const DPR = data.dpr
const lay = data.layout
const Y0 = lay.y0
const HERO = lay.poster // { x, y, w, h } в CSS-пикселях страницы

// ---------- WebGL ----------
const gl3 = document.createElement('canvas')
gl3.width = W
gl3.height = H
const gl = gl3.getContext('webgl2', { antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: false })
const floatOk = !!gl.getExtension('EXT_color_buffer_float')
const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
const out = document.getElementById('out')
out.width = W
out.height = H
const o2 = out.getContext('2d')

function compile(vs, fs) {
  const sh = (t, s) => {
    const x = gl.createShader(t)
    gl.shaderSource(x, s)
    gl.compileShader(x)
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) + '\n' + s)
    return x
  }
  const p = gl.createProgram()
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  const u = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const a = gl.getActiveUniform(p, i)
    u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name)
  }
  return { p, u }
}

const quadBuf = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
const vao = gl.createVertexArray()
gl.bindVertexArray(vao)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

// Квад в мире: O + u·AX + v·AY; камера C, базис R/U/Fw; выход — цвет и глубина (MRT).
const CAM_VS = `#version 300 es
layout(location=0) in vec2 a;
uniform vec3 O, AX, AY, C, R, U, Fw; uniform vec2 uvMin, uvMax; uniform float f;
out vec2 uv; out float depth; out vec2 local;
void main(){
  vec3 p = O + a.x*AX + a.y*AY;
  vec3 d = p - C;
  float xc = dot(d, R), yc = dot(d, U), zc = dot(d, Fw);
  depth = zc;
  uv = mix(uvMin, uvMax, a);
  local = a;
  gl_Position = vec4(xc * 2.0 * f / ${W}.0, yc * 2.0 * f / ${H}.0, 0.0, zc);
}`

// Слой (страница или элемент): текстура, скругление, растворение в дымку.
const LAYER_FS = `#version 300 es
precision highp float;
in vec2 uv; in float depth; in vec2 local;
uniform sampler2D tex; uniform float alpha, fade, lod, radius; uniform vec2 size; uniform vec4 pageRect; uniform float pageR;
uniform vec2 pageOrigin; uniform vec3 haze; uniform int usePage;
layout(location=0) out vec4 col; layout(location=1) out vec4 dep;
float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec4 c = texture(tex, uv, lod);
  float a = alpha;
  // Скругление углов самого квада (в его пикселях).
  if (radius > 0.0) { vec2 p = (local - 0.5) * size; a *= clamp(0.5 - rr(p, size * 0.5, radius), 0.0, 1.0); }
  // Скругление страницы целиком (полосы страницы).
  if (usePage == 1) { vec2 p = pageOrigin + local * size - (pageRect.xy + pageRect.zw * 0.5); a *= clamp(0.5 - rr(p, pageRect.zw * 0.5, pageR), 0.0, 1.0); }
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  rgb = mix(rgb, haze, smoothstep(0.0, 0.7, fade));
  a *= c.a * (1.0 - smoothstep(0.6, 1.0, fade));
  col = vec4(rgb * a, a);
  dep = vec4(depth * a, 0.0, 0.0, a);
}`

// Тень элемента: тот же силуэт плоским цветом, размытый выбором мипа.
const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 uv; in float depth; in vec2 local;
uniform sampler2D tex; uniform float alpha, lod;
layout(location=0) out vec4 col; layout(location=1) out vec4 dep;
void main(){
  float s = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.0 : texture(tex, uv, lod).a;
  float a = s * alpha;
  col = vec4(vec3(0x1a, 0x21, 0x33) / 255.0 * a, a);
  dep = vec4(depth * a, 0.0, 0.0, a);
}`

// Мягкая широкая тень страницы.
const PAGESHADOW_FS = `#version 300 es
precision highp float;
in vec2 uv; in float depth; in vec2 local;
uniform vec2 size; uniform vec4 pageRect; uniform float alpha, spread; uniform vec2 pageOrigin;
layout(location=0) out vec4 col; layout(location=1) out vec4 dep;
float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 p = pageOrigin + local * size - (pageRect.xy + pageRect.zw * 0.5);
  float d = rr(p, pageRect.zw * 0.5, 24.0);
  float a = alpha * (1.0 - smoothstep(-spread * 0.3, spread, d));
  col = vec4(vec3(0x1a, 0x21, 0x33) / 255.0 * a, a);
  dep = vec4(depth * a, 0.0, 0.0, a);
}`

const FULL_VS = `#version 300 es
layout(location=0) in vec2 a; out vec2 uv;
void main(){ uv = a; gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0); }`

// Пол студии: светлый центр, чуть темнее по углам; глубина — далеко.
const FLOOR_FS = `#version 300 es
precision highp float; in vec2 uv;
layout(location=0) out vec4 col; layout(location=1) out vec4 dep;
void main(){
  vec2 p = (uv - 0.5) * vec2(${W}.0 / ${H}.0, 1.0);
  float k = smoothstep(0.15, 0.85, length(p) * 1.2);
  col = vec4(mix(vec3(0xf9, 0xfb, 0xfb), vec3(0xf2, 0xf3, 0xf6), k) / 255.0, 1.0);
  dep = vec4(60000.0, 0.0, 0.0, 1.0);
}`

// Сложение подкадров.
const ACC_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D col, dep; uniform float w;
layout(location=0) out vec4 c; layout(location=1) out vec4 d;
void main(){ c = texture(col, uv) * w; vec4 dd = texture(dep, uv); d = vec4(dd.r / max(dd.a, 1e-4) * w, 0.0, 0.0, w); }`

// Глубина резкости: радиус по глубине пикселя, отводы по «золотому углу», мип по радиусу.
// Размытое считается в половинном разрешении (там мелочи всё равно не видно), резкое берётся из полного кадра.
const COC = `
float coc(float z, float focus, float nearK, float farK){
  float r = z < focus ? nearK * (focus - z) / max(z, 1.0) : farK * (z - focus) / max(z, 1.0);
  return min(r, 120.0);
}`
const DOF_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D col, dep; uniform float focus, nearK, farK;
out vec4 o;
${COC}
void main(){
  float r = coc(texture(dep, uv).r, focus, nearK, farK);
  if (r < 0.7) { o = vec4(textureLod(col, uv, 1.0).rgb, 1.0); return; }
  int n = int(clamp(ceil(r * r / 6.0), 8.0, 40.0));
  float lod = log2(max(1.0, r / sqrt(float(n)) * 1.4));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    float a = float(i) * 2.39996323;
    float rr = sqrt((float(i) + 0.5) / float(n)) * r;
    vec2 off = vec2(cos(a), sin(a)) * rr / vec2(${W}.0, ${H}.0);
    acc += textureLod(col, uv + off, lod).rgb;
  }
  o = vec4(acc / float(n), 1.0);
}`
const MIX_FS = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D col, dep, blur; uniform float focus, nearK, farK;
out vec4 o;
${COC}
void main(){
  float r = coc(texture(dep, uv).r, focus, nearK, farK);
  vec3 sharp = textureLod(col, uv, 0.0).rgb;
  o = vec4(mix(sharp, texture(blur, uv).rgb, smoothstep(0.7, 2.6, r)), 1.0);
}`

const P_LAYER = compile(CAM_VS, LAYER_FS)
const P_SHADOW = compile(CAM_VS, SHADOW_FS)
const P_PSHADOW = compile(CAM_VS, PAGESHADOW_FS)
const P_FLOOR = compile(FULL_VS, FLOOR_FS)
const P_ACC = compile(FULL_VS, ACC_FS)
const P_DOF = compile(FULL_VS, DOF_FS)
const P_MIX = compile(FULL_VS, MIX_FS)

function texFrom(img, mip = true) {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (mip) {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(Number(params.get('aniso') || 4), gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  return t
}
const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })

const tiles = []
for (const tl of data.tiles) tiles.push({ ...tl, tex: texFrom(await load(`./layers/${tl.file}`)) })
const pieces = []
for (const L of data.layers) {
  const img = L.kind === 'hero' ? await load(posterUrl) : await load(`./layers/${L.file}`)
  // Постер — исходной картинкой (чётче снимка страницы); его прямоугольник — без полей.
  const rect = L.kind === 'hero' ? { x: L.x, y: L.y, w: L.w, h: L.h } : { x: L.cx, y: L.cy, w: L.cw, h: L.ch }
  pieces.push({ ...L, rect, tex: texFrom(img), tw: img.width })
}
const tilesP = pieces.filter((p) => p.kind === 'tile').sort((a, b) => a.tile - b.tile)
const heroP = pieces.find((p) => p.kind === 'hero')

// Кадровые буферы: сцена (цвет + глубина), накопление подкадров, итог с мипами.
function target(fmt, w = W, h = H, mip = false) {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  const f32 = fmt === 'f'
  gl.texStorage2D(gl.TEXTURE_2D, mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1, f32 ? gl.RGBA16F : gl.RGBA8, w, h)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}
function fbo(texs) {
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0))
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i))
  return fb
}
const FMT = floatOk ? 'f' : 'b'
const sceneCol = target(FMT)
const sceneDep = target('f')
const sceneFB = fbo([sceneCol, sceneDep])
const accCol = target(FMT, W, H, true)
const accDep = target('f')
const accFB = fbo([accCol, accDep])
const blurTex = target(FMT, W / 2, H / 2)
const blurFB = fbo([blurTex])

// ---------- Камера ----------
const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
const lerp = (a, b, k) => a + (b - a) * k
const v3 = (x, y, z) => [x, y, z]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Камера по взгляду на точку L страницы, расстоянию D и наклону от вертикали th. */
function cameraOf(Lx, Ly, D, th) {
  const s = Math.sin(th)
  const c = Math.cos(th)
  return { C: v3(Lx, Ly + D * s, D * c), R: v3(1, 0, 0), U: v3(0, -c, s), Fw: v3(0, -s, -c), D, th, Lx, Ly }
}
/** Точка страницы → экран. */
function project(cam, p) {
  const d = sub(p, cam.C)
  const zc = dot(d, cam.Fw)
  return { x: W / 2 + (F * dot(d, cam.R)) / zc, y: H / 2 - (F * dot(d, cam.U)) / zc, z: zc }
}

const flightLy = (t) => Y0 + travel(t)
const flightD = (t) => lerp(D0, D1, 1 - Math.pow(1 - Math.min(1, Math.max(0, t / T.flightEnd)), 2))
const D_OVER = (F * PH) / (H - 84)
const S_CARD = 900 / HERO.w
const D_CARD = F / S_CARD
const CARD_TOP = 460

/** Подъём: доля пути по логарифму расстояния (разгон, ровно, торможение до нуля). */
function riseShare(t) {
  const a = T.riseStart
  const b = a + 0.6
  const c = T.riseEnd - 0.3
  const e = T.riseEnd
  const area = (b - a) / 2 + (c - b) + (e - c) / 2
  let s = 0
  if (t <= a) return 0
  if (t <= b) s = ((t - a) * (t - a)) / (2 * (b - a))
  else if (t <= c) s = (b - a) / 2 + (t - b)
  else if (t <= e) { const u = t - c; s = (b - a) / 2 + (c - b) + u - (u * u) / (2 * (e - c)) }
  else s = area
  return s / area
}

/** Ly, при котором нижний край страницы стоит на 42 точки выше низа кадра. */
function anchoredLy(D, th) {
  let lo = -PH
  let hi = PH * 2
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const y = project(cameraOf(PW / 2, mid, D, th), v3(PW / 2, PH, 0)).y
    if (y > H - 42) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function camAt(t) {
  if (t < T.riseStart) return { ...cameraOf(PW / 2, flightLy(t), flightD(t), TILT), phase: 'flight' }
  if (t < T.riseEnd) {
    const Dstart = flightD(T.riseStart)
    const D = Math.exp(lerp(Math.log(Dstart), Math.log(D_OVER), riseShare(t)))
    const th = lerp(TILT, 0, ss(T.tiltFrom, T.tiltTo, t))
    const w = ss(T.riseStart + 0.55, T.riseStart + 0.9, t)
    const Ly = lerp(flightLy(t), anchoredLy(D, th), w)
    return { ...cameraOf(PW / 2, Ly, D, th), phase: 'rise' }
  }
  if (t < T.overheadEnd) {
    const D = D_OVER * (1 - 0.035 * ss(T.riseEnd, T.overheadEnd, t))
    return { ...cameraOf(PW / 2, anchoredLy(D_OVER, 0), D, 0), phase: 'over' }
  }
  if (t < T.diveEnd) {
    const u = (t - T.overheadEnd) / (T.diveEnd - T.overheadEnd)
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
    const D = Math.exp(lerp(Math.log(D_OVER * 0.965), Math.log(D_CARD), e))
    const s = F / D
    // Верх страницы прижат к верху кадра, к концу верх постера опускается на CARD_TOP.
    const pinned = 42 + HERO.y * s
    const yh = lerp(pinned, CARD_TOP, ss(0.55, 1, u))
    const Ly = HERO.y - (yh - H / 2) / s
    return { ...cameraOf(HERO.x + HERO.w / 2, Ly, D, 0), phase: 'dive', dive: u }
  }
  const u = ss(T.diveEnd, DURATION, t)
  const D = D_CARD * (1 - 0.02 * u)
  const Ly = HERO.y - (CARD_TOP - H / 2) / S_CARD
  return { ...cameraOf(HERO.x + HERO.w / 2, Ly, D, 0), phase: 'card', dive: 1 }
}

// ---------- Поднятые элементы ----------
/** Когда элемент проходит середину кадра (поиск по пути камеры). */
const crossTime = (y) => {
  let lo = 0
  let hi = T.flightEnd + 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (flightLy(m) < y) lo = m
    else hi = m
  }
  return lo
}
for (const p of pieces) p.tc = crossTime(p.rect.y + p.rect.h / 2)

/** Доля подъёма элемента к моменту t. */
function liftK(p, t) {
  if (p.kind === 'tile') return 0
  if (p.kind === 'hero' || p.rect.y < HERO.y) return ss(0.1, 1.35, t) // постер, фишки и кнопка в шапке
  return ss(p.tc - 2.4, p.tc - 0.5, t)
}

/** Поза элемента: подъём z, наклон (поворот вокруг своей середины, верх — к объективу), сдвиг в сторону.
 *  cap < 1 — элемент поднимается ниже и стоит положе, чтобы не заслонить заголовок над ним. */
function poseOf(p, t, cap = p.cap ?? 1) {
  const k = liftK(p, t)
  const ang = ((p.stand * Math.PI) / 180) * k * cap
  const half = (p.rect.h / 2) * Math.sin(ang)
  const z = Math.max(lerp(1.5, p.z * cap, k), half + 3)
  const dx = p.fly === 'left' ? -150 * ss(p.tc - 1.2, p.tc + 0.6, t) : p.fly === 'right' ? 150 * ss(p.tc - 1.2, p.tc + 0.6, t) : 0
  return { z, ang, dx }
}

// Заголовок над элементом должен читаться, пока проходит середину кадра и чуть выше: верх поднятого элемента —
// ниже луча от камеры к нижнему краю заголовка (с запасом).
const HEADS = (lay.heads || []).map((h) => ({ top: h.y, bottom: h.y + h.h })).sort((a, b) => a.top - b.top)
function fits(p, head, th, cap) {
  for (let t = th - 0.4; t <= th + 2.0; t += 0.1) {
    const { z, ang, dx } = poseOf(p, t, cap)
    if (Math.abs(dx) > 120) continue
    const h2 = p.h / 2
    const yTop = p.y + h2 - h2 * Math.cos(ang)
    const zTop = z + h2 * Math.sin(ang)
    const cam = camAt(Math.max(0, t))
    const allowed = (0.8 * cam.C[2] * (yTop - head.bottom)) / Math.max(1, cam.C[1] - head.bottom)
    if (zTop > allowed) return false
  }
  return true
}
for (const p of pieces) {
  p.cap = 1
  if (p.kind === 'hero' || p.kind === 'tile') continue
  const head = HEADS.filter((h) => h.bottom <= p.y + 2).pop()
  if (!head) continue
  const th = crossTime((head.top + head.bottom) / 2)
  if (fits(p, head, th, 1)) continue
  let lo = 0.05
  let hi = 1
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2
    if (fits(p, head, th, m)) lo = m
    else hi = m
  }
  p.cap = lo
}
window.caps = pieces.filter((p) => p.cap < 1).map((p) => [p.i, p.kind, Math.round(p.y), +p.cap.toFixed(2)])

/** Плитки логотипа: взлетают от кнопки и летят рядом с камерой (вне страницы, у верхних углов кадра);
 *  третья однажды проносится у самого объектива вдоль левого края; в финале — на углах карточки. */
// Спутники камеры: x страницы, сдвиг вверх по странице от точки взгляда, высота, размер.
const ESCORT = [[-96, -660, 200, 132], [740, -760, 240, 150], [-130, -1900, 150, 120], [790, -2300, 190, 130]]
// Финал: место на экране (x, y), высота и размер в точках экрана.
const FINAL = [[978, 482, 14, 118], [96, 548, 70, 104], [74, 1250, 110, 150], [1006, 900, 150, 170]]
function tileState(i, t) {
  const p = tilesP[i]
  if (t >= T.riseEnd) {
    const [sx, sy, z, size] = FINAL[i]
    const k = (D_CARD - z) / F
    const Ly = HERO.y - (CARD_TOP - H / 2) / S_CARD
    // Медленный дрейф ближних плиток к центру — чтобы финал жил.
    const u = ss(T.diveEnd - 0.2, DURATION, t)
    const dx = (i === 2 ? 26 : i === 3 ? -26 : 0) * u
    const dy = i < 2 ? 4 * Math.sin(t * 1.3 + i) : (i === 2 ? -40 : 40) * u
    return { x: HERO.x + HERO.w / 2 + (sx - W / 2 + dx) * k, y: Ly + (sy - H / 2 + dy) * k, z, size: size * k, alpha: ss(T.overheadEnd, T.diveEnd - 0.1, t) }
  }
  const up = ss(0.15, 1.6, t)
  let [ex, edy, ez, es] = ESCORT[i]
  if (i === 2) {
    // Пролёт у объектива: падает назад к камере и уходит под кадр, потом камера его догоняет.
    const go = ss(23.4, 25.0, t)
    const back = ss(25.4, 31.5, t)
    const w = go * (1 - back)
    edy = lerp(edy, 1150, w)
    ez = lerp(ez, 440, w)
    ex = lerp(ex, -36, w)
  }
  const bob = Math.sin(t * 0.55 + i * 1.7)
  const ax = ex + 8 * Math.sin(t * 0.4 + i)
  const ay = flightLy(t) + edy + 30 * bob
  return {
    x: lerp(p.x + p.w / 2, ax, up),
    y: lerp(p.y + p.h / 2, ay, up),
    z: lerp(1, ez, up),
    size: lerp(32, es, up),
    alpha: 1 - ss(T.riseStart + 0.45, T.riseEnd - 0.25, t),
  }
}

// ---------- Рисование ----------
function setCam(prog, cam) {
  gl.uniform3fv(prog.u.C, cam.C)
  gl.uniform3fv(prog.u.R, cam.R)
  gl.uniform3fv(prog.u.U, cam.U)
  gl.uniform3fv(prog.u.Fw, cam.Fw)
  gl.uniform1f(prog.u.f, F)
}
/** Видимость прямоугольника на полу (грубая): хотя бы один угол перед камерой и рядом с кадром. */
function visible(cam, x, y, w, h, z = 0) {
  let any = false
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const pr = project(cam, v3(px, py, z))
    if (pr.z <= 1) { any = true; continue }
    minx = Math.min(minx, pr.x); maxx = Math.max(maxx, pr.x); miny = Math.min(miny, pr.y); maxy = Math.max(maxy, pr.y)
  }
  if (any) return true
  return maxx > -200 && minx < W + 200 && maxy > -200 && miny < H + 200
}

function drawScene(cam, t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFB)
  gl.viewport(0, 0, W, H)
  gl.disable(gl.BLEND)
  gl.useProgram(P_FLOOR.p)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  const dive = cam.dive ?? 0
  const pageFade = ss(0.2, 0.85, dive)
  const pxPerUnit = F / Math.max(cam.D, 1) // экранных точек на CSS-пиксель у точки взгляда

  // Тень страницы.
  if (pageFade < 1) {
    gl.useProgram(P_PSHADOW.p)
    setCam(P_PSHADOW, cam)
    const m = 70
    gl.uniform3fv(P_PSHADOW.u.O, [-m, -m + 14, 0])
    gl.uniform3fv(P_PSHADOW.u.AX, [PW + 2 * m, 0, 0])
    gl.uniform3fv(P_PSHADOW.u.AY, [0, PH + 2 * m, 0])
    gl.uniform2fv(P_PSHADOW.u.size, [PW + 2 * m, PH + 2 * m])
    gl.uniform2fv(P_PSHADOW.u.pageOrigin, [-m, -m])
    gl.uniform4fv(P_PSHADOW.u.pageRect, [0, 0, PW, PH])
    gl.uniform1f(P_PSHADOW.u.alpha, 0.16 * (1 - pageFade))
    gl.uniform1f(P_PSHADOW.u.spread, 60)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  // Страница полосами.
  gl.useProgram(P_LAYER.p)
  setCam(P_LAYER, cam)
  gl.uniform3fv(P_LAYER.u.haze, HAZE)
  gl.uniform1f(P_LAYER.u.lod, 0)
  gl.uniform1f(P_LAYER.u.radius, 0)
  gl.uniform4fv(P_LAYER.u.pageRect, [0, 0, PW, PH])
  gl.uniform1f(P_LAYER.u.pageR, 24)
  gl.uniform2fv(P_LAYER.u.uvMin, [0, 0])
  gl.uniform2fv(P_LAYER.u.uvMax, [1, 1])
  if (pageFade < 1) {
    gl.uniform1i(P_LAYER.u.usePage, 1)
    for (const tl of tiles) {
      if (!visible(cam, 0, tl.y, PW, tl.h)) continue
      gl.bindTexture(gl.TEXTURE_2D, tl.tex)
      gl.uniform3fv(P_LAYER.u.O, [0, tl.y, 0])
      gl.uniform3fv(P_LAYER.u.AX, [PW, 0, 0])
      gl.uniform3fv(P_LAYER.u.AY, [0, tl.h, 0])
      gl.uniform2fv(P_LAYER.u.size, [PW, tl.h])
      gl.uniform2fv(P_LAYER.u.pageOrigin, [0, tl.y])
      gl.uniform1f(P_LAYER.u.alpha, 1)
      gl.uniform1f(P_LAYER.u.fade, pageFade)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
  }
  gl.uniform1i(P_LAYER.u.usePage, 0)

  // Элементы: сначала тени, потом сами — от низких к высоким.
  const items = []
  for (const p of pieces) {
    if (p.kind === 'tile') continue
    const pose = poseOf(p, t)
    const isHero = p.kind === 'hero'
    const fade = isHero ? 0 : pageFade
    if (fade >= 1) continue
    if (!visible(cam, p.rect.x - 40, p.rect.y - 40, p.rect.w + 80, p.rect.h + 80, 0)) continue
    items.push({ p, pose, fade, isHero })
  }
  for (const s of tilesP.map((_, i) => ({ i, st: tileState(i, t) }))) {
    if (s.st.alpha <= 0.01) continue
    const p = tilesP[s.i]
    // Плитка смотрит в объектив: наклон как у камеры (у кнопки — лежит).
    const ang = (cam.th ?? 0) * ss(0.15, 1.6, t)
    items.push({ p, tile: s.st, pose: { z: s.st.z, ang, dx: 0 }, fade: 0, isHero: false })
  }
  items.sort((a, b) => a.pose.z - b.pose.z)
  const geom = (it) => {
    if (it.tile) {
      // Снимок плитки с полями: сам знак занимает w из cw.
      const sz = (it.tile.size * it.p.cw) / it.p.w
      return { x: it.tile.x - sz / 2, y: it.tile.y - sz / 2, w: sz, h: sz }
    }
    return { x: it.p.rect.x + it.pose.dx, y: it.p.rect.y, w: it.p.rect.w, h: it.p.rect.h }
  }
  // Тени.
  gl.useProgram(P_SHADOW.p)
  setCam(P_SHADOW, cam)
  for (const it of items) {
    const z = it.pose.z
    if (z < 2) continue
    const g = geom(it)
    const blur = 7 + 0.5 * z
    const ox = 0.1 * z
    const oy = 4 + 0.36 * z
    const sx = g.x + ox - blur
    const sy = g.y + oy - blur
    gl.bindTexture(gl.TEXTURE_2D, it.p.tex)
    gl.uniform3fv(P_SHADOW.u.O, [sx, sy, 0.2])
    gl.uniform3fv(P_SHADOW.u.AX, [g.w + 2 * blur, 0, 0])
    gl.uniform3fv(P_SHADOW.u.AY, [0, g.h + 2 * blur, 0])
    gl.uniform2fv(P_SHADOW.u.uvMin, [-blur / g.w, -blur / g.h])
    gl.uniform2fv(P_SHADOW.u.uvMax, [1 + blur / g.w, 1 + blur / g.h])
    const texPerUnit = it.p.tw / g.w
    gl.uniform1f(P_SHADOW.u.lod, Math.log2(Math.max(1, (blur * texPerUnit) / 1.5)))
    const heroBoost = it.isHero ? lerp(0, 0.3, ss(0, 1, cam.dive ?? 0)) : 0
    gl.uniform1f(P_SHADOW.u.alpha, (0.26 + heroBoost) * (it.tile ? it.tile.alpha : 1) * (1 - it.fade))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  // Финальная карточка: мягкая широкая тень под постером.
  if ((cam.dive ?? 0) > 0) {
    gl.bindTexture(gl.TEXTURE_2D, heroP.tex)
    const b = 40
    gl.uniform3fv(P_SHADOW.u.O, [HERO.x - b, HERO.y - b + 18, 0.3])
    gl.uniform3fv(P_SHADOW.u.AX, [HERO.w + 2 * b, 0, 0])
    gl.uniform3fv(P_SHADOW.u.AY, [0, HERO.h + 2 * b, 0])
    gl.uniform2fv(P_SHADOW.u.uvMin, [-b / HERO.w, -b / HERO.h])
    gl.uniform2fv(P_SHADOW.u.uvMax, [1 + b / HERO.w, 1 + b / HERO.h])
    gl.uniform1f(P_SHADOW.u.lod, 5)
    gl.uniform1f(P_SHADOW.u.alpha, 0.22 * ss(0.3, 1, cam.dive))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  // Сами элементы.
  gl.useProgram(P_LAYER.p)
  setCam(P_LAYER, cam)
  for (const it of items) {
    const g = geom(it)
    const { z, ang } = it.pose
    const cy = g.y + g.h / 2
    // Поворот вокруг горизонтальной оси через середину: верхний край поднимается к объективу.
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    const O = [g.x, cy - (g.h / 2) * c, z + (g.h / 2) * s]
    gl.bindTexture(gl.TEXTURE_2D, it.p.tex)
    gl.uniform3fv(P_LAYER.u.O, O)
    gl.uniform3fv(P_LAYER.u.AX, [g.w, 0, 0])
    gl.uniform3fv(P_LAYER.u.AY, [0, g.h * c, -g.h * s])
    gl.uniform2fv(P_LAYER.u.size, [g.w, g.h])
    gl.uniform2fv(P_LAYER.u.uvMin, [0, 0])
    gl.uniform2fv(P_LAYER.u.uvMax, [1, 1])
    // Постер: углы 16 → 38 точек экрана к финалу.
    const rad = it.isHero ? lerp(16, 38 / Math.max(pxPerUnit, 0.001), ss(0, 1, cam.dive ?? 0)) : 0
    gl.uniform1f(P_LAYER.u.radius, it.isHero ? Math.min(rad, g.w / 4) : 0)
    gl.uniform1f(P_LAYER.u.alpha, it.tile ? it.tile.alpha : 1)
    gl.uniform1f(P_LAYER.u.fade, it.fade)
    gl.uniform1f(P_LAYER.u.lod, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

function renderGL(t) {
  // Подкадры размытия движения → накопление.
  gl.bindFramebuffer(gl.FRAMEBUFFER, accFB)
  gl.viewport(0, 0, W, H)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  // В финальной карточке камера почти стоит — хватает одного подкадра.
  const n = t > T.diveEnd + 0.4 ? 1 : SUB
  let focus = 0
  for (let k = 0; k < n; k++) {
    const tk = n > 1 ? t + ((k / (n - 1) - 0.5) * SHUTTER) / RFPS : t
    const cam = camAt(Math.max(0, tk))
    focus += cam.D / n
    drawScene(cam, Math.max(0, tk))
    gl.bindFramebuffer(gl.FRAMEBUFFER, accFB)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(P_ACC.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sceneCol)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, sceneDep)
    gl.uniform1i(P_ACC.u.col, 0)
    gl.uniform1i(P_ACC.u.dep, 1)
    gl.uniform1f(P_ACC.u.w, 1 / n)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
  }
  gl.disable(gl.BLEND)
  gl.bindTexture(gl.TEXTURE_2D, accCol)
  gl.generateMipmap(gl.TEXTURE_2D)
  // Глубина резкости: размытое — в половинном разрешении, затем смешение с резким → холст.
  gl.bindFramebuffer(gl.FRAMEBUFFER, blurFB)
  gl.viewport(0, 0, W / 2, H / 2)
  gl.useProgram(P_DOF.p)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, accCol)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, accDep)
  gl.uniform1i(P_DOF.u.col, 0)
  gl.uniform1i(P_DOF.u.dep, 1)
  gl.uniform1f(P_DOF.u.focus, focus)
  gl.uniform1f(P_DOF.u.nearK, 75)
  gl.uniform1f(P_DOF.u.farK, 6)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, W, H)
  gl.useProgram(P_MIX.p)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, blurTex)
  gl.uniform1i(P_MIX.u.col, 0)
  gl.uniform1i(P_MIX.u.dep, 1)
  gl.uniform1i(P_MIX.u.blur, 2)
  gl.uniform1f(P_MIX.u.focus, focus)
  gl.uniform1f(P_MIX.u.nearK, 75)
  gl.uniform1f(P_MIX.u.farK, 6)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.activeTexture(gl.TEXTURE0)
}

// ---------- Финальная надпись (2D поверх) ----------
const logo = await load('/icon.svg')
const face = new FontFace('Thousands Letopis', `url(${new URL('../../../src/fonts/ThousandsLetopis-VF.woff2', import.meta.url)})`, { weight: '300 700' })
document.fonts.add(await face.load())
await document.fonts.load("italic 400 60px 'Alegreya Variable'")
await document.fonts.load("500 30px 'Alegreya Variable'")

const LINE1 = ['Thousands', 'of', 'Lives']
const TAIL = ['Free,', 'right', 'in', 'your', 'browser.']

// Слово в переходе размывается на маленьком холсте (фильтр на всём кадре в программном рендере очень медленный).
const tmp = document.createElement('canvas')
const tc = tmp.getContext('2d')
function drawWord(w, x, y, font, color, blur, alpha) {
  o2.save()
  o2.globalAlpha = alpha
  if (blur < 0.05) {
    o2.font = font
    o2.fillStyle = color
    o2.fillText(w, x, y)
  } else {
    tc.font = font
    const m = tc.measureText(w)
    const pad = 44
    const asc = Math.ceil(m.actualBoundingBoxAscent)
    tmp.width = Math.ceil(m.width) + pad * 2
    tmp.height = asc + Math.ceil(m.actualBoundingBoxDescent) + pad * 2
    tc.font = font
    tc.filter = `blur(${blur.toFixed(2)}px)`
    tc.fillStyle = color
    tc.fillText(w, pad, pad + asc)
    o2.drawImage(tmp, x - pad, y - asc - pad)
  }
  o2.restore()
}

function words(list, t0, step, font, size, color, y, t) {
  const f = font.replace('{s}', size)
  o2.font = f
  const sp = o2.measureText(' ').width
  const ws = list.map((w) => o2.measureText(w).width)
  const total = ws.reduce((a, b) => a + b, 0) + sp * (list.length - 1)
  let x = (W - total) / 2
  list.forEach((w, i) => {
    const k = Math.min(1, Math.max(0, (t - (t0 + i * step)) / 0.34))
    if (k > 0) {
      const e = 1 - Math.pow(1 - k, 3)
      drawWord(w, x, y + 16 * (1 - e), f, color, 12 * (1 - e), e)
    }
    x += ws[i] + sp
  })
}

function overlay(t) {
  if (t < T.badge) return
  // Значок: белая пилюля с логотипом и адресом.
  const a = ss(T.badge, T.badge + 0.3, t)
  o2.save()
  o2.globalAlpha = a
  o2.font = "500 30px 'Alegreya Variable'"
  const label = 'thousands.life'
  const tw = o2.measureText(label).width
  const pw = tw + 36 + 22 + 28
  const px = (W - pw) / 2
  const py = 70
  o2.fillStyle = '#ffffff'
  o2.shadowColor = 'rgba(26,33,51,0.12)'
  o2.shadowBlur = 18
  o2.shadowOffsetY = 4
  o2.beginPath()
  o2.roundRect(px, py, pw, 58, 29)
  o2.fill()
  o2.shadowColor = 'transparent'
  o2.drawImage(logo, px + 14, py + 11, 36, 36)
  o2.fillStyle = '#2b2119'
  o2.fillText(label, px + 14 + 36 + 14, py + 39)
  o2.restore()
  // Строка 1 и курсивный хвост.
  o2.save()
  o2.font = "500 100px 'Thousands Letopis'"
  let size = 100
  while (o2.measureText(LINE1.join(' ')).width > W - 110 && size > 60) {
    size -= 2
    o2.font = `500 ${size}px 'Thousands Letopis'`
  }
  o2.restore()
  words(LINE1, T.line1, 0.06, "500 {s}px 'Thousands Letopis'", size, '#1d1a17', 270, t)
  words(TAIL, T.tail, 0.05, "italic 400 {s}px 'Alegreya Variable'", 64, '#8b8b92', 370, t)
}

/** Кадр в момент t: WebGL-сцена + надпись; возвращает JPEG (data URL) для кодировщика. */
window.seek = (t, fmt = 'image/jpeg') => {
  const t0 = performance.now()
  renderGL(t)
  if (params.has('prof')) {
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    window.prof = { gl: performance.now() - t0 }
  }
  o2.clearRect(0, 0, W, H)
  o2.drawImage(gl3, 0, 0)
  overlay(t)
  return fmt ? out.toDataURL(fmt, 0.94) : null
}
window.info = { floatOk, aniso: !!aniso, pieces: pieces.length, tiles: tiles.length, PH, D_OVER, D_CARD, renderer: gl.getParameter(gl.RENDERER), FPS, DURATION }
document.body.dataset.ready = '1'
