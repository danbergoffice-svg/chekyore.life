// Причина недоступного варианта (lockReason): у каждого варианта с условиями, который у героя закрыт, - понятная причина.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, loadAllEras } from '../src/content'
import { choiceAvailable, lockReason } from '../src/engine/game'
import { newLife } from '../src/engine/life'
import { createT, hasKey, loadAllTexts } from '../src/i18n'

const ERAS = await loadAllEras()
await loadAllTexts()

describe('Причина недоступного варианта', () => {
  it('закрытые варианты всех событий: ключ есть на трёх языках, подстановки заполнены', () => {
    const vague: string[] = []
    let locked = 0
    for (const id of ERA_IDS) {
      const era = ERAS[id]
      // Бедный неграмотный ребёнок без связей: закрыто почти всё, что с условиями.
      const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 7, undefined, undefined)
      s.hero.money = 0
      for (const ev of era.events)
        for (const c of ev.choices ?? []) {
          if (choiceAvailable(s, c)) continue
          const r = lockReason(s, c)
          expect(r, `${ev.id}.${c.id}`).not.toBeNull()
          locked++
          for (const lang of ['ru', 'en', 'tr'] as const) {
            expect(hasKey(lang, r!.key), `${lang} ${r!.key}`).toBe(true)
            expect(createT(lang, { sex: s.hero.sex })(r!.key, r!.params), `${lang} ${ev.id}.${c.id}`).not.toMatch(/[{}]|^event\.|attr\.|skill\./)
          }
          if (r!.key === 'event.lock.other') vague.push(`${ev.id}.${c.id}`)
        }
    }
    expect(locked).toBeGreaterThan(100)
    // «Не позволяют обстоятельства» - только для редких условий (метки, флаги); не больше 5% закрытых.
    expect(vague.length / locked, vague.slice(0, 10).join(', ')).toBeLessThan(0.05)
  })
})
