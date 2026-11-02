// Стенд экрана после смерти на настоящей жизни: ?seed=…&era=EUR&lang=ru&min=58
import { render } from 'preact'
import '@fontsource-variable/alegreya'
import '../../src/style.css'
import '../../src/skin.css'
import { loadAllEras } from '../../src/content'
import { autoplay } from '../../src/engine/game'
import { newLife } from '../../src/engine/life'
import { createT, loadAllTexts } from '../../src/i18n'
import type { Lang, LifeSummary } from '../../src/engine/types'
import { UiContext } from '../../src/ui/text'
import { Summary } from '../../src/ui/Summary'

const q = new URLSearchParams(location.search)
const eras = await loadAllEras()
await loadAllTexts()
const lang = (q.get('lang') ?? 'ru') as Lang
const t = createT(lang)
const era = eras[q.get('era') ?? 'EUR']
const min = Number(q.get('min') ?? 50)
let life: LifeSummary | undefined
for (let seed = Number(q.get('seed') ?? 433); seed < 4000; seed++) {
  const s = autoplay(newLife(era, { mode: 'full', mortality: 'soft', softenHeavy: false, livesBefore: 3 }, seed), era)
  const l = s.family.lives[s.family.lives.length - 1]
  if (l.age >= min) {
    life = l
    console.log('seed', seed, l.age)
    break
  }
}
const noop = () => {}
render(
  <UiContext.Provider value={{ t: createT(lang, { sex: life!.sex }), lang }}>
    <Summary life={life!} era={era} canContinue onContinue={noop} onAgain={noop} onMemorial={noop} onMenu={noop} onUpdate={noop} />
  </UiContext.Provider>,
  document.getElementById('app')!,
)
await document.fonts.ready
setTimeout(() => (document.body.dataset.ready = '1'), 1000)
