CREATE TABLE `team_cache` (
	`profile` text NOT NULL,
	`team_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`detail` text NOT NULL,
	`fetched_at` integer NOT NULL,
	CONSTRAINT `team_cache_pk` PRIMARY KEY(`profile`, `team_id`)
);
--> statement-breakpoint
CREATE TABLE `viewer_cache` (
	`profile` text PRIMARY KEY,
	`key_hash` text NOT NULL,
	`viewer` text NOT NULL,
	`fetched_at` integer NOT NULL
);
