import { loadEra } from '/home/user/chekyore.life/src/content'
import { autoplay } from '/home/user/chekyore.life/src/engine/game'
import { newLife } from '/home/user/chekyore.life/src/engine/life'
import { loadTexts, LANGS } from '/home/user/chekyore.life/src/i18n'
async function main() {
  await Promise.all(LANGS.flatMap((l) => [loadTexts(l, 'common'), loadTexts(l, 'west_africa')]))
  const era = await loadEra('WAF')
  const prof: Record<string, number> = {}
  const seen: Record<string, number> = {}
  const N = Number(process.argv[2] ?? 400)
  for (let i = 0; i < N; i++) {
    const s = autoplay(newLife(era, { mode: 'full', mortality: 'historical', softenHeavy: false } as any, 9000 + i), era)
    const profs = new Set(s.hero.diary.map((d: any) => d.params?.prof?.key).filter(Boolean))
    prof[s.hero.profession ?? 'none'] = (prof[s.hero.profession ?? 'none'] ?? 0) + 1
    for (const id of new Set(s.hero.diary.map((d: any) => d.eventId).filter(Boolean))) if (String(id).startsWith('waf_')) seen[id as string] = (seen[id as string] ?? 0) + 1
  }
  console.log('final professions', prof)
  console.log(Object.entries(seen).sort((a, b) => a[1] - b[1]).map(([k, v]) => k + ':' + v).join(' '))
}
main()
