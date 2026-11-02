// Общие строки детской игры (RU / EN / TR). Строки самих головоломок - в их файлах (text).
import type { KidsLang, Task } from './types'

export const KIDS_TEXT: Record<KidsLang, Record<string, string>> = {
  ru: {
    age: '{n} лет · лето',
    choose: 'Чем займёшься этим летом?',
    'dir.body': 'Тело',
    'dir.mind': 'Ум',
    'dir.people': 'Люди',
    'reward.body': 'здоровье и сила',
    'reward.mind': 'ум и грамота',
    'reward.people': 'обаяние и положение',
    moves: 'Ходов: {n}',
    par: 'лучше всего: {n}',
    hint: 'Подсказка',
    reset: 'Сначала',
    give_up: 'Бросить',
    win: 'Получилось!',
    lose: 'Не вышло - зато было весело',
    gain: '+{n} - {what}',
    next: 'Дальше',
    again: 'Ещё раз',
    hint_used: 'с подсказкой - не больше двух звёзд',
  },
  en: {
    age: 'Age {n} · summer',
    choose: 'What will you do this summer?',
    'dir.body': 'Body',
    'dir.mind': 'Mind',
    'dir.people': 'People',
    'reward.body': 'health and strength',
    'reward.mind': 'mind and letters',
    'reward.people': 'charm and standing',
    moves: 'Moves: {n}',
    par: 'best: {n}',
    hint: 'Hint',
    reset: 'Restart',
    give_up: 'Give up',
    win: 'You did it!',
    lose: "It didn't work out, but it was fun",
    gain: '+{n}: {what}',
    next: 'Continue',
    again: 'Play again',
    hint_used: 'with a hint - two stars at most',
  },
  tr: {
    age: '{n} yaş · yaz',
    choose: 'Bu yaz ne yapacaksın?',
    'dir.body': 'Beden',
    'dir.mind': 'Akıl',
    'dir.people': 'İnsanlar',
    'reward.body': 'sağlık ve güç',
    'reward.mind': 'akıl ve okuma yazma',
    'reward.people': 'cazibe ve itibar',
    moves: 'Hamle: {n}',
    par: 'en iyisi: {n}',
    hint: 'İpucu',
    reset: 'Baştan',
    give_up: 'Bırak',
    win: 'Başardın!',
    lose: 'Olmadı, ama eğlenceliydi',
    gain: '+{n}: {what}',
    next: 'Devam',
    again: 'Bir daha',
    hint_used: 'ipucuyla - en fazla iki yıldız',
  },
}

export function kt(lang: KidsLang, key: string, params: Record<string, string | number> = {}): string {
  const s = KIDS_TEXT[lang][key] ?? KIDS_TEXT.en[key] ?? key
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

export const TASK_ICON: Record<Task, 'heart' | 'book' | 'crown'> = { body: 'heart', mind: 'book', people: 'crown' }
