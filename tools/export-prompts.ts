// Выгружает промпты для настоящих иллюстраций: по одному на событие и регион.
// Запуск: npm run prompts → docs/image_prompts.json
import fs from 'node:fs'
import { loadAllEras } from '../src/content'
import { createT, loadAllTexts } from '../src/i18n'
import { scenePrompt } from '../src/pixel/scene'

async function main() {
  const eras = await loadAllEras()
  await loadAllTexts()
  const t = createT('en')
  const out: { slot: string; event: string; region: string; prompt: string }[] = []
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
  }
  fs.writeFileSync('docs/image_prompts.json', JSON.stringify(out, null, 2) + '\n')
  console.log(`${out.length} prompts → docs/image_prompts.json`)
}
main()
