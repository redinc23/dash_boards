CREATE TABLE IF NOT EXISTS repo_snapshots (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_snapshots_full_name_idx
ON repo_snapshots(full_name);

CREATE INDEX IF NOT EXISTS repo_snapshots_fetched_at_idx
ON repo_snapshots(fetched_at DESC);
