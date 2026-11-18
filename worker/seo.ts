// Страница игры на пяти языках для поисковиков и превью ссылок (правка 18.11).
// Сам index.html - английский (76% игроков с 8.11). Адреса /?lang=ru|es|fr|tr отдают тот же файл, но с заголовком,
// описанием, превью и canonical на своём языке; index.html ссылается на них через hreflang.
// Тексты - коротко и без преувеличений: что это, как играется, сколько стоит, что тексты ещё не проверены историками.

export const SEO_LANGS = ['en', 'ru', 'es', 'fr', 'tr'] as const
export type SeoLang = (typeof SEO_LANGS)[number]

interface SeoText {
  /** <title> и og:title. */
  title: string
  /** meta description и og:description: до ~160 знаков. */
  description: string
  ogLocale: string
  imageAlt: string
}

export const SEO: Record<SeoLang, SeoText> = {
  en: {
    title: 'Thousands of Lives: a free life simulator in history',
    description: 'A free browser game. A birth lottery picks your country, era and family; then you live one life, choice by choice, in about 20 minutes. 14 countries, from Egypt to the Inca.',
    ogLocale: 'en_US',
    imageAlt: 'Thousands of Lives: a painted scene from a random life in history',
  },
  ru: {
    title: 'Тысячи жизней: бесплатный симулятор жизни в истории',
    description: 'Бесплатная браузерная игра. Лотерея рождения выбирает страну, эпоху и семью, дальше ты проживаешь одну жизнь, решение за решением, минут за 20. 14 стран, от Египта до инков.',
    ogLocale: 'ru_RU',
    imageAlt: 'Тысячи жизней: живописная сцена из случайной жизни в истории',
  },
  es: {
    title: 'Miles de vidas: un simulador de vida gratis en la historia',
    description: 'Un juego gratis en el navegador. Una lotería de nacimiento elige tu país, tu época y tu familia; luego vives una vida, decisión a decisión, en unos 20 minutos. 14 países.',
    ogLocale: 'es_ES',
    imageAlt: 'Miles de vidas: una escena pintada de una vida al azar en la historia',
  },
  fr: {
    title: 'Mille vies : un simulateur de vie gratuit dans l’histoire',
    description: 'Un jeu gratuit dans le navigateur. Une loterie de naissance choisit ton pays, ton époque et ta famille ; puis tu vis une vie, choix après choix, en 20 minutes environ. 14 pays.',
    ogLocale: 'fr_FR',
    imageAlt: 'Mille vies : une scène peinte d’une vie au hasard dans l’histoire',
  },
  tr: {
    title: 'Binlerce Hayat: tarihte ücretsiz bir hayat simülasyonu',
    description: 'Ücretsiz bir tarayıcı oyunu. Doğum piyangosu ülkeni, çağını ve aileni seçer; sonra tek bir hayatı, seçim seçim, yaklaşık 20 dakikada yaşarsın. 14 ülke, Mısır’dan İnkalara.',
    ogLocale: 'tr_TR',
    imageAlt: 'Binlerce Hayat: tarihte rastgele bir hayattan resimli bir sahne',
  },
}

const SITE = 'https://thousands.life/'

/** Адрес страницы на языке: английская - корень сайта. */
export function seoUrl(lang: SeoLang): string {
  return lang === 'en' ? SITE : `${SITE}?lang=${lang}`
}

/** Язык страницы из адреса: только корень сайта и только известные языки, иначе null (отдать файл как есть). */
export function seoLang(url: URL): SeoLang | null {
  if (url.pathname !== '/' && url.pathname !== '/index.html') return null
  const l = url.searchParams.get('lang')
  return l && l !== 'en' && (SEO_LANGS as readonly string[]).includes(l) ? (l as SeoLang) : null
}

/** Переписать заголовки страницы под язык. HTMLRewriter есть в Cloudflare; в Node (тесты) - отдать как есть. */
export function localizeHtml(res: Response, lang: SeoLang): Response {
  const R = (globalThis as { HTMLRewriter?: new () => HtmlRewriter }).HTMLRewriter
  if (!R || !(res.headers.get('content-type') ?? '').includes('text/html')) return res
  const t = SEO[lang]
  const url = seoUrl(lang)
  const image = `${SITE}og-${lang}.jpg`
  const content = (value: string) => ({ element: (e: HtmlElement) => void e.setAttribute('content', value) })
  return new R()
    .on('html', { element: (e) => void e.setAttribute('lang', lang) })
    .on('title', { element: (e) => void e.setInnerContent(t.title) })
    .on('meta[name="description"]', content(t.description))
    .on('meta[property="og:title"]', content(t.title))
    .on('meta[property="og:description"]', content(t.description))
    .on('meta[property="og:url"]', content(url))
    .on('meta[property="og:image"]', content(image))
    .on('meta[property="og:image:alt"]', content(t.imageAlt))
    .on('meta[property="og:locale"]', content(t.ogLocale))
    .on('meta[name="twitter:title"]', content(t.title))
    .on('meta[name="twitter:description"]', content(t.description))
    .on('meta[name="twitter:image"]', content(image))
    .on('link[rel="canonical"]', { element: (e) => void e.setAttribute('href', url) })
    .transform(res)
}

// Минимальные типы HTMLRewriter (в проекте нет @cloudflare/workers-types).
interface HtmlElement {
  setAttribute(name: string, value: string): void
  setInnerContent(text: string): void
}
interface HtmlRewriter {
  on(selector: string, handlers: { element(e: HtmlElement): void }): HtmlRewriter
  transform(res: Response): Response
}
