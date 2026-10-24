import { ERAS } from '../content'
import type { Lang, Sex, TextParam } from '../engine/types'
import en from './en.json'
import ru from './ru.json'

// Новый язык добавляется файлами перевода и строкой здесь, без правок остального кода.
export const LANGS: Lang[] = ['ru', 'en']

// Тексты контента: все файлы ru*.json / en*.json в папках эпох.
const merge = (files: Record<string, Record<string, string>>) => Object.assign({}, ...Object.values(files)) as Record<string, string>
const contentRu = merge(import.meta.glob('../content/*/ru*.json', { eager: true, import: 'default' }))
const contentEn = merge(import.meta.glob('../content/*/en*.json', { eager: true, import: 'default' }))

const dicts: Record<Lang, Record<string, string>> = {
  ru: { ...ru, ...contentRu },
  en: { ...en, ...contentEn },
}

const names: Record<string, { ru: string; en: string }> = {}
for (const era of Object.values(ERAS)) {
  for (const region of era.regions) for (const n of [...region.names.m, ...region.names.f]) names[n.id] = n
}

export function hasKey(lang: Lang, key: string): boolean {
  return key in dicts[lang]
}

export function allKeys(lang: Lang): string[] {
  return Object.keys(dicts[lang])
}

export interface TextOptions {
  /** Пол героя для форм {g:он|она}. */
  sex?: Sex
  /** Регион: если есть ключ «key.region», он используется вместо общего. */
  region?: string
}

export type T = (key: string, params?: Record<string, TextParam>, opts?: TextOptions) => string

export function nameOf(id: string, lang: Lang): string {
  return names[id]?.[lang] ?? id
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
    let s = (o.region && dict[`${key}.${o.region}`]) || dict[key]
    if (s === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] ${lang}: no key ${key}`)
      return key
    }
    const value = (p: TextParam): string => {
      if (typeof p === 'object') return 'name' in p ? nameOf(p.name, lang) : t(p.key, params, o)
      return String(p)
    }
    // {g:мужская|женская} — по полу героя; {g=param:…|…} — по полу из параметра.
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
  return year < 0 ? `${-year} BC` : `AD ${year}`
}

export function formatMoney(t: T, amount: number, coin: string): string {
  return `${amount.toLocaleString()} ${t(`coin.${coin}`, { n: Math.abs(amount) })}`
}

export function detectLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
