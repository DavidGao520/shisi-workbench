import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Usage counters only: never stores audio, transcripts or kitchen inventory.
export const voiceUsage = sqliteTable(
  'voice_usage',
  {
    key: text('key').primaryKey(),
    used: integer('used').notNull(),
    resetAt: integer('reset_at').notNull(),
  },
  (table) => [index('voice_usage_reset_idx').on(table.resetAt)],
);
