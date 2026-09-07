CREATE TABLE `photo_usage` (
	`key` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photo_usage_reset_idx` ON `photo_usage` (`reset_at`);