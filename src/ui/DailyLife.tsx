// «Жизнь дня» (docs/TZ_daily.md): карточка в меню и итог после смерти с таблицей дня и вводом ника.
// Логика и проверки - src/dailyLife.ts, сервер - worker/daily.ts.
import { useState } from 'preact/hooks'
import type { Birth } from '../engine/life'
import type { Sex } from '../engine/types'
import { formatYear } from '../i18n'
import { nickOk, type DailyBoard, type DailyRow } from '../dailyLife'
import { Icon } from './Icon'
import { useUi } from './text'

/** Сколько осталось до следующих суток UTC: «7 ч 12 мин» или, меньше часа, «55 мин». */
function useLeft(ms: number): string {
  const { t } = useUi()
  const min = Math.max(1, Math.ceil(ms / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? t('dlife.left_hm', { h, m: min % 60 }) : t('dlife.left_m', { m: min })
}

/** Страна игрока по коду Cloudflare на языке игры (для «Игрок из …»). */
function countryName(code: string | null, lang: string): string | null {
  if (!code) return null
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? null
  } catch {
    return null
  }
}

/** Дата UTC «2026-11-21» коротко на языке игры: «21 ноября». */
export function dailyDay(date: string, lang: string): string {
  try {
    return new Date(date + 'T12:00:00Z').toLocaleDateString(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' })
  } catch {
    return date
  }
}

interface CardProps {
  date: string
  birth: Birth
  board: DailyBoard | null
  /** new - ещё не играл сегодня, playing - жизнь дня идёт, done - сыграна. */
  status: 'new' | 'playing' | 'done'
  msLeft: number
  onPlay: () => void
}

/** Карточка в меню: кто ты сегодня, сколько уже сыграли, рекорд и кнопка; сыграл - своё место и время до новой. */
export function DailyLifeCard({ date, birth, board, status, msLeft, onPlay }: CardProps) {
  const { t, lang } = useUi()
  const best = board?.top[0]
  const l = useLeft(msLeft)
  return (
    <section class="daily-card" aria-labelledby="daily-who">
      <div class="daily-eyebrow">
        <span>
          <Icon name="clock" /> {t('dlife.eyebrow', { date: dailyDay(date, lang) })}
        </span>
        <span>{t('dlife.one_try')}</span>
      </div>
      <h3 id="daily-who" class="daily-who">
        {t(`region.${birth.region}`)}, {formatYear(birth.year, lang)}
      </h3>
      <p class="daily-facts">
        {t(`spin.sex.${birth.sex}`)} · {t(`class.${birth.cls}.short`, {}, { sex: birth.sex })}. {t('dlife.lead')}
      </p>
      {board && board.n > 0 && (
        <div class="daily-stats">
          <div>
            <b>{board.n}</b>
            {t('dlife.played')}
          </div>
          {best && (
            <div>
              <b>{t('life.age', { n: best.age })}</b>
              {t('dlife.record_by', { nick: best.nick ?? t('dlife.board.hidden') })}
            </div>
          )}
        </div>
      )}
      {status === 'done' ? (
        <p class="daily-done">{board?.me ? t('dlife.done', { place: board.me.place, n: board.n }) : t('dlife.done_wait')}</p>
      ) : (
        <button class="primary daily-play" onClick={onPlay}>
          {t(status === 'playing' ? 'dlife.continue' : 'dlife.play')}
        </button>
      )}
      <p class="daily-timer">
        <Icon name="hourglass" /> {t('dlife.new_in', { left: l })}
      </p>
    </section>
  )
}

interface ResultProps {
  date: string
  age: number
  sex: Sex
  /** Скольких ровесников своего края и времени пережил (%, highlights.outlivedShare). */
  peers: number
  board: DailyBoard | null
  /** Итог ещё отправляется. */
  sending: boolean
  nick?: string
  msLeft: number
  onNick: (nick: string, hidden: boolean) => Promise<string | null>
}

function BoardRow({ row }: { row: DailyRow }) {
  const { t, lang } = useUi()
  const who = row.nick ?? (countryName(row.country, lang) ? t('dlife.board.from', { country: countryName(row.country, lang)! }) : t('dlife.board.hidden'))
  return (
    <li class={`daily-row${row.me ? ' me' : ''}${row.place <= 3 ? ` p${row.place}` : ''}`}>
      <span class="n">{row.place}</span>
      <span class="who">
        {who}
        <small>{row.me ? t('dlife.board.you') : t('dlife.board.kids', { n: row.kids })}</small>
      </span>
      <span class="a">{row.age}</span>
    </li>
  )
}

/** Итог жизни дня на экране прощания: место, сравнение, ник (один раз), таблица дня. */
export function DailyLifeResult({ date, age, sex, peers, board, sending, nick, msLeft, onNick }: ResultProps) {
  const { t, lang } = useUi()
  const [value, setValue] = useState('')
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const beaten = board?.me ? board.n - board.me.place : 0
  const save = async () => {
    if (!nickOk(value)) return setError('nick_bad')
    setBusy(true)
    const err = await onNick(value.trim(), hidden)
    setBusy(false)
    setError(err)
  }
  const meInTop = !!board?.top.some((r) => r.me)
  const l = useLeft(msLeft)
  return (
    <section class="daily-result" aria-labelledby="daily-result-h">
      <p class="eyebrow">
        <Icon name="clock" /> {t('dlife.eyebrow', { date: dailyDay(date, lang) })}
      </p>
      <div class="daily-sheet">
        <div class="big" id="daily-result-h">{t('life.age', { n: age })}</div>
        {board?.me ? (
          <div class="place">{t('dlife.result.place', { place: board.me.place, n: board.n })}</div>
        ) : (
          <div class="place muted">{t(sending ? 'dlife.result.sending' : 'dlife.result.offline')}</div>
        )}
        <p class="cmp">
          {t('dlife.result.peers', { pct: peers }, { sex })}
          {board?.me && board.n > 1 && (
            <>
              <br />
              {t('dlife.result.players', { k: beaten, n: board.n - 1 }, { sex })}
            </>
          )}
        </p>
        {board?.me && board.n > 1 && (
          <div class="daily-bar" aria-hidden="true">
            <i style={{ width: `${Math.round((beaten / (board.n - 1)) * 100)}%` }} />
          </div>
        )}
      </div>

      {!nick && board?.me && (
        <div class="daily-nick">
          <label for="daily-nick-in">
            <b>{t('dlife.nick.ask')}</b>
          </label>
          <input id="daily-nick-in" value={value} maxLength={16} placeholder={t('dlife.nick.placeholder')} onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
          <label class="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden((e.target as HTMLInputElement).checked)} /> {t('dlife.nick.hide')}
          </label>
          {error && <p class="error">{t(`dlife.nick.${error === 'nick_taken' ? 'taken' : error === 'nick_bad' ? 'bad' : 'net'}`)}</p>}
          <button class="primary" disabled={busy || !value.trim()} onClick={save}>
            {t('dlife.nick.save')}
          </button>
        </div>
      )}

      {board && board.top.length > 0 && (
        <>
          <h3 class="daily-board-h">{t('dlife.board.today')}</h3>
          <ol class="daily-board">
            {board.top.map((r) => (
              <BoardRow key={r.place} row={r} />
            ))}
            {board.me && !meInTop && (
              <>
                <li class="daily-gap" aria-hidden="true">· · ·</li>
                <BoardRow row={board.me} />
              </>
            )}
          </ol>
          <p class="small muted center">{t('dlife.board.closes', { n: board.n, left: l })}</p>
        </>
      )}
    </section>
  )
}
