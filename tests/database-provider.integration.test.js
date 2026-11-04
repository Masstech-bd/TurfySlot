import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();

const providerName = (process.env.TEST_DB_PROVIDER || '').trim().toLowerCase();
const testDatabase = process.env.TEST_MONGODB_DATABASE || '';
const testDatabaseUrl = process.env.TEST_DATABASE_URL || '';

if (!['mongodb', 'postgres'].includes(providerName)) {
  test('database provider integration configuration', { skip: 'Set TEST_DB_PROVIDER to mongodb or postgres.' }, () => {});
} else if (providerName === 'mongodb' && (!process.env.MONGODB_TEST_URI || !/^turfyslot_test_[a-z0-9_-]+$/i.test(testDatabase))) {
  test('MongoDB integration configuration', { skip: 'Set MONGODB_TEST_URI and a disposable TEST_MONGODB_DATABASE beginning turfyslot_test_.' }, () => {});
} else if (providerName === 'postgres' && (!testDatabaseUrl || !/^turfyslot_test_[a-z0-9_-]+$/i.test(new URL(testDatabaseUrl).pathname.replace(/^\//, '')))) {
  test('PostgreSQL integration configuration', { skip: 'Set TEST_DATABASE_URL pointing to a disposable database beginning turfyslot_test_.' }, () => {});
} else {
  process.env.DB_PROVIDER = providerName;
  process.env.PAYOUT_ENCRYPTION_KEY ||= Buffer.alloc(32, 1).toString('base64');
  if (providerName === 'mongodb') {
    process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
    process.env.MONGODB_DATABASE = testDatabase;
  } else {
    process.env.DATABASE_URL = testDatabaseUrl;
  }

  const database = await import('../database/provider.js');
  test.after(async () => database.closeDatabase());

  test(`${providerName} persists feature flags and audit changes`, { timeout: 30_000 }, async () => {
    await database.connectDatabase();
    const initial = await database.listFeatureFlags();
    const expectedKeys = [
      'addons_enabled', 'squad_enabled', 'tournament_enabled', 'featured_turf_enabled',
      'featured_addon_enabled', 'whatsapp_enabled', 'trending_enabled', 'near_you_enabled',
    ];
    assert.deepEqual(Object.keys(initial).sort(), [...expectedKeys].sort());
    assert.ok(Object.values(initial).every((value) => value === false), 'all seeded flags must default off');

    const adminId = await database.createAdminAccount({
      name: 'Integration Test Admin',
      email: `integration-${crypto.randomUUID()}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    await database.setFeatureFlag({ key: 'near_you_enabled', value: true, adminId });
    assert.equal((await database.listFeatureFlags()).near_you_enabled, true);
    await database.setFeatureFlag({ key: 'near_you_enabled', value: false, adminId });
    assert.equal((await database.listFeatureFlags()).near_you_enabled, false);
    const ipnUrl = 'https://api.example.com/api/payments/surjopay/webhook';
    await database.writeAdminSetting({ key: 'shurjopay_ipn_url', value: ipnUrl, adminId });
    assert.equal((await database.readAdminSettings()).shurjopay_ipn_url, ipnUrl);
    for (const key of ['platform_fee_enabled', 'gateway_fee_enabled', 'show_fee_breakdown', 'owner_billing_switch_enabled']) {
      await database.writeAdminSetting({ key, value: false, adminId });
      assert.equal((await database.readAdminSettings())[key], false, `${key} must persist when disabled`);
    }
    await assert.rejects(
      database.setFeatureFlag({ key: 'not_a_flag', value: true, adminId }),
      /Invalid feature flag update/
    );
  });

  test(`${providerName} Phase 2 marketplace persistence`, {
    skip: 'Featured listings, platform-credit purchase flows, and tournament persistence are not implemented; verify them only after the Phase 1 non-regression gate.',
  }, () => {});

  test(`${providerName} corrects unverified player emails and invalidates old codes`, { timeout: 30_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const originalEmail = `player-${suffix}@example.invalid`;
    const replacementEmail = `corrected-${suffix}@example.invalid`;
    const reservedEmail = `reserved-${suffix}@example.invalid`;
    const player = await database.createPlayerAccount({ name: 'Email Correction Player', email: originalEmail, phone: `+880${Date.now()}`, passwordHash: 'test-only-not-a-login-hash' });
    const reserved = await database.createPlayerAccount({ name: 'Reserved Email Player', email: reservedEmail, phone: `+881${Date.now()}`, passwordHash: 'test-only-not-a-login-hash' });
    const previousCodeHash = `previous-code-${suffix}`;
    assert.equal(await database.createAuthCode({ userId: player.id, purpose: 'email_verification', codeHash: previousCodeHash }), true);
    await assert.rejects(database.updateUnverifiedPlayerEmail({ userId: player.id, email: reservedEmail }), /already registered/);
    assert.equal((await database.findUserByEmail(originalEmail)).id, player.id, 'a rejected replacement must leave the original account untouched');
    const updated = await database.updateUnverifiedPlayerEmail({ userId: player.id, email: replacementEmail });
    assert.equal(updated.email, replacementEmail);
    assert.equal(await database.findUserByEmail(originalEmail), null);
    assert.equal((await database.findUserByEmail(replacementEmail)).id, player.id);
    assert.equal(await database.consumeAuthCode({ userId: player.id, purpose: 'email_verification', codeHash: previousCodeHash }), false, 'the old address code must be invalidated');
    await assert.rejects(database.updateUnverifiedPlayerEmail({ userId: reserved.id, email: replacementEmail }), /already registered/);
  });

  test(`${providerName} persists player favorites and reviews turf removal requests`, { timeout: 30_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const admin = await database.createAdminAccount({
      name: 'Removal Integration Admin',
      email: `removal-admin-${suffix}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const owner = await database.createOwnerAccount({
      name: 'Removal Integration Owner',
      email: `removal-owner-${suffix}@example.invalid`,
      phone: `+880${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
      businessName: 'Removal Integration Turf',
      tradeLicenseNumber: `TEST-${suffix}`,
      businessDocuments: [{ document_type: 'trade_license', file_name: 'test.pdf', mime_type: 'application/pdf', storage_key: `${suffix}.pdf` }],
      payoutMethod: 'bkash',
      payoutDetails: { accountNumber: `01${suffix.replace(/-/g, '').slice(0, 10)}` },
      billingModel: 'commission',
    });
    await database.reviewOwnerAccount({ ownerId: owner.id, adminId: admin.id, approve: true });
    const player = await database.createPlayerAccount({
      name: 'Favorites Integration Player',
      email: `favorites-player-${suffix}@example.invalid`,
      phone: `+881${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const turf = await database.createTurf(owner.id, {
      name: 'Removal Integration Turf', address: 'Test address', area: 'Test area', city: 'Test city',
      latitude: 23.7, longitude: 90.4, sportTypes: ['football'], amenities: [], basePricePerHour: 1000,
      operatingHours: { days: { monday: { slots: [{ startTime: '10:00', endTime: '11:00' }] } } },
      photos: [], pricingRules: [],
    });
    await database.setTurfReviewStatus(turf.id, 'active');

    await database.setPlayerFavorite({ playerId: player.id, turfId: turf.id, isFavorite: true });
    await database.setPlayerFavorite({ playerId: player.id, turfId: turf.id, isFavorite: true });
    assert.deepEqual(await database.listPlayerFavorites(player.id), [turf.id], 'saving twice must not duplicate a favorite');

    const request = await database.requestTurfRemoval({ ownerId: owner.id, turfId: turf.id, reason: 'Test removal request' });
    assert.equal(request.status, 'pending');
    await assert.rejects(database.requestTurfRemoval({ ownerId: owner.id, turfId: turf.id, reason: 'Duplicate request' }), /active turf|already pending/i);
    assert.equal((await database.listPendingTurfRemovalRequests()).some((item) => item.id === request.id), true);
    await database.decideTurfRemovalRequest({ requestId: request.id, adminId: admin.id, decision: 'reject', reason: 'Keep this test turf active.' });
    assert.equal((await database.getTurf(turf.id)).status, 'active', 'rejection restores the previously active turf');

    const approvedRequest = await database.requestTurfRemoval({ ownerId: owner.id, turfId: turf.id, reason: 'Test permanent removal' });
    await database.decideTurfRemovalRequest({ requestId: approvedRequest.id, adminId: admin.id, decision: 'approve', reason: 'Approved in integration test.' });
    assert.equal((await database.getTurf(turf.id, { publicOnly: false })).status, 'inactive');
    assert.equal(await database.getTurf(turf.id), null, 'approved removal must hide the turf detail endpoint');
    assert.equal((await database.listPublicTurfs()).some((item) => item.id === turf.id), false, 'approved removal must keep the turf out of public search');
    await database.setPlayerFavorite({ playerId: player.id, turfId: turf.id, isFavorite: false });
    assert.deepEqual(await database.listPlayerFavorites(player.id), []);
  });

  test(`${providerName} keeps correction-requested turfs pending until the owner resubmits`, { timeout: 30_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const admin = await database.createAdminAccount({
      name: 'Turf Correction Integration Admin',
      email: `correction-admin-${suffix}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const owner = await database.createOwnerAccount({
      name: 'Turf Correction Integration Owner',
      email: `correction-owner-${suffix}@example.invalid`,
      phone: `+880${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
      businessName: 'Correction Integration Business',
      tradeLicenseNumber: `TEST-${suffix}`,
      businessDocuments: [{ document_type: 'trade_license', file_name: 'test.pdf', mime_type: 'application/pdf', storage_key: `${suffix}.pdf` }],
      payoutMethod: 'bkash',
      payoutDetails: { accountNumber: `01${suffix.replace(/-/g, '').slice(0, 10)}` },
      billingModel: 'commission',
    });
    await database.reviewOwnerAccount({ ownerId: owner.id, adminId: admin.id, approve: true });
    const turfInput = {
      name: 'Correction Integration Turf', description: 'Original description', address: 'Test address',
      area: 'Test area', city: 'Test city', latitude: 23.7, longitude: 90.4,
      sportTypes: ['football'], amenities: [], basePricePerHour: 1000,
      operatingHours: { days: { monday: { slots: [{ startTime: '10:00', endTime: '11:00' }] } } },
      photos: [], pricingRules: [],
    };
    const pendingTurf = await database.createTurf(owner.id, turfInput);
    await assert.rejects(
      database.requestTurfCorrections({ turfId: pendingTurf.id, adminId: admin.id, message: '  ' }),
      /between 1 and 2,000/
    );
    const requested = await database.requestTurfCorrections({
      turfId: pendingTurf.id, adminId: admin.id, message: 'Please correct the address and update the facility photos.',
    });
    assert.equal(requested.correction_message, 'Please correct the address and update the facility photos.');
    assert.equal((await database.getTurf(pendingTurf.id, { publicOnly: false })).status, 'pending_review');
    assert.equal(await database.getTurf(pendingTurf.id), null, 'a correction-requested turf must remain private');
    assert.equal(await database.updateOwnerTurf(crypto.randomUUID(), pendingTurf.id, turfInput), null, 'another account cannot edit the requested turf');

    const activeTurf = await database.createTurf(owner.id, { ...turfInput, name: 'Already Active Turf' });
    await database.setTurfReviewStatus(activeTurf.id, 'active');
    assert.equal(await database.requestTurfCorrections({ turfId: activeTurf.id, adminId: admin.id, message: 'Not eligible.' }), null);

    const resubmitted = await database.updateOwnerTurf(owner.id, pendingTurf.id, {
      ...turfInput, name: 'Corrected Integration Turf', description: 'Updated description',
    });
    assert.equal(resubmitted.status, 'pending_review', 'owner edits must not approve the turf');
    assert.equal(resubmitted.correction_message || null, null, 'owner resubmission clears the request');
    assert.equal((await database.getTurf(pendingTurf.id, { publicOnly: false })).name, 'Corrected Integration Turf');

    let correctionAuditActions;
    if (providerName === 'postgres') {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: testDatabaseUrl });
      await client.connect();
      try {
        const result = await client.query(
          `SELECT action FROM audit_logs WHERE entity_type='turf' AND entity_id=$1
           AND action IN ('turf_correction_requested','turf_corrections_resubmitted') ORDER BY created_at`,
          [pendingTurf.id]
        );
        correctionAuditActions = result.rows.map((row) => row.action);
      } finally { await client.end(); }
    } else {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(process.env.MONGODB_TEST_URI);
      await client.connect();
      try {
        const events = await client.db(testDatabase).collection('audit_logs').find({
          entity_type: 'turf', entity_id: pendingTurf.id,
          action: { $in: ['turf_correction_requested', 'turf_corrections_resubmitted'] },
        }).sort({ created_at: 1 }).toArray();
        correctionAuditActions = events.map((event) => event.action);
      } finally { await client.close(); }
    }
    assert.deepEqual(correctionAuditActions.sort(), ['turf_correction_requested', 'turf_corrections_resubmitted'].sort());
  });

  test(`${providerName} reserves manual bookings and scopes staff booking access`, { timeout: 60_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const admin = await database.createAdminAccount({
      name: 'Manual Booking Integration Admin',
      email: `manual-admin-${suffix}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const owner = await database.createOwnerAccount({
      name: 'Manual Booking Integration Owner',
      email: `manual-owner-${suffix}@example.invalid`,
      phone: `+880${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
      businessName: 'Manual Booking Integration Business',
      tradeLicenseNumber: `TEST-${suffix}`,
      businessDocuments: [{ document_type: 'trade_license', file_name: 'test.pdf', mime_type: 'application/pdf', storage_key: `${suffix}.pdf` }],
      payoutMethod: 'bkash',
      payoutDetails: { accountNumber: `01${suffix.replace(/-/g, '').slice(0, 10)}` },
      billingModel: 'commission',
    });
    await database.reviewOwnerAccount({ ownerId: owner.id, adminId: admin.id, approve: true });
    const date = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const schedule = { days: { [weekday]: { slots: [{ startTime: '10:00', endTime: '11:00' }] } } };
    const turfInput = {
      address: 'Test address', area: 'Test area', city: 'Test city', latitude: 23.7, longitude: 90.4,
      sportTypes: ['football'], amenities: [], basePricePerHour: 1000, operatingHours: schedule, photos: [], pricingRules: [],
    };
    const turfs = await Promise.all(['Assigned Staff Turf', 'Unassigned Turf'].map(async (name) => {
      const turf = await database.createTurf(owner.id, { ...turfInput, name });
      await database.setTurfReviewStatus(turf.id, 'active');
      return turf;
    }));
    const staffResult = await database.createStaffAccountAndAssignments({
      ownerId: owner.id,
      staff: { name: 'Scoped Integration Staff', email: `staff-${suffix}@example.invalid`, phone: '01234567890' },
      turfIds: [turfs[0].id],
      permissions: ['bookings.view'],
      passwordHash: 'test-only-not-a-login-hash',
    });
    const bookingInput = {
      actorId: owner.id, actorRole: 'turf_owner', turfId: turfs[0].id, date, startTime: '10:00', durationHours: 1,
      customerName: 'Offline Customer', customerPhone: '01700000000', paymentMethod: 'cash', paymentStatus: 'pending',
      idempotencyKey: `manual-booking-${suffix}`,
    };
    const booking = await database.createManualBooking(bookingInput);
    assert.equal(booking.booking_source, 'manual_owner');
    assert.equal(Number(booking.gateway_fee_amount), 0, 'manual bookings must never include a gateway fee');
    assert.equal(booking.has_gateway_fee, false);
    assert.equal(booking.status, 'confirmed');

    const foreignStaffBooking = await database.createManualBooking({
      ...bookingInput, turfId: turfs[1].id, idempotencyKey: `manual-booking-other-${suffix}`,
    });
    const scopedBookings = await database.listBookingsForStaff(staffResult.user.id);
    assert.deepEqual(scopedBookings.map((item) => item.id), [booking.id], 'staff see bookings only for assigned turfs');
    assert.equal(scopedBookings[0].customer_name || null, null, 'customer contact is hidden without its explicit permission');
    assert.equal(scopedBookings.some((item) => item.id === foreignStaffBooking.id), false);

    await assert.rejects(database.createManualBooking({
      ...bookingInput, actorId: staffResult.user.id, actorRole: 'staff',
      idempotencyKey: `manual-booking-staff-denied-${suffix}`,
    }), /permission to create manual bookings is required/);

    await database.updateOwnerTurf(owner.id, turfs[0].id, {
      ...turfInput,
      name: turfs[0].name,
      operatingHours: {
        ...schedule,
        dateRanges: [{ startDate: date, endDate: date, slots: [{ startTime: '11:00', endTime: '12:00' }] }],
      },
    });
    const updatedAvailability = await database.listAvailability(turfs[0].id, date);
    assert.deepEqual(updatedAvailability.map((slot) => [String(slot.start_time).slice(0, 5), slot.status]), [
      ['10:00', 'booked'], ['11:00', 'available'],
    ], 'changing a schedule preserves existing bookings while exposing the replacement availability');
    await assert.rejects(database.createManualBooking({
      ...bookingInput,
      idempotencyKey: `manual-booking-stale-schedule:${suffix}`,
    }), /saved availability schedule/i, 'manual bookings cannot use stale slots removed by a date-range override');
  });

  test(`${providerName} reserves, reviews, and settles owner withdrawals idempotently`, { timeout: 60_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const admin = await database.createAdminAccount({
      name: 'Withdrawal Integration Admin',
      email: `withdrawal-admin-${suffix}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const owner = await database.createOwnerAccount({
      name: 'Withdrawal Integration Owner',
      email: `withdrawal-owner-${suffix}@example.invalid`,
      phone: `+880${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
      businessName: 'Withdrawal Integration Business',
      tradeLicenseNumber: `TEST-${suffix}`,
      businessDocuments: [{ document_type: 'trade_license', file_name: 'test.pdf', mime_type: 'application/pdf', storage_key: `${suffix}.pdf` }],
      payoutMethod: 'bkash',
      payoutDetails: { accountNumber: `01${suffix.replace(/-/g, '').slice(0, 10)}` },
      billingModel: 'commission',
    });
    await database.reviewOwnerAccount({ ownerId: owner.id, adminId: admin.id, approve: true });
    await database.writeAdminSetting({ key: 'minimum_withdrawal_amount', value: 100, adminId: admin.id });
    if (providerName === 'postgres') {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: testDatabaseUrl });
      await client.connect();
      try {
        await client.query('UPDATE wallets SET available_balance=5000 WHERE owner_id=$1', [owner.id]);
      } finally { await client.end(); }
    } else {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(process.env.MONGODB_TEST_URI);
      await client.connect();
      try {
        await client.db(testDatabase).collection('wallets').updateOne(
          { owner_id: owner.id }, { $set: { available_balance: 5000 } }
        );
      } finally { await client.close(); }
    }

    const idempotencyKey = `withdrawal-first-${suffix}`;
    const first = await database.createWithdrawalRequest({ ownerId: owner.id, amount: 1000, idempotencyKey });
    const replay = await database.createWithdrawalRequest({ ownerId: owner.id, amount: 1000, idempotencyKey });
    assert.equal(replay.id, first.id, 'replaying the request must reuse the original withdrawal');
    await assert.rejects(
      database.createWithdrawalRequest({ ownerId: owner.id, amount: 5000, idempotencyKey: `withdrawal-overdraw-${suffix}` }),
      /Insufficient available wallet balance/
    );
    let wallet = await database.getOwnerWallet(owner.id);
    assert.equal(Number(wallet.wallet.available_balance), 4000, 'the pending withdrawal reserves available funds');
    const rejected = await database.decideWithdrawal({
      withdrawalId: first.id, adminId: admin.id, decision: 'reject', reason: 'Integration test rejection',
    });
    assert.equal(rejected.status, 'rejected');
    wallet = await database.getOwnerWallet(owner.id);
    assert.equal(Number(wallet.wallet.available_balance), 5000, 'rejection restores reserved funds');

    const second = await database.createWithdrawalRequest({
      ownerId: owner.id, amount: 1000, idempotencyKey: `withdrawal-approved-${suffix}`,
    });
    const approved = await database.decideWithdrawal({
      withdrawalId: second.id, adminId: admin.id, decision: 'approve', reference: 'test-approval',
    });
    assert.equal(approved.status, 'approved');
    const paid = await database.decideWithdrawal({
      withdrawalId: second.id, adminId: admin.id, decision: 'paid', reference: 'test-transfer-reference',
    });
    assert.equal(paid.status, 'paid');
    wallet = await database.getOwnerWallet(owner.id);
    assert.equal(Number(wallet.wallet.available_balance), 4000);
    assert.equal(Number(wallet.wallet.total_withdrawn), 1000);
  });

  test(`${providerName} allows one concurrent booking and applies payment confirmation once`, { timeout: 60_000 }, async () => {
    await database.connectDatabase();
    const suffix = crypto.randomUUID();
    const admin = await database.createAdminAccount({
      name: 'Booking Integration Admin',
      email: `booking-admin-${suffix}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const owner = await database.createOwnerAccount({
      name: 'Booking Integration Owner',
      email: `booking-owner-${suffix}@example.invalid`,
      phone: `+880${suffix.replace(/-/g, '').slice(0, 10)}`,
      passwordHash: 'test-only-not-a-login-hash',
      businessName: 'Booking Integration Turf',
      tradeLicenseNumber: `TEST-${suffix}`,
      businessDocuments: [{ document_type: 'trade_license', file_name: 'test.pdf', mime_type: 'application/pdf', storage_key: `${suffix}.pdf` }],
      payoutMethod: 'bkash',
      payoutDetails: { accountNumber: `01${suffix.replace(/-/g, '').slice(0, 10)}` },
      billingModel: 'commission',
    });
    await database.reviewOwnerAccount({ ownerId: owner.id, adminId: admin.id, approve: true });

    const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const schedule = { days: { [day]: { slots: [{ startTime: '10:00', endTime: '11:00' }] } } };
    const turfInput = {
      name: 'Booking Integration Turf', address: 'Test address', area: 'Test area', city: 'Test city',
      latitude: 23.7, longitude: 90.4, sportTypes: ['football'], amenities: [], basePricePerHour: 1000,
      operatingHours: schedule,
      photos: [], pricingRules: [],
    };
    const turf = await database.createTurf(owner.id, turfInput);
    await database.setTurfReviewStatus(turf.id, 'active');
    const players = await Promise.all([1, 2].map((index) => database.createPlayerAccount({
      name: `Booking Integration Player ${index}`,
      email: `booking-player-${index}-${suffix}@example.invalid`,
      phone: `+881${suffix.replace(/-/g, '').slice(0, 9)}${index}`,
      passwordHash: 'test-only-not-a-login-hash',
    })));

    const attempts = await Promise.allSettled(players.map((player, index) => database.createBookingHold({
      playerId: player.id,
      turfId: turf.id,
      date,
      startTime: '10:00',
      durationHours: 1,
      idempotencyKey: `booking-race:${suffix}:${index}`,
    })));
    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const losers = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(winners.length, 1, `only one concurrent request may hold the slot; failures: ${attempts.filter((attempt) => attempt.status === 'rejected').map((attempt) => attempt.reason.message).join('; ')}`);
    assert.equal(losers.length, 1);
    assert.match(losers[0].reason.message, /availability|booked|slot/i);

    const booking = winners[0].value;
    assert.deepEqual(await database.listBookingsForOwner(owner.id), [], 'pending-payment holds are not shown in owner bookings');
    assert.deepEqual(await database.listBookingsForOwner(owner.id, { status: 'pending_payment' }), [], 'pending-payment holds stay hidden when explicitly filtered');
    assert.equal(await database.getBookingForUser(booking.id, { id: owner.id, role: 'turf_owner' }), null, 'owners cannot load pending-payment booking details directly');
    assert.equal((await database.getBookingForUser(booking.id, { id: players[0].id, role: 'player' }))?.status, 'pending_payment', 'players retain access to their own pending payment');
    assert.equal((await database.ownerRevenueReport(owner.id, { from: date, to: date })).summary.booking_count, 0, 'pending-payment holds are excluded from owner booking reports');
    const staff = await database.createStaffAccountAndAssignments({
      ownerId: owner.id,
      staff: { name: 'Pending Booking Staff', email: `pending-staff-${suffix}@example.invalid`, phone: '01234567890' },
      turfIds: [turf.id],
      permissions: ['bookings.view'],
      passwordHash: 'test-only-not-a-login-hash',
    });
    assert.deepEqual(await database.listBookingsForStaff(staff.user.id), [], 'pending-payment holds are not shown in assigned staff bookings');
    assert.equal(await database.getBookingForUser(booking.id, { id: staff.user.id, role: 'staff' }), null, 'staff cannot load pending-payment booking details directly');
    const payment = {
      transactionId: booking.booking_number,
      amount: Number(booking.total_payable),
      currency: 'BDT',
      validationId: `validation-${suffix}`,
      gatewayResponse: { status: 'VALID', tran_id: booking.booking_number },
    };
    await database.confirmBookingPayment(payment);
    await database.confirmBookingPayment(payment);
    assert.equal((await database.listBookingsForOwner(owner.id)).some((item) => item.id === booking.id), true, 'paid bookings appear in owner bookings');
    assert.equal((await database.listBookingsForStaff(staff.user.id)).some((item) => item.id === booking.id), true, 'paid bookings appear in assigned staff bookings');
    assert.equal((await database.ownerRevenueReport(owner.id, { from: date, to: date })).summary.booking_count, 1, 'confirmed bookings count in owner reports');
    const wallet = await database.getOwnerWallet(owner.id);
    assert.equal(wallet.transactions.filter((item) => item.idempotency_key === `booking-credit:${booking.id}`).length, 1);
    assert.equal(wallet.transactions.filter((item) => item.idempotency_key === `booking-hold:${booking.id}`).length, 1);
    assert.equal(Number(wallet.wallet.held_balance), Number(booking.net_owner_amount));

    const cancellation = await database.cancelBookingAndQueueRefund({
      bookingId: booking.id, actorId: owner.id, actorRole: 'turf_owner',
      reason: 'Integration test owner cancellation', ownerInitiated: true,
    });
    assert.equal(cancellation.status, 'cancelled');
    assert.equal(cancellation.refundAmount, Number(booking.total_payable) - Number(booking.gateway_fee_amount));
    const afterCancellation = await database.getOwnerWallet(owner.id);
    assert.equal(Number(afterCancellation.wallet.held_balance), 0);
    assert.equal(afterCancellation.transactions.filter((item) => item.idempotency_key === `booking-refund-debit:${booking.id}`).length, 1);

    const replacement = await database.createBookingHold({
      playerId: players[0].id, turfId: turf.id, date, startTime: '10:00', durationHours: 1,
      idempotencyKey: `booking-reuse:${suffix}`,
    });
    assert.equal(replacement.status, 'pending_payment', 'a cancelled slot must be bookable again');
    assert.equal(await database.releasePendingBookingHold({ bookingId: replacement.id, playerId: players[0].id }), true);
    const rebooked = await database.createBookingHold({
      playerId: players[0].id, turfId: turf.id, date, startTime: '10:00', durationHours: 1,
      idempotencyKey: `booking-reuse-expired:${suffix}`,
    });
    assert.equal(rebooked.status, 'pending_payment', 'an expired hold must not retain the slot association');
    await database.releasePendingBookingHold({ bookingId: rebooked.id, playerId: players[0].id });

    await database.updateOwnerTurf(owner.id, turf.id, {
      ...turfInput,
      operatingHours: {
        ...schedule,
        dateRanges: [{ startDate: date, endDate: date, slots: [{ startTime: '11:00', endTime: '12:00' }] }],
      },
    });
    const dateRangeAvailability = await database.listAvailability(turf.id, date);
    assert.deepEqual(dateRangeAvailability.map((slot) => String(slot.start_time).slice(0, 5)), ['11:00'], 'date-range schedules replace weekly availability only for covered dates');
    const weeklyFallbackDate = new Date(`${date}T00:00:00Z`);
    weeklyFallbackDate.setUTCDate(weeklyFallbackDate.getUTCDate() + 7);
    const weeklyFallback = await database.listAvailability(turf.id, weeklyFallbackDate.toISOString().slice(0, 10));
    assert.deepEqual(weeklyFallback.map((slot) => String(slot.start_time).slice(0, 5)), ['10:00'], 'weekly availability remains active outside configured date ranges');
    await assert.rejects(database.createBookingHold({
      playerId: players[0].id, turfId: turf.id, date, startTime: '10:00', durationHours: 1,
      idempotencyKey: `booking-stale-schedule:${suffix}`,
    }), /saved availability schedule/i, 'removed availability cannot be booked through a stale slot record');
    const dateRangeBooking = await database.createBookingHold({
      playerId: players[0].id, turfId: turf.id, date, startTime: '11:00', durationHours: 1,
      idempotencyKey: `booking-date-range:${suffix}`,
    });
    assert.equal(dateRangeBooking.status, 'pending_payment');
    await database.releasePendingBookingHold({ bookingId: dateRangeBooking.id, playerId: players[0].id });
  });

  test(`${providerName} encrypts SMTP passwords and preserves admin configuration`, {
    timeout: 30_000,
    skip: !process.env.SMTP_CONFIG_ENCRYPTION_KEY ? 'Set SMTP_CONFIG_ENCRYPTION_KEY to test encrypted SMTP persistence.' : false,
  }, async () => {
    await database.connectDatabase();
    const adminId = await database.createAdminAccount({
      name: 'SMTP Integration Admin',
      email: `smtp-integration-${crypto.randomUUID()}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const password = `smtp-test-${crypto.randomUUID()}`;
    const saved = await database.saveSmtpConfigs({
      adminId,
      configs: [{
        id: 'smtp-integration', label: 'SMTP integration', host: 'smtp.example.invalid', port: 2525,
        secure: false, username: 'smtp-test-user', password, fromName: 'Test',
        fromEmail: 'noreply@example.invalid', isActive: true,
      }],
    });
    assert.equal(saved[0].password, '');
    assert.equal(saved[0].passwordSet, true);
    assert.equal((await database.listSmtpConfigs())[0].password, password);
    const settings = await database.readAdminSettings();
    const stored = settings.smtp_configs[0].password_encrypted;
    assert.equal(stored.__encrypted, 'aes-256-gcm:v1');
    assert.equal(JSON.stringify(settings).includes(password), false, 'stored SMTP settings must not contain plaintext password');
    assert.equal(stored.ciphertext.includes(Buffer.from(password).toString('base64')), false);
  });

  test(`${providerName} persists player notifications and makes event creation idempotent`, { timeout: 30_000 }, async () => {
    await database.connectDatabase();
    const userId = await database.createAdminAccount({
      name: 'Notification Integration Admin',
      email: `notification-${crypto.randomUUID()}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const details = {
      userId, type: 'booking', title: 'Booking confirmed', message: 'Your booking is confirmed.',
      data: { bookingId: 'test-booking', eventKey: `booking-confirmed:${crypto.randomUUID()}` },
    };
    const created = await database.createUserNotification(details);
    const replay = await database.createUserNotification(details);
    assert.equal(replay.id, created.id, 'replayed event should return the original notification');
    const listed = await database.listUserNotifications(userId);
    assert.equal(listed.length, 1);
    const otherUserId = crypto.randomUUID();
    assert.equal(await database.markUserNotificationRead({ userId: otherUserId, notificationId: created.id }), false);
    assert.equal(await database.markUserNotificationRead({ userId, notificationId: created.id }), true);
    assert.ok((await database.listUserNotifications(userId))[0].read_at);
  });

  test(`${providerName} persists encrypted push subscriptions scoped to their owner`, {
    timeout: 30_000,
    skip: !process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY ? 'Set PUSH_SUBSCRIPTION_ENCRYPTION_KEY to test encrypted push subscriptions.' : false,
  }, async () => {
    await database.connectDatabase();
    const userId = await database.createAdminAccount({
      name: 'Push Integration User',
      email: `push-integration-${crypto.randomUUID()}@example.invalid`,
      passwordHash: 'test-only-not-a-login-hash',
    });
    const subscription = {
      endpoint: `https://push.example.invalid/subscription/${crypto.randomUUID()}`,
      keys: { p256dh: 'test-public-key', auth: 'test-auth-secret' },
    };
    const saved = await database.savePushSubscription({ userId, subscription });
    assert.match(saved.endpointHash, /^[a-f\d]{64}$/);
    const owned = await database.listUserPushSubscriptions(userId);
    assert.deepEqual(owned, [{ endpointHash: saved.endpointHash, subscription }]);
    const otherUserId = crypto.randomUUID();
    assert.deepEqual(await database.listUserPushSubscriptions(otherUserId), []);
    assert.equal(await database.deleteUserPushSubscription({ userId: otherUserId, endpointHash: saved.endpointHash }), false);
    assert.equal(await database.deleteUserPushSubscription({ userId, endpointHash: saved.endpointHash }), true);
    assert.deepEqual(await database.listUserPushSubscriptions(userId), []);
  });
}
