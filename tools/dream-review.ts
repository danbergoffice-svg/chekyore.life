// Тексты снов о будущем на проверку педагогу: условия с примером чисел, варианты, верные ответы и допуски,
// подсказки, итоги. Запуск: npm run dream-review → docs/dreams_review.md (и .docx, если есть pandoc).
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { DREAM_DEFS, DREAM_GRADES, dreamParams, expectedAnswer } from '../src/engine/dreams'
import { createT, loadAllTexts } from '../src/i18n'
import type { DreamInput } from '../src/engine/types'

await loadAllTexts()
const t = createT('ru', { sex: 'm' })
const SUBJECT: Record<string, string> = { chemistry: 'Химия', biology: 'Биология', physics: 'Физика', math: 'Математика' }
const KIND: Record<string, string> = {
  pick: 'отметить нужное (сколько нужно — не сказано)',
  ratio: 'доли в процентах для отмеченного в предыдущем вводе',
  order: 'расставить по порядку, лишнее убрать',
  number: 'ввести число',
}
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('ru-RU')
const out: string[] = [
  '# Сны о будущем — тексты на проверку',
  '',
  'Игрок видит сон о школе и решает задачу в три шага. Числа в условии каждый раз новые (диапазон указан); ниже — пример с серединой диапазона.',
  'Ответ по шагу засчитывается, только если верны все вводы шага. Варианты ответа перемешиваются.',
  'Мягкая проверка: в «отметить нужное» прощается один пропуск, если нужных три и больше (лишнее — всегда ошибка); в «расставить по порядку» прощается одна перестановка соседних шагов.',
  '',
  '**Лестница сложности.** У каждого сна уровень по школьной программе: 1 — 5–6 класс, 2 — 6–7, 3 — 7–8, 4 — 8–9, 5 — 9–11. В первой жизни снятся только сны уровня 1; следующий уровень открывается, когда игрок решил сон хотя бы частично. **Проверьте, пожалуйста, верно ли выставлены уровни.** Новые сны: «Десять цифр и ноль», «Кипячёная вода», «Мерить поле», «Честная цена» (уровень 1).',
  '',
  '**Что проверить:** верно ли условие и ответ по школьной программе; понятна ли формулировка; честен ли допуск; нет ли второго правильного ответа среди вариантов; подходит ли подсказка (она не должна давать ответ).',
  '',
  'Замечания удобно писать прямо в документе рядом с текстом.',
  '',
]
const ordered = [...DREAM_DEFS].sort((a, b) => a.level - b.level)
out.push('| № | Сон | Предмет | Уровень | Класс |', '|---|---|---|---|---|', ...ordered.map((d, i) => `| ${i + 1} | ${t(`dream.${d.id}.title`)} | ${SUBJECT[d.subject]} | ${d.level} | ${DREAM_GRADES[d.level]} |`), '')
for (const [i, def] of ordered.entries()) {
  const id = def.id
  const params = dreamParams(def, () => 0.5)
  const shown = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, fmt(v)]))
  const opt = (k: string) => t(`dream.${id}.opt.${k}`)
  out.push(`## ${i + 1}. ${t(`dream.${id}.title`)} — ${SUBJECT[def.subject]}, уровень ${def.level} (${DREAM_GRADES[def.level]} класс)`, '')
  if (def.params) out.push(`Числа (обозначения как в формулах): ${Object.entries(def.params).map(([k, [lo, hi, st]]) => `${k} от ${fmt(lo)} до ${fmt(hi)} с шагом ${fmt(st)}`).join('; ')}${def.derived ? `; вычисляются: ${Object.entries(def.derived).map(([k, f]) => `${k} = ${f}`).join('; ')}` : ''}.`, '')
  if (def.known_in?.length) out.push(`Где уже знали (тогда прорыв засчитывается как частичный успех): ${def.known_in.map((k) => `${t(`era.${k.era}`)} с ${k.from < 0 ? `${-k.from} г. до н. э.` : `${k.from} г.`}`).join('; ')}`, '')
  out.push(`**Вступление:** ${t(`dream.${id}.intro`, shown)}`, '')
  def.steps.forEach((step, si) => {
    out.push(`### Шаг ${si + 1}${step.kind === 'debate' ? ' — спор с мудрецом' : ''}`, '')
    if (step.kind === 'debate') out.push(`**Мудрец:** ${t(`dream.${id}.sage`)}`, '')
    step.items.forEach((input: DreamInput, ii) => {
      out.push(`**Вопрос ${si + 1}.${ii + 1}:** ${t(`dream.${id}.q${si + 1}.${ii + 1}`, shown)}`, '')
      out.push(`- Как отвечает игрок: ${KIND[input.kind]}`)
      if ('options' in input) out.push(`- Варианты: ${input.options.map(opt).join('; ')}`)
      const want = expectedAnswer(input, params, 'EUR')
      if (input.kind === 'pick') {
        out.push(`- **Верно:** ${(want as string[]).map(opt).join('; ')}`)
        for (const [era, a] of Object.entries(input.answer_by_era ?? {})) out.push(`- **Верно в стране «${t(`era.${era}`)}»:** ${a.map(opt).join('; ')}`)
      } else if (input.kind === 'order') out.push(`- **Верно:** ${(want as string[]).map(opt).join(' → ')}`)
      else if (input.kind === 'ratio') out.push(`- **Верно:** ${Object.entries(want as Record<string, number>).map(([k, v]) => `${opt(k)} ${v}%`).join('; ')} (допуск ±${input.tolerance} п. п.)`)
      else {
        const unit = input.unit ? ` ${t(`unit.${input.unit}`)}` : ''
        const tol = input.abs !== undefined ? `±${fmt(input.abs)}${unit}` : `±${fmt((input.tolerance ?? 0.02) * 100)}%`
        out.push(`- **Верно (для примера):** ${fmt(want as number)}${unit}; формула: \`${input.formula}\`; допуск ${tol}`)
      }
      out.push('')
    })
    out.push(`**Подсказка «Заглянуть в учебник»:** ${t(`dream.${id}.hint${si + 1}`)}`, '')
  })
  out.push('### Итоги', '')
  for (const k of ['breakthrough', 'partial', 'known', 'failure', 'death'] as const) {
    const key = `dream.${id}.${k}`
    const text = t(key, shown)
    if (text !== key) out.push(`- **${{ breakthrough: 'Прорыв', partial: 'Частичный успех', known: 'Уже знали', failure: 'Провал', death: 'Гибель' }[k]}:** ${text}`)
  }
  out.push('', `**Как было на самом деле:** ${t(`dream.${id}.truth`)}`, '')
}
writeFileSync('docs/dreams_review.md', out.join('\n'))
try {
  execSync('pandoc docs/dreams_review.md -o docs/dreams_review.docx')
  console.log('docs/dreams_review.md и docs/dreams_review.docx')
} catch {
  console.log('docs/dreams_review.md (pandoc не найден — .docx не собран)')
}
