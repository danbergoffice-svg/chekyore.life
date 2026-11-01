import { ERA_FOLDER, ERA_META, REGION_ERA, RELIGION_BY_ID } from '../content'
import PETS from '../content/pets.json'
import type { Lang, Sex, TextParam } from '../engine/types'
import en from './en.json'
import ru from './ru.json'
import tr from './tr.json'

// Новый язык добавляется файлами перевода и строкой здесь, без правок остального кода.
export const LANGS: Lang[] = ['en', 'ru', 'tr']
/** Названия языков в переключателе настроек. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ru: 'Русский', tr: 'Türkçe' }
/** Процент по правилам языка: «58%», по-турецки «%58». */
export const percent = (n: number | string, lang: Lang): string => (lang === 'tr' ? `%${n}` : `${n}%`)
/** Локаль для чисел. */
export const LOCALE: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', tr: 'tr-TR' }

// Тексты стран. ui_ru.json / ui_en.json - названия стран и регионов, нужны сразу (меню, мемориал).
// Остальные ru*.json / en*.json грузятся вместе со страной и только на нужном языке.
type Dict = Record<string, string>
const merge = (files: Record<string, Dict>) => Object.assign({}, ...Object.values(files)) as Dict
const uiRu = merge(import.meta.glob<Dict>('../content/*/ui_ru.json', { eager: true, import: 'default' }))
const uiEn = merge(import.meta.glob<Dict>('../content/*/ui_en.json', { eager: true, import: 'default' }))
const uiTr = merge(import.meta.glob<Dict>('../content/*/ui_tr.json', { eager: true, import: 'default' }))
const lazy = import.meta.glob<Dict>(['../content/*/ru*.json', '../content/*/en*.json', '../content/*/tr*.json'], { import: 'default' })

const dictEn: Dict = { ...en, ...uiEn }
const dicts: Record<Lang, Dict> = {
  ru: { ...ru, ...uiRu },
  en: dictEn,
  // Турецкий переведён не весь: чего нет - берётся из английского (через прототип; allKeys - только переведённое).
  tr: Object.assign(Object.create(dictEn) as Dict, tr, uiTr),
}

const loadedTexts = new Map<string, Promise<void>>()

/** Загрузить тексты папки контента (common, e03, china…) на языке. */
export function loadTexts(lang: Lang, folder: string): Promise<void> {
  // Под турецким лежит английский - его тоже нужно загрузить.
  if (lang === 'tr') return Promise.all([loadTexts('en', folder), loadOwn(lang, folder)]).then(() => undefined)
  return loadOwn(lang, folder)
}

function loadOwn(lang: Lang, folder: string): Promise<void> {
  const id = `${lang}/${folder}`
  let p = loadedTexts.get(id)
  if (!p) {
    const files = Object.entries(lazy)
      .filter(([path]) => path.startsWith(`../content/${folder}/${lang}`))
      .sort(([a], [b]) => a.localeCompare(b))
    p = Promise.all(files.map(([, load]) => load())).then(
      (parts) => {
        for (const part of parts) Object.assign(dicts[lang], part)
      },
      (e) => {
        loadedTexts.delete(id)
        throw e
      },
    )
    loadedTexts.set(id, p)
  }
  return p
}

/** Тексты страны вместе с общим слоем. */
export function loadEraTexts(lang: Lang, eraId: string): Promise<void> {
  return Promise.all([loadTexts(lang, 'common'), loadTexts(lang, ERA_FOLDER[eraId])]).then(() => undefined)
}

/** Все тексты (для тестов и инструментов). */
export async function loadAllTexts(): Promise<void> {
  await Promise.all(LANGS.flatMap((lang) => ['common', ...Object.values(ERA_FOLDER)].map((f) => loadTexts(lang, f))))
}

const names: Record<string, { ru: string; en: string }> = {}
// Клички питомцев (src/content/pets.json) - тоже имена.
for (const byKind of Object.values(PETS.names as Record<string, Record<string, { id: string; ru: string; en: string }[]>>)) for (const list of Object.values(byKind)) for (const n of list) names[n.id] = n
for (const era of Object.values(ERA_META)) {
  for (const region of era.regions) for (const n of [...region.names.m, ...region.names.f]) names[n.id] = n
}

export function hasKey(lang: Lang, key: string): boolean {
  return key in dicts[lang]
}

/** Ключ варианта события: «ev.x.title.3», если такой текст есть, иначе общий «ev.x.title». */
export function variantKey(lang: Lang, key: string, variant: unknown): string {
  return typeof variant === 'number' && variant > 0 && hasKey(lang, `${key}.${variant}`) ? `${key}.${variant}` : key
}

/** Текст ключа без подстановок (для проверок). */
export function rawText(lang: Lang, key: string): string {
  return dicts[lang][key] ?? ''
}

export function allKeys(lang: Lang): string[] {
  return Object.keys(dicts[lang])
}

export interface TextOptions {
  /** Пол героя для форм {g:он|она}. */
  sex?: Sex
  /** Регион: если есть ключ «key.region», он используется вместо общего; затем «key.вера» и «key.СТРАНА». */
  region?: string
  /** Вера героя: ключ «key.islam» и т.п. */
  religion?: string
}

export type T = (key: string, params?: Record<string, TextParam>, opts?: TextOptions) => string

export function nameOf(id: string, lang: Lang): string {
  const n = names[id] as Partial<Record<Lang, string>> | undefined
  return n?.[lang] ?? n?.en ?? id
}

function plural(lang: Lang, n: number, forms: string[]): string {
  const rule = new Intl.PluralRules(lang).select(n)
  const index = rule === 'one' ? 0 : rule === 'few' || rule === 'other' ? 1 : 2
  return forms[Math.min(index, forms.length - 1)]
}

export function createT(lang: Lang, defaults: TextOptions = {}): T {
  const t: T = (key, params = {}, opts = {}) => {
    const o = { ...defaults, ...opts }
    const dict = dicts[lang]
    const era = o.region ? REGION_ERA[o.region] : undefined
    const group = o.religion ? RELIGION_BY_ID.get(o.religion)?.group : undefined
    let s =
      (o.region && dict[`${key}.${o.region}`]) ||
      (o.religion && dict[`${key}.${o.religion}`]) ||
      (group && dict[`${key}.${group}`]) ||
      (era && dict[`${key}.${era}`]) ||
      dict[key]
    if (s === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] ${lang}: no key ${key}`)
      return key
    }
    const value = (p: TextParam): string => {
      if (typeof p === 'object') return 'name' in p ? nameOf(p.name, lang) : t(p.key, params, p.sex ? { ...o, sex: p.sex } : o)
      return String(p)
    }
    // {g:мужская|женская} - по полу героя; {g=param:…|…} - по полу из параметра.
    if (import.meta.env.DEV && o.sex === undefined && /\{g:/.test(s)) console.warn(`[i18n] без пола героя: ${key}`)
    s = s.replace(/\{g(?:=(\w+))?:([^|}]*)\|([^}]*)\}/g, (_, param: string | undefined, m: string, f: string) => {
      const sex = param ? params[param] : o.sex
      return sex === 'f' ? f : m
    })
    // {p=param:форма|формы|форм}
    s = s.replace(/\{p=(\w+):([^}]*)\}/g, (_, param: string, forms: string) => plural(lang, Number(params[param]), forms.split('|')))
    s = s.replace(/\{(\w+)\}/g, (whole, param: string) => (param in params ? value(params[param]) : whole))
    return s
  }
  return t
}

export function formatYear(year: number, lang: Lang): string {
  if (lang === 'ru') return year < 0 ? `${-year} г. до н.э.` : `${year} г. н.э.`
  if (lang === 'tr') return year < 0 ? `MÖ ${-year}` : `MS ${year}`
  return year < 0 ? `${-year} BC` : `AD ${year}`
}

export function formatMoney(t: T, amount: number, coin: string): string {
  return `${amount.toLocaleString()} ${t(`coin.${coin}`, { n: Math.abs(amount) })}`
}

