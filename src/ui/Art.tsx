// Заглушка иллюстрации: цвет эпохи и значок категории. Когда появятся картинки,
// компонент начнёт показывать файл assets/images/img_{era}_{category}_{region}_{index}.webp.

export type ArtCategory = 'birth' | 'personal' | 'family' | 'local' | 'global' | 'death' | 'work'

const icons: Record<ArtCategory, string> = {
  // Колыбель
  birth: 'M14 38h36M18 38c0-10 6-16 14-16s14 6 14 16M22 44l-4 6M42 44l4 6M32 22v-6',
  // Фигура человека
  personal: 'M32 16a6 6 0 1 0 0.01 0M20 50c0-9 5-16 12-16s12 7 12 16',
  // Дом
  family: 'M14 32l18-14 18 14M18 30v20h28V30M28 50V38h8v12',
  // Колонны
  local: 'M12 20h40M16 20l16-8 16 8M18 24v22M26 24v22M38 24v22M46 24v22M12 50h40',
  // Лавровый венок
  global: 'M32 50c-12-4-18-14-16-28M32 50c12-4 18-14 16-28M18 30l-5-2M17 38l-5 0M21 45l-4 3M46 30l5-2M47 38l5 0M43 45l4 3',
  // Масляная лампа
  death: 'M16 40c0-6 8-8 16-8s16 2 16 8-8 6-16 6-16 0-16-6zM48 38l6-4M32 32v-6M32 20c-3 3-3 6 0 6s3-3 0-6',
  // Молот
  work: 'M20 44l16-16M30 18l12 12M28 20l6-6 12 12-6 6z',
}

export function Art({ category, label }: { category: ArtCategory; label?: string }) {
  return (
    <div class={`art art-${category}`} role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d={icons[category]} />
      </svg>
    </div>
  )
}
