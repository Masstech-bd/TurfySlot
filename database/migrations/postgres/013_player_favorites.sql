CREATE TABLE IF NOT EXISTS favorites (
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, turf_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_player_created ON favorites(player_id, created_at DESC);
