import { buildApp } from './app.js'
import { env } from './env.js'
import { sendDailyDigest } from './notifications/digest.js'

const fastify = await buildApp()

fastify
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    fastify.log.info(`server listening on :${env.PORT} (mode: ${env.NODE_ENV})`)
    startDigestScheduler()
  })
  .catch((error) => {
    fastify.log.error(error)
    process.exit(1)
  })

/**
 * 日次ダイジェストの内蔵スケジューラ（Phase 3 Phase C）。
 * NOTIFY_DIGEST_TIME（"HH:MM"）に一致した分に1回だけ送る。プロセス内の日付ガードに
 * 加え、sendDailyDigest側のdigestログ同日再送防止が再起動後の二重送信も防ぐ
 */
function startDigestScheduler() {
  const digestTime = env.NOTIFY_DIGEST_TIME
  if (!digestTime) return
  let lastFiredDate: string | null = null
  setInterval(() => {
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today = now.toDateString()
    if (hhmm !== digestTime || lastFiredDate === today) return
    lastFiredDate = today
    sendDailyDigest({ now }).then((result) => {
      fastify.log.info(
        `[notifications] daily digest: sent=${result.sent} skipped=${result.skipped} alerts=${result.alertCount}`,
      )
    })
  }, 30_000).unref()
  fastify.log.info(`[notifications] digest scheduler enabled at ${digestTime}`)
}
