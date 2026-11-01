ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS featured_listing_id UUID;

CREATE TABLE IF NOT EXISTS open_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  captain_id UUID NOT NULL REFERENCES users(id),
  sport_type VARCHAR(50) NOT NULL,
  skill_level VARCHAR(50) NOT NULL CHECK (skill_level IN ('casual','intermediate','competitive')),
  max_players INTEGER NOT NULL CHECK (max_players >= 2),
  joined_count INTEGER NOT NULL DEFAULT 1 CHECK (joined_count >= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','closed','cancelled')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_open_matches_status ON open_matches(status,created_at);

CREATE TABLE IF NOT EXISTS match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES open_matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'joined' CHECK (status IN ('joined','left','removed')),
  UNIQUE (match_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_participants_match ON match_participants(match_id,status);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id),
  organizer_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(150) NOT NULL,
  sport_type VARCHAR(50) NOT NULL,
  format VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_teams INTEGER NOT NULL CHECK (max_teams >= 2),
  entry_fee_amount NUMERIC(10,2),
  prize_pool_note TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','registration_closed','ongoing','completed','cancelled')),
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_tournaments_turf_status ON tournaments(turf_id,status);
CREATE INDEX IF NOT EXISTS idx_tournaments_status_dates ON tournaments(status,start_date,end_date);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  captain_id UUID NOT NULL REFERENCES users(id),
  team_name VARCHAR(100) NOT NULL,
  roster_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','withdrawn','disqualified')),
  registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id,team_name)
);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament ON tournament_teams(tournament_id,status);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_name VARCHAR(50),
  team_a_id UUID REFERENCES tournament_teams(id),
  team_b_id UUID REFERENCES tournament_teams(id),
  scheduled_date DATE,
  scheduled_start_time TIME,
  scheduled_end_time TIME,
  slot_id UUID REFERENCES slots(id),
  score_a INTEGER,
  score_b INTEGER,
  winner_team_id UUID REFERENCES tournament_teams(id),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id,scheduled_date);

CREATE TABLE IF NOT EXISTS featured_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  package_type VARCHAR(100) NOT NULL,
  package_name VARCHAR(100) NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  priority INTEGER NOT NULL DEFAULT 99,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  payment_note TEXT,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','payment_submitted','pending_approval','active','rejected','cancelled','expired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_featured_listings_status_end ON featured_listings(status,ends_at);
CREATE INDEX IF NOT EXISTS idx_featured_listings_turf_status ON featured_listings(turf_id,status);
CREATE INDEX IF NOT EXISTS idx_featured_listings_owner_status ON featured_listings(owner_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_one_active_per_turf
  ON featured_listings(turf_id) WHERE status IN ('pending_payment','payment_submitted','pending_approval','active');
