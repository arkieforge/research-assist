CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY,
	`chat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL
);
