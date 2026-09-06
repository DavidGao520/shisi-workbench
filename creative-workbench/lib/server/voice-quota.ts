import { voiceHmac } from './tencent-speech';

export type VoiceDatabase = Pick<D1Database, 'prepare'>;

async function take(
  db: VoiceDatabase,
  key: string,
  seconds: number,
  limit: number,
  now: number,
) {
  const resetAt = (Math.floor(now / seconds) + 1) * seconds;
  // Atomic conditional upsert: multiple Worker isolates share the same cap.
  const result = await db
    .prepare(`
    INSERT INTO voice_usage (key, used, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      used = CASE WHEN voice_usage.reset_at <= ? THEN 1 ELSE voice_usage.used + 1 END,
      reset_at = CASE WHEN voice_usage.reset_at <= ? THEN excluded.reset_at ELSE voice_usage.reset_at END
    WHERE voice_usage.reset_at <= ? OR voice_usage.used < ?
    RETURNING used
  `)
    .bind(key, resetAt, now, now, now, limit)
    .first<{ used: number }>();
  return !!result;
}

export async function reserveVoiceQuota(
  db: VoiceDatabase,
  ip: string,
  secret: string,
  dailyLimit: number,
  now = Math.floor(Date.now() / 1000),
) {
  // Store a keyed identifier, not the address, with at most two days' retention.
  const digest = await voiceHmac(secret, 'kitchen-voice-ip:' + ip);
  const id = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  await db
    .prepare(`DELETE FROM voice_usage WHERE key IN
    (SELECT key FROM voice_usage WHERE reset_at < ? LIMIT 100)`)
    .bind(now - 86400)
    .run();
  // Failed attempts consume reservations too; do not retry billable calls.
  if (!(await take(db, 'minute:' + id, 60, 5, now))) return false;
  if (!(await take(db, 'day:' + id, 86400, 30, now))) return false;
  return take(db, 'global:day', 86400, dailyLimit, now);
}
