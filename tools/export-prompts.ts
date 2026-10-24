// Выгружает промпты для настоящих иллюстраций: по одному на событие и регион.
// Запуск: npm run prompts → docs/image_prompts.json
import fs from 'node:fs'
import { ERAS } from '../src/content'
import { scenePrompt } from '../src/pixel/scene'

const ERA_NAMES: Record<string, string> = { E03: 'classical antiquity, 500 BC to AD 200' }
const out: { slot: string; event: string; region: string; prompt: string }[] = []
for (const era of Object.values(ERAS)) {
  for (const ev of era.events) {
    const regions = ev.regions ?? era.regions.map((r) => r.id)
    for (const region of regions) {
      out.push({
        slot: `img_${era.id.toLowerCase()}_${ev.id}_${region}.webp`,
        event: ev.id,
        region,
        prompt: scenePrompt(ev.scene ?? { place: 'landmark' }, region, ERA_NAMES[era.id] ?? era.id),
      })
    }
  }
}
fs.writeFileSync('docs/image_prompts.json', JSON.stringify(out, null, 2) + '\n')
console.log(`${out.length} prompts → docs/image_prompts.json`)
