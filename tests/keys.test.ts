// Каждый ключ текста, который код вызывает буквально (t('…'), key: '…'), есть на всех пяти языках
// (21.11: на вкладке «Близкие» вместо текста были видны kin.doctor.done). Проверка - tools/missing-keys.mjs.
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('Тексты', () => {
  it('у буквальных ключей из кода есть текст на RU/EN/TR/FR/ES', () => {
    let out = ''
    try {
      out = execFileSync('node', ['tools/missing-keys.mjs'], { encoding: 'utf8' })
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? e)
    }
    expect(out.trim()).toBe('Все буквальные ключи на месте.')
  })
})
