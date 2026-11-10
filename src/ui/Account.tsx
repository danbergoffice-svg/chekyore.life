// Аккаунт: форма входа по ссылке на почту (после первой жизни и из настроек), политика конфиденциальности,
// рассылка, выход и удаление своих данных (src/account.ts).
import { useEffect, useState } from 'preact/hooks'
import { accountEmail, deleteAccount, logout, pendingEmail, rememberPending, session, setNewsletter, startLogin } from '../account'
import { platform } from '../platform'
import { useUi } from './text'

export function Privacy() {
  const { t } = useUi()
  return (
    <details class="howto small privacy">
      <summary>{t('account.privacy.title')}</summary>
      {['what', 'why', 'who', 'keep', 'delete'].map((k) => (
        <p>{t(`account.privacy.${k}`)}</p>
      ))}
    </details>
  )
}

/** Форма входа: почта → письмо со ссылкой. prompt - после первой жизни (с призывом сохранить достижения). */
export function AccountModal({ prompt, onClose }: { prompt?: boolean; onClose: () => void }) {
  const { t, lang } = useUi()
  // Уже просили ссылку - адрес подставлен: письмо не дошло или ссылка устарела - можно просто отправить ещё раз.
  const [email, setEmail] = useState(pendingEmail)
  const [news, setNews] = useState(true)
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  // Повторная отправка - не чаще раза в 30 секунд (обратный отсчёт на кнопке).
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])
  const send = async (again = false) => {
    setState('busy')
    const r = await startLogin(email.trim(), lang, news, platform.playerId())
    if (r.ok) {
      setState('sent')
      setWait(30)
      rememberPending(email.trim())
      platform.track('account_start', { newsletter: news ? 1 : 0, prompt: prompt ? 1 : 0, again: again ? 1 : 0 })
    } else {
      setState('error')
      // Причина отказа почты (например, домен не подтверждён в Resend) - мелко, чтобы было что прислать разработчику.
      setError(`${t(`account.error.${r.error === 'email' ? 'email' : r.error === 'region' ? 'region' : 'other'}`)}${r.detail ? ` (${r.detail})` : r.error && r.error !== 'email' && r.error !== 'region' ? ` (${r.error})` : ''}`)
    }
  }
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal account" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <h2 id="account-title">{t(prompt ? 'account.prompt.title' : 'account.title')}</h2>
        <p class="small">{t(prompt ? 'account.prompt.text' : 'account.text')}</p>
        {state === 'sent' ? (
          <>
            <p role="status">{t('account.sent', { email: email.trim() })}</p>
            <p class="small muted">{t('account.no_mail')}</p>
            <div class="choice-row">
              <button class="secondary" disabled={wait > 0} onClick={() => send(true)}>
                {wait > 0 ? t('account.resend_wait', { n: wait }) : t('account.resend')}
              </button>
              <button class="link" onClick={() => setState('idle')}>{t('account.other_email')}</button>
            </div>
          </>
        ) : (
          <>
            <input class="promo-input account-email" type="email" autocomplete="email" placeholder={t('account.email')} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && send()} aria-label={t('account.email')} />
            <label class="small check">
              <input type="checkbox" checked={news} onChange={(e) => setNews((e.target as HTMLInputElement).checked)} /> {t('account.newsletter')}
            </label>
            <p class="small muted">{t('account.notice')}</p>
            <Privacy />
            {state === 'error' && <p class="small warn" role="status">{error}</p>}
          </>
        )}
        <div class="choice-row">
          {state !== 'sent' && (
            <button class="primary" disabled={state === 'busy' || !email.includes('@')} onClick={() => send()}>
              {t('account.send')}
            </button>
          )}
          <button class="link" onClick={onClose}>{t(prompt && state !== 'sent' ? 'account.later' : 'common.close')}</button>
        </div>
      </div>
    </div>
  )
}

/** Раздел в настройках: вошёл - почта, рассылка, выйти, удалить данные; нет - кнопка «Сохранить прогресс». */
export function AccountSection({ newsletter, onOpen, onChanged }: { newsletter: boolean; onOpen: () => void; onChanged: () => void }) {
  const { t } = useUi()
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const email = accountEmail()
  if (!session()) {
    return (
      <section class="block account-section">
        <h2 class="section-title">{t('account.title')}</h2>
        <p class="small">{t('account.text')}</p>
        <button class="secondary" onClick={onOpen}>{t('account.open')}</button>
        <Privacy />
      </section>
    )
  }
  return (
    <section class="block account-section">
      <h2 class="section-title">{t('account.title')}</h2>
      <p class="small">{t('account.signed', { email: email ?? '' })}</p>
      <label class="small check">
        <input
          type="checkbox"
          checked={newsletter}
          onChange={async (e) => {
            const on = (e.target as HTMLInputElement).checked
            if (await setNewsletter(on)) onChanged()
          }}
        />{' '}
        {t('account.newsletter')}
      </label>
      <div class="choice-row">
        <button class="secondary" onClick={async () => { await logout(); onChanged() }}>{t('account.logout')}</button>
        {!confirm ? (
          <button class="link warn" onClick={() => setConfirm(true)}>{t('account.delete')}</button>
        ) : (
          <button
            class="secondary danger-soft"
            onClick={async () => {
              const ok = await deleteAccount(platform.playerId())
              setMsg(t(ok ? 'account.deleted' : 'account.error.other'))
              setConfirm(false)
              if (ok) {
                platform.track('account_deleted', {})
                onChanged()
              }
            }}
          >
            {t('account.delete_confirm')}
          </button>
        )}
      </div>
      {msg && <p class="small" role="status">{msg}</p>}
      <Privacy />
    </section>
  )
}
