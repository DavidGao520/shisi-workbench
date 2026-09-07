// Immutable COS slots: only a successful create-if-absent grants quota.
// Cache only occupied slots, never infer availability from reads or concurrency.
import { voiceHmac } from './speech.mjs';

export function createQuotaChecker({ claim, occupied = new Map() }) {
  if (typeof claim !== 'function') throw new Error('quota-store-required');
  return async function reserveVoiceQuota(
    ip,
    secret,
    dailyLimit,
    now = Math.floor(Date.now() / 1000),
    signal = AbortSignal.timeout(8000),
  ) {
    if (
      !ip ||
      !secret ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      !Number.isSafeInteger(dailyLimit) ||
      dailyLimit < 1 ||
      dailyLimit > 1000
    )
      throw new Error('quota-config-invalid');
    const day = Math.floor(now / 86400);
    for (const [key, expires] of occupied)
      if (expires <= now) occupied.delete(key);
    if (occupied.size > 5000) occupied.clear();
    const id = Buffer.from(
      await voiceHmac(secret, 'kitchen-voice-ip:' + ip),
    ).toString('hex');
    async function take(window, count, expires) {
      for (let slot = 1; slot <= count; slot++) {
        signal.throwIfAborted();
        const key = `voice-usage/${window}/${slot}`;
        if (occupied.has(key)) continue;
        const result = await claim(key, signal);
        signal.throwIfAborted();
        if (typeof result !== 'boolean') throw new Error('quota-store-invalid');
        occupied.set(key, expires);
        if (result) return true;
      }
      return false;
    }
    // Partial reservations and provider failures keep their slots. No refunds.
    return (
      (await take(
        `minute/${Math.floor(now / 60)}/${id}`,
        5,
        (Math.floor(now / 60) + 1) * 60,
      )) &&
      (await take(`day/${day}/${id}`, 30, (day + 1) * 86400)) &&
      (await take(`global/${day}`, dailyLimit, (day + 1) * 86400))
    );
  };
}
