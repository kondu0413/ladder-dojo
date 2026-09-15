CREATE TABLE `problem_mistake_users` (
	`problem_id` text NOT NULL,
	`diagnosis_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`problem_id`, `diagnosis_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `problem_mistakes` (
	`problem_id` text NOT NULL,
	`diagnosis_id` text NOT NULL,
	`users` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `diagnosis_id`)
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `diagnosis_id` text;