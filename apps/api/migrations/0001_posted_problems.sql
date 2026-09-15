CREATE TABLE `posted_attempts` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`cleared_at` integer,
	`last_attempt_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `posted_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posted_attempts_user_idx` ON `posted_attempts` (`user_id`,`last_attempt_at`);--> statement-breakpoint
CREATE TABLE `posted_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`spec` text NOT NULL,
	`circuit_json` text NOT NULL,
	`test_cases_json` text NOT NULL,
	`difficulty` integer NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`attempts_count` integer DEFAULT 0 NOT NULL,
	`clears_count` integer DEFAULT 0 NOT NULL,
	`reports_count` integer DEFAULT 0 NOT NULL,
	`difficulty_votes_count` integer DEFAULT 0 NOT NULL,
	`difficulty_votes_sum` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posted_visible_new_idx` ON `posted_problems` (`hidden`,`visibility`,`created_at`);--> statement-breakpoint
CREATE INDEX `posted_visible_likes_idx` ON `posted_problems` (`hidden`,`visibility`,`likes_count`);--> statement-breakpoint
CREATE INDEX `posted_visible_difficulty_idx` ON `posted_problems` (`hidden`,`visibility`,`difficulty`);--> statement-breakpoint
CREATE INDEX `posted_author_idx` ON `posted_problems` (`author_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `problem_difficulty_votes` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`difficulty` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `posted_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `problem_likes` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `posted_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `problem_reports` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `posted_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
