ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_size INTEGER NULL CHECK (team_size IS NULL OR team_size >= 2);
ALTER TABLE tournament_teams DROP CONSTRAINT IF EXISTS tournament_teams_status_check;
ALTER TABLE tournament_teams ADD CONSTRAINT tournament_teams_status_check CHECK (status IN ('pending_roster','registered','withdrawn','disqualified'));
CREATE TABLE IF NOT EXISTS tournament_roster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('manual','pending','accepted','declined')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tournament_roster_team ON tournament_roster_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_roster_player_pending ON tournament_roster_members(player_id,status) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_roster_unique_player ON tournament_roster_members(tournament_id,player_id) WHERE player_id IS NOT NULL AND status IN ('pending','accepted');
