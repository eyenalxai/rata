CREATE TABLE `profiles` (
	`name` text PRIMARY KEY,
	`api_key` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`key` text PRIMARY KEY,
	`team` text,
	`project` text,
	`workspace` text
);
