// Спецключи (src/promo.ts): ключ даёт дар, второй раз - нет; регистр, пробелы и дефисы не важны.
import { describe, expect, it } from 'vitest'
import { promoHash, redeemPromo } from '../src/promo'

describe('Спецключи', () => {
  it('монголы и царский род; повторно - «уже использован»; неизвестный и пустой - ошибка', () => {
    const m = redeemPromo('mongol-2026')
    expect(m).toMatchObject({ ok: true, reward: { gift: 'country', country: 'MNG' } })
    expect(redeemPromo(' ROYAL 2026 ')).toMatchObject({ ok: true, reward: { gift: 'royal' } })
    expect(redeemPromo('MONGOL2026', [promoHash('MONGOL2026')])).toEqual({ ok: false, error: 'used' })
    expect(redeemPromo('NOPE')).toEqual({ ok: false, error: 'unknown' })
    expect(redeemPromo('  ')).toEqual({ ok: false, error: 'empty' })
  })
})
