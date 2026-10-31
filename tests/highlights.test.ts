// Карточка «Поделиться»: яркие факты жизни и подбор афоризма.
import { describe, expect, it } from 'vitest'
import { ERA_FOLDER, ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { QUOTES } from '../src/content/quotes'
import { autoplay } from '../src/engine/game'
import { lifeHighlights, lifeThemes, rankQuotes } from '../src/engine/highlights'
import { newLife, rollBirth } from '../src/engine/life'
import type { LifeSummary } from '../src/engine/types'
import { createT, loadAllTexts } from '../src/i18n'

const ERAS = await loadAllEras()
await loadAllTexts()
const breathe = () => new Promise((r) => setTimeout(r, 0))

async function lives(n: number, seed: number): Promise<LifeSummary[]> {
  const out: LifeSummary[] = []
  for (let i = 0; i < n; i++) {
    if (i % 40 === 0) await breathe()
    const b = rollBirth(seed + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
    const era = ERAS[b.era]
    const s = autoplay(newLife(era, { mode: 'full', mortality: 'soft', softenHeavy: false, livesBefore: 3 }, seed + i, undefined, b), era)
    out.push(s.family.lives[s.family.lives.length - 1])
  }
  return out
}

describe('Карточка жизни', () => {
  it('у каждой жизни есть яркий факт; тексты фактов без скобок на обоих языках и в обоих родах', async () => {
    const all = await lives(240, 52000)
    const keys: Record<string, number> = {}
    for (const life of all) {
      const hs = lifeHighlights(life)
      expect(hs.length).toBeGreaterThan(0)
      keys[hs[0].key.replace(/\.\d$/, '')] = (keys[hs[0].key.replace(/\.\d$/, '')] ?? 0) + 1
      for (const lang of ['ru', 'en'] as const) {
        const t = createT(lang, { sex: life.sex, region: life.region, religion: life.religion })
        for (const h of hs) expect(t(h.key, h.params ?? {}), `${lang} ${h.key}`).not.toMatch(/[{}]|^hook\./)
      }
    }
    // Запасной «прожил N лет» - не у большинства: обычно находится что-то ярче.
    expect((keys['hook.lived'] ?? 0) + (keys['hook.lived_plain'] ?? 0)).toBeLessThan(all.length * 0.35)
  }, 300000)

  it('афоризм подбирается под темы жизни, свои мудрецы - в приоритете; подборка цитат цела', async () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(100)
    const ids = new Set<string>()
    for (const q of QUOTES) {
      expect(ids.has(q.id), q.id).toBe(false)
      ids.add(q.id)
      expect(q.ru && q.en && q.author_ru && q.author_en, q.id).toBeTruthy()
      expect(q.tags.length, q.id).toBeGreaterThan(0)
    }
    const all = await lives(120, 56000)
    let themed = 0
    for (const life of all) {
      const themes = lifeThemes(life)
      const top = rankQuotes(life, QUOTES, ERA_FOLDER[life.era], themes)[0]
      if (top.tags.some((tag) => (themes[tag] ?? 0) >= 1.5)) themed++
      // Та же жизнь - тот же афоризм.
      expect(rankQuotes(life, QUOTES, ERA_FOLDER[life.era], themes)[0].id).toBe(top.id)
    }
    expect(themed / all.length).toBeGreaterThan(0.8)
  }, 300000)
})
