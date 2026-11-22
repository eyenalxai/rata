ALTER TABLE `team_cache` RENAME TO `context_cache`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_context_cache` (
	`profile` text NOT NULL,
	`team_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`detail` text NOT NULL,
	`fetched_at` integer NOT NULL,
	CONSTRAINT `context_cache_pk` PRIMARY KEY(`profile`, `team_id`, `key_hash`)
);
--> statement-breakpoint
INSERT INTO `__new_context_cache`(`profile`, `team_id`, `key_hash`, `detail`, `fetched_at`) SELECT `profile`, `team_id`, `key_hash`, `detail`, `fetched_at` FROM `context_cache`;--> statement-breakpoint
DROP TABLE `context_cache`;--> statement-breakpoint
ALTER TABLE `__new_context_cache` RENAME TO `context_cache`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_viewer_cache` (
	`profile` text NOT NULL,
	`key_hash` text NOT NULL,
	`viewer` text NOT NULL,
	`fetched_at` integer NOT NULL,
	CONSTRAINT `viewer_cache_pk` PRIMARY KEY(`profile`, `key_hash`)
);
--> statement-breakpoint
INSERT INTO `__new_viewer_cache`(`profile`, `key_hash`, `viewer`, `fetched_at`) SELECT `profile`, `key_hash`, `viewer`, `fetched_at` FROM `viewer_cache`;--> statement-breakpoint
DROP TABLE `viewer_cache`;--> statement-breakpoint
ALTER TABLE `__new_viewer_cache` RENAME TO `viewer_cache`;--> statement-breakpoint
PRAGMA foreign_keys=ON;