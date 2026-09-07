import { voiceHmac } from './tencent-speech';
import type { VoiceDatabase } from './voice-quota';

export async function reservePhotoQuota(
  db: VoiceDatabase,
  ip: string,
  secret: string,
  dailyLimit: number,
  now = Math.floor(Date.now() / 1000),
) {
  const digest = await voiceHmac(secret, 'kitchen-photo-ip:' + ip);
  const id = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  await db
    .prepare(
      'DELETE FROM photo_usage WHERE key IN (SELECT key FROM photo_usage WHERE reset_at < ? LIMIT 100)',
    )
    .bind(now - 86400)
    .run();
  for (const [key, seconds, limit] of [
    ['minute:' + id, 60, 5],
    ['day:' + id, 86400, 30],
    ['global:day', 86400, dailyLimit],
  ] as const) {
    const resetAt = (Math.floor(now / seconds) + 1) * seconds;
    const row = await db
      .prepare(`INSERT INTO photo_usage (key, used, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
      used = CASE WHEN photo_usage.reset_at <= ? THEN 1 ELSE photo_usage.used + 1 END,
      reset_at = CASE WHEN photo_usage.reset_at <= ? THEN excluded.reset_at ELSE photo_usage.reset_at END
      WHERE photo_usage.reset_at <= ? OR photo_usage.used < ? RETURNING used`)
      .bind(key, resetAt, now, now, now, limit)
      .first<{ used: number }>();
    if (!row) return false;
  }
  return true;
}
