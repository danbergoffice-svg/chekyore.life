// Меню поверх жизни (ТЗ редизайна, правка 02): раньше «Меню» уводило на главную, и 201 игрок ушёл оттуда при живом
// герое. Лист не уводит из жизни: «Продолжить» закрывает его, разделы открываются и возвращают обратно в жизнь,
// «Новая жизнь» - последней и только после подтверждения.
import { useEffect, useState } from 'preact/hooks'
import { useUi } from './text'
import { Icon } from './Icon'

export type MenuTarget = 'settings' | 'memorial' | 'awards' | 'about' | 'feedback'

export function MenuSheet(props: {
  /** Имя и возраст героя - для подтверждения «Новой жизни». */
  hero: { name: string; age: number }
  onClose: () => void
  go: (to: MenuTarget) => void
  onNewLife: () => void
  feedback?: boolean
}) {
  const { t } = useUi()
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [props.onClose])
  const item = (to: MenuTarget, key: string) => (
    <button type="button" class="menu-sheet-item" onClick={() => props.go(to)}>
      {t(key)}
      <span aria-hidden="true">›</span>
    </button>
  )
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet menu-sheet" role="dialog" aria-modal="true" aria-labelledby="menu-sheet-title">
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <h2 id="menu-sheet-title">{t('life.menu')}</h2>
          <button class="link sheet-x" aria-label={t('common.close')} onClick={props.onClose}>×</button>
        </div>
        {!confirm ? (
          <>
            <button type="button" class="primary menu-sheet-continue" autoFocus onClick={props.onClose}>
              <Icon name="play" /> {t('menu.continue')}
            </button>
            <nav class="menu-sheet-list">
              {item('settings', 'menu.nav.settings')}
              {item('memorial', 'menu.nav.memorial')}
              {item('awards', 'menu.nav.awards')}
              {item('about', 'menu.nav.about')}
              {props.feedback && item('feedback', 'menu.nav.feedback')}
            </nav>
            <button type="button" class="secondary menu-sheet-new" onClick={() => setConfirm(true)}>
              {t('menu.new_life')}
            </button>
          </>
        ) : (
          <div class="menu-sheet-confirm">
            <p>{t('menu.new_life.confirm', { name: { name: props.hero.name }, n: props.hero.age })}</p>
            <button type="button" class="primary" autoFocus onClick={() => setConfirm(false)}>
              {t('menu.new_life.keep')}
            </button>
            <button type="button" class="danger" onClick={props.onNewLife}>
              {t('menu.new_life.go')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
