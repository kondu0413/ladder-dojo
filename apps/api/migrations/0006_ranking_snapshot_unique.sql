-- 全体ランキングのスナップショットは org_id が NULL で、主キー (period, metric, org_id, rank) の
-- 一意性が効かない(SQLite は NULL 同士を別の値と見る)。同じ順位が 2 行入ることがあったので、
-- 式インデックスで一意にする。既存の全体スナップショットは消しておく(次回の読み取りか Cron で作り直す)。S-054
DELETE FROM ranking_snapshots WHERE org_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ranking_snapshots_unique_rank
ON ranking_snapshots (period, metric, coalesce(org_id, ''), rank);
