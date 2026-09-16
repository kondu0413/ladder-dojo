-- 投稿問題の全文検索(改善候補 12 / S-016)。
--
-- これまでの検索は instr() の全表走査だった。投稿が増えると、
-- 1 回の検索で全行を読むことになる(COST.md §1.2)。
--
-- tokenize='trigram' を使う。既定の unicode61 は空白で区切るので、
-- 分かち書きをしない日本語ではほとんど当たらない。trigram は
-- 3 文字ずつの並びを見るので、日本語の部分一致がそのまま効く。
--
-- ただし **3 文字未満には当たらない**(「保持」「値」で 0 件)。
-- 呼ぶ側で 1〜2 文字は instr() に落とす。詳細は DECISIONS.md S-016。
CREATE VIRTUAL TABLE `posted_problems_fts` USING fts5(
	`problem_id` UNINDEXED,
	`title`,
	`spec`,
	tokenize='trigram'
);--> statement-breakpoint

-- 既存の投稿を入れておく。ここを忘れると、今ある問題だけ検索に出なくなる
INSERT INTO `posted_problems_fts` (`problem_id`, `title`, `spec`)
	SELECT `id`, `title`, `spec` FROM `posted_problems`;--> statement-breakpoint

-- 本体との同期はトリガで行う。アプリ側で書き足す形にすると、
-- 書き込む場所が増えたときに片方だけ直して食い違う
CREATE TRIGGER `posted_problems_fts_ai` AFTER INSERT ON `posted_problems` BEGIN
	INSERT INTO `posted_problems_fts` (`problem_id`, `title`, `spec`)
		VALUES (new.`id`, new.`title`, new.`spec`);
END;--> statement-breakpoint

CREATE TRIGGER `posted_problems_fts_ad` AFTER DELETE ON `posted_problems` BEGIN
	DELETE FROM `posted_problems_fts` WHERE `problem_id` = old.`id`;
END;--> statement-breakpoint

-- 更新は「消して入れ直す」。FTS5 の UPDATE は列を指定しても中身を作り直すので、
-- 素直にこう書いたほうが読み違えが起きない。
--
-- **UPDATE OF title, spec に絞るのが大事**。絞らないと、いいねや挑戦回数を
-- 数え上げるたびに索引を書き直すことになる。あれは検索の中身と関係が無いうえ、
-- 投稿の更新よりずっと回数が多い(COST.md §1.2: D1 の書き込みは 10万 行/日)
CREATE TRIGGER `posted_problems_fts_au` AFTER UPDATE OF `title`, `spec` ON `posted_problems` BEGIN
	DELETE FROM `posted_problems_fts` WHERE `problem_id` = old.`id`;
	INSERT INTO `posted_problems_fts` (`problem_id`, `title`, `spec`)
		VALUES (new.`id`, new.`title`, new.`spec`);
END;
