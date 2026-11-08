import { randomInt } from 'node:crypto';
import { RestoreError } from './roleBackupRestoreErrors.js';

const categoryRoles = { players: 'player', owners: 'turf_owner', admins: 'admin' };

const bucketCollections = {
  admin_audit_logs: 'audit_logs',
  owner_profiles: 'turf_owner_profiles',
  staff_users: 'users',
  wallet_transactions_for_bookings: 'wallet_transactions',
  reviews_for_bookings: 'reviews',
  notifications_for_staff: 'notifications',
  featured_listing_payments: 'payments',
  featured_listings_from_credits: 'featured_listings',
  slots_for_bookings: 'slots',
  favorite_turfs: 'turfs',
  match_participations: 'match_participants',
  tournaments_captained: 'tournament_teams',
  match_participants_for_matches: 'match_participants',
  matches_for_participation: 'open_matches',
};

const sensitiveFieldPattern = /password|token|authcode|codehash|secret|credential|privatekey|encryptionkey|apikey|gatewayresponse|encrypted|businessdocuments|payoutdetails|verificationdocuments|session|cookie|authorization|setuplink/i;

const dependencyOrder = [
  'users',
  'turf_owner_profiles',
  'turfs',
  'turf_photos',
  'turf_pricing_rules',
  'staff_assignments',
  'slots',
  'bookings',
  'booking_slots',
  'manual_bookings',
  'turf_addons',
  'booking_addons',
  'turf_addon_inventory_log',
  'payments',
  'featured_listings',
  'refunds',
  'wallets',
  'withdrawals',
  'wallet_transactions',
  'reviews',
  'notifications',
  'favorites',
  'disputes',
  'audit_logs',
  'turf_removal_requests',
  'turf_cancellation_policies',
  'owner_cancellation_policies',
  'owner_subscription_payments',
  'open_matches',
  'match_participants',
  'tournaments',
  'tournament_teams',
  'tournament_roster_members',
  'tournament_matches',
  'platform_credits',
  'platform_credit_usages',
  'featured_listing_cancellations',
];

const featureFlagKeys = [
  'addons_enabled',
  'squad_enabled',
  'tournament_enabled',
  'featured_turf_enabled',
  'featured_addon_enabled',
  'whatsapp_enabled',
  'trending_enabled',
  'near_you_enabled',
];

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

const stableStringify = (value) => JSON.stringify(canonicalize(value));

const assertNoSensitiveFields = (value, label) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveFields(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveFieldPattern.test(key.replace(/[^a-z0-9]/gi, ''))) {
      throw new RestoreError(`Backup contains a prohibited sensitive field in ${label}.`);
    }
    assertNoSensitiveFields(item, `${label}.${key}`);
  }
};

export const validateBackup = (backup, expectedCategory) => {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new RestoreError(`The ${expectedCategory} backup is not a JSON object.`);
  }
  if (backup.formatVersion !== 1 || backup.category !== expectedCategory || backup.databaseProvider !== 'mongodb') {
    throw new RestoreError(`The ${expectedCategory} backup has an unsupported format, category, or source database.`);
  }
  if (typeof backup.generatedAt !== 'string' || Number.isNaN(Date.parse(backup.generatedAt))) {
    throw new RestoreError(`The ${expectedCategory} backup has an invalid generation timestamp.`);
  }
  if (!backup.records || typeof backup.records !== 'object' || Array.isArray(backup.records)) {
    throw new RestoreError(`The ${expectedCategory} backup has no valid records object.`);
  }

  for (const [bucket, rows] of Object.entries(backup.records)) {
    if (bucket !== 'users' && !Object.hasOwn(bucketCollections, bucket) && !dependencyOrder.includes(bucket)) {
      throw new RestoreError(`The ${expectedCategory} backup contains an unsupported record group.`);
    }
    if (!Array.isArray(rows)) {
      throw new RestoreError(`The ${expectedCategory} backup contains an invalid record group.`);
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id.trim()) {
        throw new RestoreError(`The ${expectedCategory} backup contains a record without a valid ID.`);
      }
      assertNoSensitiveFields(row, `${expectedCategory}.${bucket}`);
    }
  }

  const users = backup.records.users;
  if (!Array.isArray(users)) throw new RestoreError(`The ${expectedCategory} backup is missing its users group.`);
  const expectedRole = categoryRoles[expectedCategory];
  if (users.some((user) => user.role !== expectedRole)) {
    throw new RestoreError(`The ${expectedCategory} backup contains an account with the wrong role.`);
  }
  if (expectedCategory === 'admins' && users.length === 0) {
    throw new RestoreError('The admins backup must contain at least one admin account.');
  }
  if (backup.records.staff_users?.some((user) => user.role !== 'staff')) {
    throw new RestoreError('The owners backup contains an account with the wrong staff role.');
  }
  return backup;
};

const addReferenceRule = (rules, collection, field, target, optional = false) => {
  rules.push({ collection, field, target, optional });
};

const referenceRules = [];
for (const [collection, field, target] of [
  ['turf_owner_profiles', 'user_id', 'users'],
  ['turfs', 'owner_id', 'users'],
  ['turf_photos', 'turf_id', 'turfs'],
  ['turf_pricing_rules', 'turf_id', 'turfs'],
  ['staff_assignments', 'staff_user_id', 'users'],
  ['staff_assignments', 'turf_id', 'turfs'],
  ['slots', 'turf_id', 'turfs'],
  ['bookings', 'turf_id', 'turfs'],
  ['booking_slots', 'booking_id', 'bookings'],
  ['booking_slots', 'slot_id', 'slots'],
  ['manual_bookings', 'booking_id', 'bookings'],
  ['turf_addons', 'turf_id', 'turfs'],
  ['booking_addons', 'booking_id', 'bookings'],
  ['booking_addons', 'addon_id', 'turf_addons'],
  ['turf_addon_inventory_log', 'addon_id', 'turf_addons'],
  ['featured_listings', 'turf_id', 'turfs'],
  ['featured_listings', 'owner_id', 'users'],
  ['refunds', 'booking_id', 'bookings'],
  ['wallets', 'owner_id', 'users'],
  ['wallet_transactions', 'owner_id', 'users'],
  ['wallet_transactions', 'booking_id', 'bookings'],
  ['withdrawals', 'owner_id', 'users'],
  ['reviews', 'booking_id', 'bookings'],
  ['reviews', 'player_id', 'users'],
  ['reviews', 'turf_id', 'turfs'],
  ['notifications', 'user_id', 'users'],
  ['favorites', 'player_id', 'users'],
  ['favorites', 'turf_id', 'turfs'],
  ['disputes', 'booking_id', 'bookings'],
  ['turf_removal_requests', 'turf_id', 'turfs'],
  ['turf_removal_requests', 'owner_id', 'users'],
  ['owner_subscription_payments', 'owner_id', 'users'],
  ['open_matches', 'booking_id', 'bookings'],
  ['open_matches', 'captain_id', 'users'],
  ['match_participants', 'match_id', 'open_matches'],
  ['match_participants', 'player_id', 'users'],
  ['tournaments', 'turf_id', 'turfs'],
  ['tournament_teams', 'tournament_id', 'tournaments'],
  ['tournament_matches', 'tournament_id', 'tournaments'],
  ['tournament_roster_members', 'team_id', 'tournament_teams'],
  ['tournament_roster_members', 'tournament_id', 'tournaments'],
  ['tournaments', 'organizer_id', 'users'],
  ['platform_credits', 'owner_id', 'users'],
  ['platform_credit_usages', 'credit_id', 'platform_credits'],
  ['platform_credit_usages', 'used_for_id', 'featured_listings'],
  ['featured_listing_cancellations', 'listing_id', 'featured_listings'],
  ['featured_listing_cancellations', 'credit_id', 'platform_credits'],
]) addReferenceRule(referenceRules, collection, field, target);

for (const [collection, field, target] of [
  ['payments', 'booking_id', 'bookings'],
  ['featured_listings', 'payment_id', 'payments'],
  ['bookings', 'player_id', 'users'],
  ['bookings', 'cancelled_by', 'users'],
  ['slots', 'locked_by_user_id', 'users'],
  ['turf_owner_profiles', 'approved_by', 'users'],
  ['staff_assignments', 'assigned_by', 'users'],
  ['manual_bookings', 'created_by', 'users'],
  ['withdrawals', 'reviewed_by', 'users'],
  ['disputes', 'raised_by', 'users'],
  ['disputes', 'resolved_by', 'users'],
  ['turf_removal_requests', 'reviewed_by', 'users'],
  ['turf_cancellation_policies', 'policy_id', 'cancellation_policies'],
  ['owner_cancellation_policies', 'policy_id', 'cancellation_policies'],
  ['turf_addon_inventory_log', 'booking_id', 'bookings'],
  ['turf_addon_inventory_log', 'created_by', 'users'],
  ['featured_listings', 'approved_by', 'users'],
  ['featured_listings', 'cancelled_by', 'users'],
  ['tournament_matches', 'slot_id', 'slots'],
  ['tournament_matches', 'team_a_id', 'tournament_teams'],
  ['tournament_matches', 'team_b_id', 'tournament_teams'],
  ['tournament_matches', 'winner_team_id', 'tournament_teams'],
  ['tournament_roster_members', 'player_id', 'users'],
  ['tournament_teams', 'captain_id', 'users'],
  ['platform_credits', 'revoked_by', 'users'],
  ['featured_listing_cancellations', 'cancelled_by', 'users'],
  ['reviews', 'moderated_by', 'users'],
]) addReferenceRule(referenceRules, collection, field, target, true);

const uniqueRules = [
  { collection: 'users', fields: ['email'] },
  { collection: 'turf_owner_profiles', fields: ['user_id'] },
  { collection: 'wallets', fields: ['owner_id'] },
  { collection: 'slots', fields: ['turf_id', 'date', 'start_time'] },
  { collection: 'bookings', fields: ['idempotency_key'], partial: (row) => typeof row.idempotency_key === 'string' },
  { collection: 'reviews', fields: ['booking_id'] },
  { collection: 'favorites', fields: ['player_id', 'turf_id'] },
  { collection: 'turf_removal_requests', fields: ['turf_id'], partial: (row) => row.status === 'pending' },
  { collection: 'owner_subscription_payments', fields: ['owner_id', 'billing_period_end'] },
  { collection: 'payments', fields: ['transaction_id'], partial: (row) => typeof row.transaction_id === 'string' },
  { collection: 'refunds', fields: ['gateway_request_id'], sparse: true },
  { collection: 'wallet_transactions', fields: ['idempotency_key'], partial: (row) => typeof row.idempotency_key === 'string' },
  { collection: 'withdrawals', fields: ['owner_id', 'idempotency_key'], partial: (row) => typeof row.idempotency_key === 'string' },
  { collection: 'notifications', fields: ['user_id', 'data.eventKey'], partial: (row) => typeof row.data?.eventKey === 'string' },
  { collection: 'staff_assignments', fields: ['staff_user_id', 'turf_id'] },
  { collection: 'tournament_teams', fields: ['tournament_id', 'team_name'] },
  { collection: 'open_matches', fields: ['booking_id'] },
  { collection: 'match_participants', fields: ['match_id', 'player_id'] },
];

export const buildRestorePlan = (backups) => {
  const expectedCategories = ['players', 'owners', 'admins'];
  for (const category of expectedCategories) validateBackup(backups?.[category], category);

  const byCollection = new Map();
  for (const category of expectedCategories) {
    for (const [bucket, sourceRows] of Object.entries(backups[category].records)) {
      const collection = bucketCollections[bucket] || bucket;
      if (!byCollection.has(collection)) byCollection.set(collection, new Map());
      const uniqueRows = byCollection.get(collection);
      for (const sourceRow of sourceRows) {
        const row = { ...sourceRow };
        delete row._id;
        if (collection === 'users') row.password_hash = null;
        const prior = uniqueRows.get(row.id);
        if (prior && stableStringify(prior) !== stableStringify(row)) {
          throw new RestoreError(`Backups contain conflicting records in the ${collection} group.`);
        }
        uniqueRows.set(row.id, row);
      }
    }
  }

  const plan = new Map();
  for (const collection of dependencyOrder) {
    const records = byCollection.get(collection);
    if (records?.size) plan.set(collection, [...records.values()]);
  }
  const unknownCollections = [...byCollection.keys()].filter((collection) => !dependencyOrder.includes(collection));
  if (unknownCollections.length) {
    throw new RestoreError('Backups contain record groups that this importer cannot restore.');
  }

  const idsByCollection = new Map([...plan].map(([collection, rows]) => [collection, new Set(rows.map((row) => row.id))]));
  for (const { collection, field, target, optional } of referenceRules) {
    for (const row of plan.get(collection) || []) {
      const referencedId = row[field];
      if (referencedId === null || referencedId === undefined || referencedId === '') {
        if (optional) continue;
        throw new RestoreError(`Backup records are missing a required relationship in ${collection}.`);
      }
      if (!idsByCollection.get(target)?.has(referencedId)) {
        throw new RestoreError(`Backup records refer to missing data in ${target}.`);
      }
    }
  }

  for (const { collection, fields, partial, sparse } of uniqueRules) {
    const seen = new Set();
    for (const row of plan.get(collection) || []) {
      if (partial && !partial(row)) continue;
      if (sparse && fields.every((field) => !Object.hasOwn(row, field))) continue;
      const keyValues = fields.map((field) => field.split('.').reduce((value, part) => value?.[part], row));
      if (keyValues.some((value) => value === undefined || value === '')) {
        throw new RestoreError(`Backup records are missing a required unique field in ${collection}.`);
      }
      const key = stableStringify(keyValues);
      if (seen.has(key)) {
        throw new RestoreError(`Backup records violate a unique database constraint in ${collection}.`);
      }
      seen.add(key);
    }
  }

  const userEmails = new Map();
  for (const user of plan.get('users') || []) {
    if (typeof user.email !== 'string' || !user.email.trim()) throw new RestoreError('An imported account is missing its email address.');
    const normalizedEmail = user.email.trim().toLowerCase();
    const existingId = userEmails.get(normalizedEmail);
    if (existingId && existingId !== user.id) throw new RestoreError('Backups contain duplicate account email addresses.');
    userEmails.set(normalizedEmail, user.id);
    user.token_version = randomInt(1, 2 ** 48);
  }

  return plan;
};

const validateDefaultPolicyBootstrap = (policies, tiers) => {
  if (!policies.length && !tiers.length) return;
  if (policies.length !== 1 || !policies[0].is_default || policies[0].name !== 'Standard') {
    throw new RestoreError('The destination has non-default cancellation policy data.');
  }
  if (tiers.length !== 3 || tiers.some((tier) => tier.policy_id !== policies[0].id)) {
    throw new RestoreError('The destination has incomplete default cancellation policy data.');
  }
  const tierShape = tiers
    .map(({ hours_before_start_min, hours_before_start_max, refund_percentage, sort_order }) => ({
      hours_before_start_min: Number(hours_before_start_min),
      hours_before_start_max: hours_before_start_max === null ? null : Number(hours_before_start_max),
      refund_percentage: Number(refund_percentage),
      sort_order: Number(sort_order),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const expected = [
    { hours_before_start_min: 0, hours_before_start_max: 6, refund_percentage: 0, sort_order: 0 },
    { hours_before_start_min: 6, hours_before_start_max: 24, refund_percentage: 50, sort_order: 1 },
    { hours_before_start_min: 24, hours_before_start_max: null, refund_percentage: 100, sort_order: 2 },
  ];
  if (stableStringify(tierShape) !== stableStringify(expected)) {
    throw new RestoreError('The destination default cancellation policy has been customized.');
  }
};

export const validateDestinationSnapshot = ({ collectionCounts, featureFlags = [], policies = [], tiers = [] }) => {
  const permittedCollections = new Set(['schema_migrations', 'feature_flags', 'cancellation_policies', 'cancellation_policy_tiers']);
  for (const [collection, count] of Object.entries(collectionCounts)) {
    if (count > 0 && !permittedCollections.has(collection)) {
      throw new RestoreError(`The destination is not empty; existing records were found in ${collection}.`);
    }
  }

  if (featureFlags.length) {
    const flagsByKey = new Map(featureFlags.map((flag) => [flag.key, flag.value]));
    if (flagsByKey.size !== featureFlagKeys.length ||
        featureFlagKeys.some((key) => flagsByKey.get(key) !== false) ||
        featureFlags.some((flag) => !featureFlagKeys.includes(flag.key))) {
      throw new RestoreError('The destination has non-default feature-flag data.');
    }
  }
  validateDefaultPolicyBootstrap(policies, tiers);
};

export const getRestoreCounts = (plan) => Object.fromEntries(
  [...plan.entries()].map(([collection, rows]) => [collection, rows.length]),
);
