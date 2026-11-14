/** D-05: долгий синхронный прогон отдаёт управление, чтобы воркер vitest успевал отвечать главному процессу
 *  (иначе под нагрузкой - «[vitest-worker]: Timeout calling "onTaskUpdate"»: ответ ждёт дольше 60 с). */
export const breathe = () => new Promise<void>((r) => setTimeout(r, 0))
