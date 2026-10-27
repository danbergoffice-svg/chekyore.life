// Выгружает промпты для настоящих иллюстраций.
// Запуск: npm run prompts →
//   docs/image_prompts.json — по одному на событие и регион (сцена события, стиль искусства края);
//   docs/art_prompts.json — заказ G3: 20 моментов на страну, 256×144, файл src/art/<папка>/<момент>.png.
import fs from 'node:fs'
import { ERA_FOLDER, loadAllEras } from '../src/content'
import { createT, loadAllTexts } from '../src/i18n'
import { artFor } from '../src/pixel/art'
import { MOMENTS } from '../src/pixel/illustrations'
import { lookOf, scenePrompt } from '../src/pixel/scene'

/** Что изображает момент (сцена для художника). */
const MOMENT_EN: Record<string, string> = {
  birth: 'a mother with a newborn, relatives around, at home',
  childhood: 'children playing in a village street',
  wedding: 'a wedding: bride and groom, families, a feast',
  child_born: 'a family welcoming a new baby',
  old_age: 'an old person with grandchildren by the hearth',
  study: 'a pupil learning letters from a teacher or master',
  work: 'people at work in fields and workshops',
  market: 'a busy market with stalls and bargaining',
  rich: 'a prosperous family in front of a fine new house',
  poor: 'a poor family in debt, an empty table',
  rite: 'a religious festival or rite in front of a temple',
  pilgrimage: 'pilgrims on a long road',
  court: 'a court or a ruler’s audience',
  war: 'a raid or battle seen from a hill, villagers fleeing',
  plague: 'a plague: empty streets, the sick tended at home',
  famine: 'famine: a bare field, people waiting for bread',
  fire: 'a town on fire at night, people carrying water',
  funeral: 'a funeral procession',
  dream: 'a sleeper dreaming of a bright classroom of the future',
  primer: 'a panoramic view of the land with its capital',
}

async function main() {
  const eras = await loadAllEras()
  await loadAllTexts()
  const t = createT('en')
  const out: { slot: string; event: string; region: string; prompt: string }[] = []
  const art: { file: string; era: string; moment: string; style: string; tradition: string; palette: string[]; prompt: string }[] = []
  for (const era of Object.values(eras)) {
    const eraName = `${t(`era.${era.id}`)}, ${t(`era.${era.id}.years`)}`
    for (const ev of era.events) {
      const regions = ev.regions ?? era.regions.map((r) => r.id)
      for (const region of regions) {
        out.push({
          slot: `img_${era.id.toLowerCase()}_${ev.id}_${region}.webp`,
          event: ev.id,
          region,
          prompt: scenePrompt(ev.scene ?? { place: 'landmark' }, region, eraName),
        })
      }
    }
    // Заказ иллюстраций G3: столица страны как образец края.
    const region = era.regions[0].id
    const style = lookOf(region).style
    const a = artFor(style)
    for (const moment of MOMENTS) {
      art.push({
        file: `src/art/${ERA_FOLDER[era.id]}/${moment}.png`,
        era: era.id,
        moment,
        style,
        tradition: a.tradition,
        palette: a.palette,
        prompt: `${MOMENT_EN[moment]}; ${scenePrompt({ place: 'landmark' }, region, eraName, { format: '256×144 pixels, 16:9' }).split('; ').slice(1).join('; ')}`,
      })
    }
  }
  fs.writeFileSync('docs/image_prompts.json', JSON.stringify(out, null, 2) + '\n')
  fs.writeFileSync('docs/art_prompts.json', JSON.stringify(art, null, 2) + '\n')
  console.log(`${out.length} prompts → docs/image_prompts.json; ${art.length} → docs/art_prompts.json`)
}
main()
