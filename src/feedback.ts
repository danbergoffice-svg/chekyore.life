// Обратная связь от игроков. Своего сервера у сайта нет, поэтому отзыв уходит:
//  1) в Яндекс Метрику — целью «feedback» с параметрами (Метрика → Отчёты → Параметры визитов);
//  2) в Google-форму, если она настроена ниже (ответы копятся в Google-таблице).
import { track } from './analytics'

/** Вопросы формы: короткие открытые ответы. Тексты — feedback.<id> и feedback.<id>.hint. */
export const FEEDBACK_QUESTIONS = ['liked', 'boring', 'change', 'missing', 'again'] as const
export type FeedbackQuestion = (typeof FEEDBACK_QUESTIONS)[number]

export interface FeedbackData {
  rating: number
  answers: Partial<Record<FeedbackQuestion, string>>
  contact: string
  /** О какой жизни отзыв: страна, возраст, сколько жизней сыграно, язык. */
  context: Record<string, string | number>
}

/**
 * Google-форма (необязательно). Создайте форму с полями: оценка, 5 вопросов, контакт, контекст;
 * откройте «Получить ссылку для предзаполнения», заполните поля и скопируйте ссылку — из неё видны
 * адрес формы (…/formResponse) и номера полей entry.XXXX. Пока url пустой, отзывы идут только в Метрику.
 */
export const GOOGLE_FORM: { url: string; fields: Record<'rating' | FeedbackQuestion | 'contact' | 'context', string> } = {
  url: '',
  fields: { rating: '', liked: '', boring: '', change: '', missing: '', again: '', contact: '', context: '' },
}

const MAX = 600

export async function sendFeedback(data: FeedbackData): Promise<void> {
  const clip = (s: string | undefined) => (s ?? '').trim().slice(0, MAX)
  const params: Record<string, string | number> = { rating: data.rating, ...data.context }
  for (const q of FEEDBACK_QUESTIONS) if (clip(data.answers[q])) params[q] = clip(data.answers[q])
  if (clip(data.contact)) params.contact = clip(data.contact)
  track('feedback', params)

  if (!GOOGLE_FORM.url) return
  const body = new URLSearchParams()
  const put = (field: keyof typeof GOOGLE_FORM.fields, value: string) => {
    if (GOOGLE_FORM.fields[field] && value) body.append(GOOGLE_FORM.fields[field], value)
  }
  put('rating', String(data.rating))
  for (const q of FEEDBACK_QUESTIONS) put(q, clip(data.answers[q]))
  put('contact', clip(data.contact))
  put('context', Object.entries(data.context).map(([k, v]) => `${k}: ${v}`).join(', '))
  try {
    // Google не отдаёт CORS-заголовки, поэтому ответ не читаем — запрос просто уходит.
    await fetch(GOOGLE_FORM.url, { method: 'POST', mode: 'no-cors', body })
  } catch {
    // Нет сети — отзыв всё равно ушёл в Метрику, если она загружена.
  }
}
