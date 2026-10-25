/**
 * Создаёт Google-форму для отзывов игроков «Тысяч жизней» и таблицу, куда будут падать ответы.
 * Как запустить: откройте https://script.new (войдя в свой Google-аккаунт), сотрите всё в редакторе,
 * вставьте этот файл целиком, нажмите «Выполнить» (▶) и разрешите доступ к Google Формам и Таблицам.
 * В конце внизу, в «Журнале выполнения», появится строка CONFIG — пришлите её разработчику (Claude).
 */
function createFeedbackForm() {
  const form = FormApp.create('Тысячи жизней — отзывы игроков')
  form.setDescription('Отзывы приходят прямо из игры thousands.life. Эту форму игроки не видят — она принимает ответы с сайта.')
  form.setCollectEmail(false)
  form.setAllowResponseEdits(false)
  form.setShowLinkToRespondAgain(false)

  const rating = form.addScaleItem().setTitle('Оценка (1–5)').setBounds(1, 5)
  const liked = form.addParagraphTextItem().setTitle('Что понравилось больше всего?')
  const boring = form.addParagraphTextItem().setTitle('Где было скучно или непонятно?')
  const change = form.addParagraphTextItem().setTitle('Что изменить в первую очередь?')
  const missing = form.addParagraphTextItem().setTitle('Чего не хватает?')
  const again = form.addParagraphTextItem().setTitle('Захочется сыграть ещё? Что бы вернуло?')
  const contact = form.addTextItem().setTitle('Контакт (почта или телеграм)')
  const context = form.addParagraphTextItem().setTitle('О какой жизни (страна, возраст героя, язык)')

  // Таблица с ответами.
  const sheet = SpreadsheetApp.create('Тысячи жизней — отзывы (ответы)')
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId())

  // Номера полей entry.NNN: для каждого поля — своя ссылка с предзаполнением, в ней ровно один entry.
  const items = { rating, liked, boring, change, missing, again, contact, context }
  const fields = {}
  for (const key of Object.keys(items)) {
    const r = form.createResponse()
    r.withItemResponse(key === 'rating' ? rating.createResponse(3) : items[key].createResponse('x'))
    fields[key] = r.toPrefilledUrl().match(/entry\.\d+/)[0]
  }

  const config = { url: form.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse'), fields }
  Logger.log('Форма: ' + form.getEditUrl())
  Logger.log('Таблица с ответами: ' + sheet.getUrl())
  Logger.log('CONFIG ' + JSON.stringify(config))
}
