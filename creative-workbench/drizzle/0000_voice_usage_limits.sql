CREATE TABLE `voice_usage` (
	`key` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `voice_usage_reset_idx` ON `voice_usage` (`reset_at`);