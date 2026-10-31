import { useState } from 'preact/hooks'
import { FEEDBACK_QUESTIONS } from '../feedback'
import type { FeedbackData, FeedbackQuestion } from '../feedback'
import { useUi } from './text'

/** Короткая форма отзыва: оценка звёздами и пять открытых вопросов с подсказками - можно ответить одной фразой. */
export function Feedback(props: { context: FeedbackData['context']; onSend: (d: FeedbackData) => void; onBack: () => void }) {
  const { t } = useUi()
  const [rating, setRating] = useState(0)
  const [answers, setAnswers] = useState<Partial<Record<FeedbackQuestion, string>>>({})
  const [contact, setContact] = useState('')
  const filled = rating > 0 || Object.values(answers).some((a) => a?.trim())
  return (
    <div class="screen feedback">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('feedback.title')}</h1>
      <p class="lead">{t('feedback.lead')}</p>

      <fieldset class="stars-field">
        <legend>{t('feedback.rating')}</legend>
        <div class="stars" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" role="radio" aria-checked={rating === n} aria-label={t('feedback.stars', { n })} class={n <= rating ? 'star on' : 'star'} onClick={() => setRating(n)}>
              ★
            </button>
          ))}
        </div>
      </fieldset>

      {FEEDBACK_QUESTIONS.map((q, i) => (
        <label class="fb-q">
          <span class="fb-label">
            {i + 1}. {t(`feedback.${q}`)}
          </span>
          <textarea
            rows={2}
            maxLength={600}
            placeholder={t(`feedback.${q}.hint`)}
            value={answers[q] ?? ''}
            onInput={(e) => setAnswers({ ...answers, [q]: e.currentTarget.value })}
          />
        </label>
      ))}

      <label class="fb-q">
        <span class="fb-label">{t('feedback.contact')}</span>
        <input type="text" maxLength={120} placeholder={t('feedback.contact.hint')} value={contact} onInput={(e) => setContact(e.currentTarget.value)} />
      </label>

      <button class="primary" disabled={!filled} onClick={() => props.onSend({ rating, answers, contact, context: props.context })}>
        {t('feedback.send')}
      </button>
      <p class="small muted">{t('feedback.privacy')}</p>
    </div>
  )
}

/** Приглашение оставить отзыв на экране итогов. */
export function FeedbackPrompt(props: { onOpen: () => void; onLater: () => void; /** Пробный период: за отзыв - выбор страны. */ reward?: boolean }) {
  const { t } = useUi()
  const k = props.reward ? 'feedback.prompt.reward' : 'feedback.prompt'
  return (
    <section class="block feedback-prompt">
      <h2 class="section-title">{t(`${k}.title`)}</h2>
      <p>{t(`${k}.text`)}</p>
      <div class="row">
        <button class="primary" onClick={props.onOpen}>{t(`${k}.go`)}</button>
        <button class="link" onClick={props.onLater}>{t('feedback.prompt.later')}</button>
      </div>
    </section>
  )
}
