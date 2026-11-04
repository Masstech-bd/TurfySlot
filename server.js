import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import multer from 'multer';
import { normalizePublicApiBaseUrl } from './server/publicApiBaseUrl.js';
import {
  closeDatabase,
  connectDatabase,
  createOwnerAccount,
  createPlayerAccount,
  updateUnverifiedPlayerEmail,
  dbProvider,
  findUserByEmail,
  findUserById,
  updateUserAvatar,
  createAuthCode,
  consumeAuthCode,
  invalidateAuthCodes,
  createUserNotification,
  listUserNotifications,
  markUserNotificationRead,
  listPlayerFavorites,
  setPlayerFavorite,
  savePushSubscription,
  listUserPushSubscriptions,
  deleteUserPushSubscription,
  findOwnerProfile,
  updateOwnerPayoutDetails,
  listPublicTurfs,
  getTurf,
  createReview,
  listTurfReviews,
  listOwnerTurfs,
  listTournaments,
  createOpenMatchForBooking,
  listOpenMatches,
  listOpenMatchParticipants,
  listTournamentChildren,
  createTournament,
  updateTournament,
  registerTournamentTeam,
  searchTournamentPlayers,
  respondTournamentInvitation,
  withdrawTournamentTeam,
  decideTournamentReview,
  resubmitTournament,
  createTurf,
  requestTurfRemoval,
  listPendingTurfRemovalRequests,
  decideTurfRemovalRequest,
  updateOwnerTurf,
  listOwnerTurfAddons,
  createOwnerTurfAddon,
  updateOwnerTurfAddon,
  deleteOwnerTurfAddon,
  listAvailability,
  setSlotBlocked,
  listPendingTurfs,
  setTurfReviewStatus,
  requestTurfCorrections,
  listPendingOwners,
  findOwnerDocument,
  reviewOwnerAccount,
  requestOwnerCorrections,
  updatePendingOwnerVerification,
  createBookingHold,
  releasePendingBookingHold,
  getBookingForPayment,
  getPaymentForGatewayCallback,
  claimPaymentGatewayForCheckout,
  getBookingForUser,
  savePaymentSession,
  confirmBookingPayment,
  expirePendingBookingHolds,
  getOwnerWallet,
  createWithdrawalRequest,
  listPendingWithdrawals,
  decideWithdrawal,
  readAdminSettings,
  writeAdminSetting,
  listSubscriptionOwners,
  recordOwnerSubscriptionPayment,
  processOwnerSubscriptionCycle,
  scheduleOwnerBillingModelChange,
  getSslcommerzConfig,
  getPaymentGatewayConfig,
  saveSslcommerzConfig,
  listSafePaymentGatewayConfigs,
  savePaymentGatewayConfig,
  listSmtpConfigs,
  saveSmtpConfigs,
  listFeatureFlags,
  setFeatureFlag,
  adminRevenueReport,
  ownerRevenueReport,
  listOwnerCommissionSettings,
  setOwnerCommissionOverride,
  createDispute,
  listAdminDisputes,
  resolveDispute,
  listUsersForAdmin,
  changeUserStatus,
  listBookingsForStaff,
  updateStaffBookingStatus,
  updateOwnerBookingStatus,
  createStaffAccountAndAssignments,
  listOwnerStaff,
  listStaffAssignmentsForUser,
  revokeOwnerStaffAccess,
  deleteUnassignedStaffUser,
  createManualBooking,
  listBookingsForOwner,
  listBookingsForAdmin,
  listBookingsForPlayer,
  listCancellationPolicies,
  saveCancellationPolicy,
  assignCancellationPolicy,
  deleteCancellationPolicy,
  resolveCancellationRefundPercentage,
  cancelBookingAndQueueRefund,
  createPlayerCancellationRequest,
  recordCancellationRequestDecision,
  listExpiredCancellationRequests,
  listPendingRefunds,
  markRefundProcessed,
  claimRefundForGateway,
  saveGatewayRefundResponse,
  completeGatewayRefund,
  releaseMaturedWalletHolds,
  completeEndedBookings,
  wipeApplicationDataPreservingAdmins,
  pingDatabase,
  rotateTokenVersion,
  migrateSensitivePayoutDetails,
} from './database/provider.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = new URL(process.env.CLIENT_URL || 'http://localhost:3000').origin;
if (process.env.NODE_ENV === 'production' && !CLIENT_URL.startsWith('https://')) throw new Error('CLIENT_URL must use HTTPS in production.');
const checkoutReturnPage = (title, message) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Turfyslot</title><style>body{margin:0;background:#07130c;color:#f8fafc;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:440px;margin:24px;padding:32px;border:1px solid #ffffff22;border-radius:20px;background:#0a1e14}h1{font-size:22px}p{color:#cbd5d1;line-height:1.6}button{margin-top:16px;padding:12px 18px;border:0;border-radius:10px;background:#c8ff5e;color:#0a1e14;font-weight:700;cursor:pointer}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p><p>Return to your Turfyslot booking tab to check the confirmed status.</p><button onclick="window.close()">Close this checkout tab</button></main></body></html>`;
const privateDocumentDirectory = path.resolve(process.env.PRIVATE_UPLOADS_DIR || 'uploads/private/business-verification');
fs.mkdirSync(privateDocumentDirectory, { recursive: true });
const publicUploadDirectory = path.resolve(process.env.PUBLIC_UPLOADS_DIR || 'uploads/public');
const turfPhotoDirectory = path.join(publicUploadDirectory, 'turf-photos');
const profileImageDirectory = path.join(publicUploadDirectory, 'profile-images');
fs.mkdirSync(turfPhotoDirectory, { recursive: true });
fs.mkdirSync(profileImageDirectory, { recursive: true });
const publicImageExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const publicImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => callback(null, req.params.turfId ? turfPhotoDirectory : profileImageDirectory),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${publicImageExtensions[file.mimetype] || '.img'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const accepted = Object.hasOwn(publicImageExtensions, file.mimetype);
    callback(accepted ? null : new Error('Only JPEG, PNG, and WEBP images are accepted.'), accepted);
  },
});
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in the environment.');
}
if (process.env.NODE_ENV === 'production' && (JWT_ACCESS_SECRET.length < 32 || JWT_REFRESH_SECRET.length < 32 || JWT_ACCESS_SECRET === JWT_REFRESH_SECRET)) {
  throw new Error('Production JWT secrets must be different values of at least 32 characters.');
}
const redisUrl = process.env.REDIS_URL;
if (process.env.NODE_ENV === 'production' && !redisUrl) throw new Error('REDIS_URL must be configured in production.');
const rateLimitRedis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true }) : null;
const redisRateStore = () => rateLimitRedis ? new RedisStore({
  prefix: 'rl:',
  sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args),
}) : undefined;
let featureFlagsMemoryCache = { value: null, expiresAt: 0 };
const featureFlagsCacheKey = 'platform:feature-flags';
const getCachedFeatureFlags = async () => {
  if (rateLimitRedis?.status === 'ready') {
    const cached = await rateLimitRedis.get(featureFlagsCacheKey);
    if (cached) return JSON.parse(cached);
  }
  if (featureFlagsMemoryCache.value && featureFlagsMemoryCache.expiresAt > Date.now()) return featureFlagsMemoryCache.value;
  const flags = await listFeatureFlags();
  featureFlagsMemoryCache = { value: flags, expiresAt: Date.now() + 60_000 };
  if (rateLimitRedis?.status === 'ready') await rateLimitRedis.set(featureFlagsCacheKey, JSON.stringify(flags), 'EX', 60);
  return flags;
};
const invalidateFeatureFlagsCache = async () => {
  featureFlagsMemoryCache = { value: null, expiresAt: 0 };
  if (rateLimitRedis?.status === 'ready') await rateLimitRedis.del(featureFlagsCacheKey);
};
const requireFeatureFlag = (key) => async (_req, res, next) => {
  try {
    const flags = await getCachedFeatureFlags();
    if (!flags[key]) {
      const ownerFacing = ['turf_owner', 'staff'].includes(_req.user?.role);
      return res.status(ownerFacing ? 403 : 404).json({
        success: false,
        code: 'feature_disabled',
        message: 'This feature is not currently available.',
      });
    }
    next();
  } catch (error) { next(error); }
};
const requireAddonsEnabled = async (_req, res, next) => {
  try {
    const flags = await getCachedFeatureFlags();
    if (!flags.addons_enabled) return res.status(404).json({ success: false, code: 'feature_disabled', message: 'Booking add-ons are not currently enabled.' });
    next();
  } catch (error) { next(error); }
};
const requireTournamentsEnabled = requireFeatureFlag('tournament_enabled');
const requireSquadsEnabled = requireFeatureFlag('squad_enabled');
const bookingExpiryQueue = redisUrl ? new Queue('booking-expiry', {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
}) : null;
const bookingReminderQueue = redisUrl ? new Queue('booking-reminders', {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
}) : null;
const notificationEmailQueue = redisUrl ? new Queue('email-notifications', {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
}) : null;
const pushNotificationQueue = redisUrl ? new Queue('push-notifications', {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
}) : null;
const notificationSmsQueue = redisUrl && process.env.SMS_API_KEY && process.env.SMS_SENDER_ID
  ? new Queue('sms-notifications', { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) })
  : null;
let bookingExpiryWorker;
let bookingReminderWorker;
let notificationEmailWorker;
let pushNotificationWorker;
let notificationSmsWorker;

const normalizeTurf = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  ownerName: row.owner_name || '',
  ownerBillingModel: row.owner_billing_model || row.billing_model || 'commission',
  name: row.name,
  description: row.description || '',
  address: row.address || '',
  area: row.area || '',
  city: row.city || '',
  latitude: Number(row.latitude || 0),
  longitude: Number(row.longitude || 0),
  sportTypes: Array.isArray(row.sport_types) ? row.sport_types : [],
  amenities: Array.isArray(row.amenities) ? row.amenities : [],
  basePricePerHour: Number(row.base_price_per_hour || 0),
  pricingRules: Array.isArray(row.pricing_rules) ? row.pricing_rules : [],
  operatingHours: row.operating_hours || { openTime: '07:00', closeTime: '23:00' },
  photos: Array.isArray(row.photos)
    ? row.photos.map((photo) => (typeof photo === 'string' ? photo : photo.url)).filter(Boolean)
    : [],
  status: row.status || 'active',
  correctionMessage: row.correction_message || '',
  rating: Number(row.rating || 0),
  reviewCount: Number(row.review_count || 0),
  createdAt: row.created_at || new Date().toISOString(),
  cancellationPolicyId: row.cancellation_policy_id || undefined,
  effectiveCancellationPolicy: row.effective_cancellation_policy ? {
    id: String(row.effective_cancellation_policy.id),
    name: String(row.effective_cancellation_policy.name || ''),
    isDefault: Boolean(row.effective_cancellation_policy.isDefault ?? row.effective_cancellation_policy.is_default),
    tiers: (row.effective_cancellation_policy.tiers || []).map((tier) => ({
      id: String(tier.id), minHoursBefore: Number(tier.minHoursBefore ?? tier.hours_before_start_min),
      maxHoursBefore: (tier.maxHoursBefore ?? tier.hours_before_start_max) == null ? undefined : Number(tier.maxHoursBefore ?? tier.hours_before_start_max),
      refundPercentage: Number(tier.refundPercentage ?? tier.refund_percentage), description: '',
    })),
  } : undefined,
});

const normalizeTurfAddon = (row) => ({
  id: row.id, turfId: row.turf_id, name: row.name, description: row.description || '', category: row.category,
  price: Number(row.price), stockQuantity: row.stock_quantity == null ? null : Number(row.stock_quantity),
  isActive: Boolean(row.is_active), displayOrder: Number(row.display_order || 0),
});

const parseTurfAddonInput = (body) => {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || '');
  const price = Number(body.price);
  const stockQuantity = body.stockQuantity == null || body.stockQuantity === '' ? null : Number(body.stockQuantity);
  const displayOrder = Number(body.displayOrder ?? 0);
  if (!name || name.length > 100) return { error: 'Add-on name is required and must be 100 characters or fewer.' };
  if (!['equipment', 'service', 'food', 'other'].includes(category)) return { error: 'Choose a valid add-on category.' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Add-on price must be zero or greater.' };
  if (stockQuantity !== null && (!Number.isInteger(stockQuantity) || stockQuantity < 0)) return { error: 'Stock quantity must be a whole number of zero or greater.' };
  if (!Number.isInteger(displayOrder) || displayOrder < 0) return { error: 'Display order must be a whole number of zero or greater.' };
  return { value: { name, description, category, price, stockQuantity, isActive: body.isActive !== false, displayOrder } };
};

const sanitizeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  status: row.status,
  emailVerified: Boolean(row.email_verified_at),
  avatar: row.avatar,
  createdAt: row.created_at,
});

const createAuthTokens = (user) => ({
  accessToken: jwt.sign(
    { sub: user.id, role: user.role, email: user.email, status: user.status, ver: Number(user.token_version || 0) },
    JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  ),
  refreshToken: jwt.sign(
    { sub: user.id, tokenType: 'refresh', ver: Number(user.token_version || 0) },
    JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  ),
});

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing bearer token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = await findUserById(decoded.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      return res.status(403).json({ success: false, message: 'Account is not active.' });
    }
    if (Number(user.token_version || 0) !== Number(decoded.ver || 0)) {
      return res.status(401).json({ success: false, message: 'Session has been revoked.' });
    }

    req.user = sanitizeUser(user);
    next();
  } catch (error) {
    console.error('Access token validation failed:', error.name);
    return res.status(401).json({ success: false, message: 'Invalid or expired access token.' });
  }
};

const validateRegistrationBody = (body, type) => {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phoneInput = String(input.phone || '').trim();
  const phoneDigits = phoneInput.replace(/\D/g, '');
  const localPhone = phoneDigits.startsWith('880') ? `0${phoneDigits.slice(3)}` : phoneDigits;
  const phone = /^01[3-9]\d{8}$/.test(localPhone) ? `+88${localPhone}` : '';
  const password = String(input.password || '');

  if (!name || !email || !phone || !password) return { valid: false, message: 'Name, email, phone and password are required.' };
  if (name.length > 150 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 255 || !phone) return { valid: false, message: 'Provide a valid name, email, and Bangladesh mobile number (01XXXXXXXXX or +8801XXXXXXXXX).' };
  if (password.length < 8 || password.length > 200) return { valid: false, message: 'Password must be between 8 and 200 characters.' };
  if (type === 'turf_owner' && (!String(input.businessName || '').trim() || String(input.businessName).trim().length > 200)) return { valid: false, message: 'A valid business name is required for turf owners.' };
  return { valid: true, data: { name, email, phone, password } };
};

const requireVerifiedEmail = (req, res, next) => {
  if (!req.user?.emailVerified) return res.status(403).json({ success: false, code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email before booking.' });
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to perform this action.' });
  }
  next();
};

const requireApprovedOwner = async (req, res, next) => {
  try {
    const profile = await findOwnerProfile(req.user.id);
    if (req.user.role !== 'turf_owner' || req.user.status !== 'active' || profile?.approval_status !== 'active') {
      return res.status(403).json({ success: false, message: 'Owner account approval is required.' });
    }
    req.ownerProfile = profile;
    next();
  } catch (error) {
    console.error('Owner approval check failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to verify owner access.' });
  }
};

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 100 })); // SSLCommerz callbacks post as form-encoded
app.use((req, _res, next) => { if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {}; next(); });
app.use(helmet({ contentSecurityPolicy: false }));
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const playerRegistrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:player-register:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
  message: { success: false, message: 'Too many player signup attempts. Try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:auth-other:v2:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});
const emailVerificationCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:email-verify-code:v1:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
  message: { success: false, message: 'Too many code attempts. Please wait and request a new verification code.' },
});
// Login has its own limits so registration, refresh, verification, or reset
// traffic cannot consume the login allowance. Enforce both per-IP and
// per-account limits; hash the submitted email before using it as a store key.
const loginIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:login-ip:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
  message: { success: false, message: 'Too many login attempts. Try again later.' },
});
const loginAccountLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => crypto.createHash('sha256').update(String(req.body?.email || '').trim().toLowerCase()).digest('hex'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:login-account:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
  message: { success: false, message: 'Too many login attempts for this account. Try again later.' },
});

const setRefreshCookie = (res, token) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `refresh_token=${token}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000${secure}`);
};

const clearRefreshCookie = (res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `refresh_token=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0${secure}`);
};

const refreshCookieFromRequest = (req) => {
  const cookieHeader = req.headers.cookie || '';
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('refresh_token='));
  return entry ? entry.slice('refresh_token='.length) : '';
};

const respondWithTokens = (res, user, message, status = 200) => {
  const tokens = createAuthTokens(user);
  setRefreshCookie(res, tokens.refreshToken);
  return res.status(status).json({
    success: true,
    message,
    data: { user: sanitizeUser(user), accessToken: tokens.accessToken },
  });
};
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(redisRateStore() ? { store: redisRateStore() } : {}),
  message: { success: false, message: 'Too many payment requests. Try again shortly.' },
});
const paymentCallbackLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(rateLimitRedis ? { store: new RedisStore({ prefix: 'rl:payment-callback:', sendCommand: (command, ...args) => rateLimitRedis.call(command, ...args) }) } : {}),
});
const ownerDocumentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, privateDocumentDirectory),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    callback(allowed.includes(file.mimetype) ? null : new Error('Only PDF, JPG, PNG, and WEBP files are accepted.'), allowed.includes(file.mimetype));
  },
}).fields([
  { name: 'tradeLicense', maxCount: 1 },
  { name: 'supportingDocuments', maxCount: 5 },
]);

const parseOwnerDocumentUpload = (req, res, next) => {
  ownerDocumentUpload(req, res, async (error) => {
    if (!error) return next();
    const uploaded = Object.values(req.files || {}).flat();
    await Promise.all(uploaded.map((file) => fs.promises.rm(file.path, { force: true })));
    res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Each document must be 10 MB or smaller.' : error.message });
  });
};

const parsePublicImageUpload = (uploadHandler) => (req, res, next) => {
  uploadHandler(req, res, async (error) => {
    if (!error) return next();
    const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
    await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Each image must be 10 MB or smaller.'
      : error.code === 'LIMIT_FILE_COUNT'
      ? 'You can upload up to five images at a time.'
      : error.message;
    res.status(400).json({ success: false, message });
  });
};

const verifyPublicImageSignature = async (file) => {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const bytes = Buffer.alloc(12);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const prefix = bytes.subarray(0, bytesRead);
    if (file.mimetype === 'image/jpeg') return prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
    if (file.mimetype === 'image/png') return prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (file.mimetype === 'image/webp') return prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP';
    return false;
  } finally {
    await handle.close();
  }
};

const publicImageUrl = (req, subdirectory, filename) => {
  const apiOrigin = (process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${apiOrigin}/uploads/${subdirectory}/${encodeURIComponent(filename)}`;
};

const verifyDocumentSignature = async (file) => {
  const handle = await fs.promises.open(file.path, 'r');
  try {
    const bytes = Buffer.alloc(12);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const prefix = bytes.subarray(0, bytesRead);
    if (file.mimetype === 'application/pdf') return prefix.subarray(0, 5).toString() === '%PDF-';
    if (file.mimetype === 'image/jpeg') return prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
    if (file.mimetype === 'image/png') return prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (file.mimetype === 'image/webp') return prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP';
    return false;
  } finally {
    await handle.close();
  }
};

app.use((req, res, next) => {
  const allowedOrigin = CLIENT_URL;
  const requestOrigin = req.headers.origin;
  if (requestOrigin === allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/uploads', express.static(publicUploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The Vite frontend (localhost:3000) displays public uploads from the
    // API origin (localhost:5000); Helmet's default same-origin policy blocks them.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await pingDatabase();
    res.json({
      success: true,
      message: 'Server healthy',
      db: true,
      provider: dbProvider,
    });
  } catch (error) {
    console.error('Health check database failure:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
    });
  }
});

app.get('/api/test-db', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pingDatabase();
    res.json({
      success: true,
      message: `Connected to ${dbProvider} successfully`,
      data: result,
    });
  } catch (error) {
    console.error('Database diagnostic failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to connect to the configured database provider.',
    });
  }
});

app.post('/api/admin/database-kill-switch', requireAuth, requireRole('admin'), async (req, res) => {
  if (req.body?.confirmation !== 'WIPE DATABASE') {
    return res.status(400).json({ success: false, message: 'Type WIPE DATABASE to confirm this action.' });
  }
  try {
    const result = await wipeApplicationDataPreservingAdmins();
    res.json({ success: true, message: 'Application database data was deleted. Admin accounts, schema metadata, payment gateway configuration, gateway fee configuration, and SMTP configuration were preserved.', data: result });
  } catch (error) {
    console.error('Admin database kill switch failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to wipe application data. No changes were committed.' });
  }
});

app.post('/api/auth/register/player', playerRegistrationLimiter, async (req, res) => {
  const validation = validateRegistrationBody(req.body, 'player');

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  const { name, email, phone, password } = validation.data;

  try {
    if (await findUserByEmail(email)) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createPlayerAccount({ name, email, phone, passwordHash });
    await issueAuthCodeForUser(user, 'email_verification').catch(() => false);

    respondWithTokens(res, user, 'Player registration successful.', 201);
  } catch (error) {
    console.error('Player registration failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to register player.' });
  }
});

app.post('/api/auth/register/turf-owner', authLimiter, parseOwnerDocumentUpload, async (req, res) => {
  const validation = validateRegistrationBody(req.body, 'turf_owner');

  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.message });
  }

  const { name, email, phone, password } = validation.data;
  const businessName = String(req.body.businessName || '').trim();
  const tradeLicenseNumber = String(req.body.tradeLicenseNumber || '').trim();
  const payoutMethod = String(req.body.payoutMethod || 'bkash');
  const billingModel = String(req.body.billingModel || '');
  const accountNumber = String(req.body.accountNumber || '').trim();
  const tradeLicenseFile = req.files?.tradeLicense?.[0];
  const supportingFiles = req.files?.supportingDocuments || [];
  const uploadedFiles = [tradeLicenseFile, ...supportingFiles].filter(Boolean);
  if (!tradeLicenseNumber || !tradeLicenseFile) {
    await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: 'Trade license number and trade license document are required.' });
  }
  if (!['bkash', 'nagad', 'rocket', 'bank_account'].includes(payoutMethod)) {
    await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: 'Invalid payout method.' });
  }
  if (!['commission', 'monthly_subscription'].includes(billingModel)) {
    await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: 'Choose a valid owner billing model.' });
  }
  if (tradeLicenseNumber.length > 100 || accountNumber.length > 100 || String(req.body.bankName || '').length > 120 || String(req.body.branchName || '').length > 120) {
    await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: 'Trade license or payout details exceed the allowed length.' });
  }

  try {
    for (const file of uploadedFiles) {
      if (!(await verifyDocumentSignature(file))) {
        await Promise.all(uploadedFiles.map((item) => fs.promises.rm(item.path, { force: true })));
        return res.status(400).json({ success: false, message: 'A submitted file does not match its declared document type.' });
      }
    }
    if (await findUserByEmail(email)) {
      await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const businessDocuments = uploadedFiles.map((file, index) => ({
      id: crypto.randomUUID(),
      document_type: index === 0 ? 'trade_license' : 'supporting_business_document',
      file_name: path.basename(file.originalname).slice(0, 180),
      mime_type: file.mimetype,
      storage_key: path.basename(file.filename),
    }));
    const passwordHash = await bcrypt.hash(password, 12);
    if (billingModel === 'monthly_subscription' && Number((await readAdminSettings()).monthly_subscription_amount || 0) <= 0) {
      await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
      return res.status(400).json({ success: false, message: 'Monthly subscription is not currently available.' });
    }
    const user = await createOwnerAccount({
      name, email, phone, passwordHash, businessName, tradeLicenseNumber, businessDocuments, payoutMethod,
      billingModel,
      payoutDetails: {
        accountNumber: accountNumber || phone,
        accountHolderName: name,
        bankName: req.body.bankName || null,
        branchName: req.body.branchName || null,
      },
    });
    await issueAuthCodeForUser(user, 'email_verification').catch(() => false);

    respondWithTokens(res, user, 'Turf owner registration submitted. Admin approval is required before listing turfs.', 201);
  } catch (error) {
    await Promise.all(uploadedFiles.map((file) => fs.promises.rm(file.path, { force: true })));
    console.error('Turf owner registration failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to register turf owner.' });
  }
});

app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password || email.length > 255 || password.length > 200 || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ success: false, message: 'Account password is not configured.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      return res.status(403).json({ success: false, message: 'This account is suspended and cannot log in.' });
    }

    const loginMessage = user.email_verified_at
      ? 'Login successful.'
      : user.role === 'staff'
        ? 'Login successful. Verify your email to finish setting up staff access.'
        : 'Login successful. Verify your email before booking.';
    respondWithTokens(res, user, loginMessage);
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to log in.' });
  }
});

app.post('/api/auth/refresh', authLimiter, async (req, res) => {
  const refreshToken = refreshCookieFromRequest(req);

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token is required.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    if (decoded.tokenType !== 'refresh') {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const user = await findUserById(decoded.sub);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      clearRefreshCookie(res);
      return res.status(403).json({ success: false, message: 'This account cannot be refreshed.' });
    }

    const currentVersion = Number(user.token_version || 0);
    if (Number(decoded.ver || 0) !== currentVersion) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Refresh token was already used or revoked.' });
    }
    const rotatedUser = await rotateTokenVersion(user.id, currentVersion);
    if (!rotatedUser) {
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: 'Refresh token was already used or revoked.' });
    }
    respondWithTokens(res, rotatedUser, 'Token refreshed successfully.');
  } catch (error) {
    console.error('Refresh token rejected:', error.name);
    clearRefreshCookie(res);
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = refreshCookieFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
      const user = await findUserById(decoded.sub);
      if (user && Number(decoded.ver || 0) === Number(user.token_version || 0)) {
        await rotateTokenVersion(user.id, Number(user.token_version || 0));
      }
    } catch (error) {
      console.error('Logout token invalidated:', error.name);
    }
  }
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logout successful.' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

app.put('/api/users/me/avatar', requireAuth, parsePublicImageUpload(publicImageUpload.single('avatar')), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a profile image to upload.' });
  if (!await verifyPublicImageSignature(req.file)) {
    await fs.promises.rm(req.file.path, { force: true });
    return res.status(400).json({ success: false, message: 'The uploaded file does not contain a valid JPEG, PNG, or WEBP image.' });
  }
  try {
    const avatar = publicImageUrl(req, 'profile-images', req.file.filename);
    const user = await updateUserAvatar(req.user.id, avatar);
    if (!user) {
      await fs.promises.rm(req.file.path, { force: true });
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }
    res.json({ success: true, data: { user: sanitizeUser(user) } });
  } catch (error) {
    await fs.promises.rm(req.file.path, { force: true });
    console.error('Profile image update failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update profile image.' });
  }
});

app.get('/api/owner/verification', requireAuth, requireRole('turf_owner'), async (req, res) => {
  try {
    const profile = await findOwnerProfile(req.user.id);
    if (!profile) return res.status(404).json({ success: false, message: 'Owner verification profile not found.' });
    const billingSettings = await readAdminSettings();
    res.json({
      success: true,
      data: {
        businessName: profile.business_name,
        tradeLicenseNumber: profile.nid_or_trade_license,
        payoutMethod: profile.payout_method,
        payoutDetails: profile.payout_details,
        approvalStatus: profile.approval_status,
        billingModel: profile.billing_model || 'commission',
        pendingBillingModel: profile.pending_billing_model || null,
        billingModelChangeEffectiveDate: profile.billing_model_change_effective_date ? (profile.billing_model_change_effective_date instanceof Date ? profile.billing_model_change_effective_date.toISOString().slice(0, 10) : String(profile.billing_model_change_effective_date).slice(0, 10)) : null,
        billingSwitchEnabled: billingSettings.owner_billing_switch_enabled === true,
        subscriptionDueDate: profile.subscription_due_date ? (profile.subscription_due_date instanceof Date ? profile.subscription_due_date.toISOString().slice(0, 10) : String(profile.subscription_due_date).slice(0, 10)) : null,
        subscriptionDueAmount: Number(profile.subscription_due_amount || 0),
        subscriptionPaidThrough: profile.subscription_paid_through ? (profile.subscription_paid_through instanceof Date ? profile.subscription_paid_through.toISOString().slice(0, 10) : String(profile.subscription_paid_through).slice(0, 10)) : null,
        subscriptionPaidAt: profile.subscription_paid_at || null,
        subscriptionPaymentReference: profile.subscription_payment_reference || null,
        reviewMessage: profile.review_message || '',
        documents: (profile.business_documents || []).map(({ id, document_type, file_name, mime_type }) => ({ id, type: document_type, fileName: file_name, mimeType: mime_type, url: `/api/owner/verification/documents/${id}` })),
      },
    });
  } catch (error) {
    console.error('Owner verification query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load verification status.' });
  }
});

app.post('/api/owner/billing-model', requireAuth, requireRole('turf_owner'), async (req, res) => {
    const billingModel = req.body.billingModel === null ? null : String(req.body.billingModel || '');
    if (billingModel !== null && !['commission', 'monthly_subscription'].includes(billingModel)) return res.status(400).json({ success: false, message: 'Choose a valid billing model or clear the pending change.' });
    try {
      const result = await scheduleOwnerBillingModelChange({ ownerId: req.user.id, billingModel });
      res.json({ success: true, data: result });
    } catch (error) {
      const expected = /disabled|valid billing|subscription is not currently available|approved owner|other billing/i.test(error.message);
      res.status(expected ? 400 : 500).json({ success: false, message: expected ? error.message : 'Unable to schedule the billing-model change.' });
    }
  });

app.get('/api/owner/verification/documents/:documentId', requireAuth, requireRole('turf_owner'), async (req, res) => {
  try {
    const document = await findOwnerDocument(req.user.id, req.params.documentId);
    if (!document?.storage_key) return res.status(404).json({ success: false, message: 'Verification document not found.' });
    const filePath = path.resolve(privateDocumentDirectory, path.basename(document.storage_key));
    if (!filePath.startsWith(`${privateDocumentDirectory}${path.sep}`)) return res.status(404).json({ success: false, message: 'Verification document not found.' });
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(document.file_name || 'verification-document'))}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ success: false, message: 'Unable to read verification document.' });
    });
  } catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).json({ success: false, message: 'Unable to read verification document.' }); }
});

app.put('/api/owner/verification', requireAuth, requireRole('turf_owner'), parseOwnerDocumentUpload, async (req, res) => {
  const tradeLicenseNumber = String(req.body.tradeLicenseNumber || '').trim();
  const tradeLicenseFile = req.files?.tradeLicense?.[0];
  const files = [tradeLicenseFile, ...(req.files?.supportingDocuments || [])].filter(Boolean);
  if (!tradeLicenseNumber || tradeLicenseNumber.length > 100 || !tradeLicenseFile) {
    await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: 'Provide a trade license number and upload its document.' });
  }
  try {
    for (const file of files) if (!(await verifyDocumentSignature(file))) throw new Error('A submitted file does not match its declared document type.');
    const businessDocuments = files.map((file, index) => ({ id: crypto.randomUUID(), document_type: index === 0 ? 'trade_license' : 'supporting_business_document', file_name: path.basename(file.originalname).slice(0, 180), mime_type: file.mimetype, storage_key: path.basename(file.filename) }));
    const result = await updatePendingOwnerVerification({ ownerId: req.user.id, tradeLicenseNumber, businessDocuments });
    if (!result) { await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true }))); return res.status(409).json({ success: false, message: 'Verification can only be updated while the account is pending review.' }); }
    await Promise.all(result.previousDocuments.filter((document) => document.storage_key).map((document) => fs.promises.rm(path.resolve(privateDocumentDirectory, path.basename(document.storage_key)), { force: true }).catch(() => undefined)));
    return res.json({ success: true, message: 'Verification documents updated and submitted for admin review.' });
  } catch (error) {
    await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
    return res.status(400).json({ success: false, message: error.message || 'Unable to update verification documents.' });
  }
});

app.get('/api/owner/wallet', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    res.json({ success: true, data: await getOwnerWallet(req.user.id) });
  } catch (error) {
    console.error('Owner wallet query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load wallet information.' });
  }
});

app.post('/api/owner/withdrawals', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const withdrawal = await createWithdrawalRequest({
      ownerId: req.user.id,
      amount: req.body.amount,
      idempotencyKey: String(req.get('Idempotency-Key') || ''),
    });
    void notifyAdmins({
      type: 'approval',
      title: 'Withdrawal request needs review',
      message: `${req.user.name} requested a withdrawal of ৳${Number(withdrawal.amount).toLocaleString()}. Review it in Admin > Withdrawals.`,
      data: { eventKey: `withdrawal-request:${withdrawal.id}`, withdrawalId: withdrawal.id, screen: 'admin_withdrawals' },
    });
    res.status(201).json({ success: true, data: withdrawal });
  } catch (error) {
    const expected = /valid|idempotency|available|minimum|payout method/i.test(error.message);
    res.status(expected ? 400 : 500).json({ success: false, message: expected ? error.message : 'Unable to request withdrawal.' });
  }
});

app.put('/api/owner/payout-method', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const payoutMethod = String(req.body.payoutMethod || '');
  const payoutDetails = {
    accountNumber: String(req.body.accountNumber || '').trim(),
    bankName: String(req.body.bankName || '').trim(),
    branchName: String(req.body.branchName || '').trim(),
    accountHolderName: String(req.body.accountHolderName || '').trim(),
  };
  if (!['bkash', 'nagad', 'rocket', 'bank_account'].includes(payoutMethod) || (payoutMethod === 'bank_account' && (!payoutDetails.bankName || !payoutDetails.accountHolderName))) {
    return res.status(400).json({ success: false, message: 'Provide a supported payout method and complete bank details when using a bank account.' });
  }
  try {
    const profile = await updateOwnerPayoutDetails({ ownerId: req.user.id, payoutMethod, payoutDetails });
    res.json({ success: true, data: { payoutMethod: profile.payout_method, payoutDetails: profile.payout_details } });
  } catch (error) {
    const expected = /supported|valid|account|profile/i.test(error.message);
    res.status(expected ? 400 : 500).json({ success: false, message: expected ? error.message : 'Unable to update payout details.' });
  }
});

app.get('/api/admin/withdrawals/pending', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    res.json({ success: true, data: await listPendingWithdrawals() });
  } catch (error) {
    console.error('Withdrawal review queue failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load pending withdrawals.' });
  }
});

app.get('/api/admin/refunds/pending', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: await listPendingRefunds() }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load pending refunds.' }); }
});

app.post('/api/admin/refunds/:refundId/sslcommerz', requireAuth, requireRole('admin'), async (req, res) => {
  let gatewayConfig;
  try { gatewayConfig = await getSslcommerzConfig(); } catch { return res.status(503).json({ success: false, message: 'SSLCommerz settings cannot be decrypted. Verify the server encryption key.' }); }
  if (!gatewayConfig?.isActive || !gatewayConfig.storeId || !gatewayConfig.storePassword) return res.status(503).json({ success: false, message: 'SSLCommerz refund processing is not enabled in Admin settings.' });
  const { storeId, storePassword } = gatewayConfig;
  const sandbox = gatewayConfig.isSandbox;
  const endpoint = new URL(sandbox
    ? 'https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php'
    : 'https://securepay.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php');
  const requestId = crypto.createHash('sha256').update(String(req.params.refundId)).digest('hex').slice(0, 30);
  try {
    const refund = await claimRefundForGateway({ refundId: req.params.refundId, adminId: req.user.id, requestId });
    const queryExisting = Boolean(refund.gateway_refund_ref);
    const parameters = queryExisting
      ? { refund_ref_id: refund.gateway_refund_ref, store_id: storeId, store_passwd: storePassword, format: 'json' }
      : { bank_tran_id: refund.bank_tran_id, refund_trans_id: requestId, refund_amount: Number(refund.amount).toFixed(2), refund_remarks: String(refund.reason || 'Turf booking refund').slice(0, 255), refe_id: String(refund.id).slice(0, 50), store_id: storeId, store_passwd: storePassword, format: 'json' };
    endpoint.search = new URLSearchParams(parameters).toString();
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('SSLCommerz refund service returned an HTTP error.');
    const gateway = await response.json();
    if (String(gateway.APIConnect || '').toUpperCase() !== 'DONE') {
      await saveGatewayRefundResponse({ refundId: refund.id, requestId, error: 'SSLCommerz did not accept the refund request.' });
      return res.status(502).json({ success: false, message: 'SSLCommerz did not accept the refund request. The item remains available for manual review.' });
    }
    const returnedTransaction = String(gateway.trans_id || gateway.tran_id || '');
    if (returnedTransaction && returnedTransaction !== refund.transaction_id) {
      await saveGatewayRefundResponse({ refundId: refund.id, requestId, error: 'SSLCommerz returned a different payment transaction.' });
      return res.status(502).json({ success: false, message: 'SSLCommerz response did not match the original transaction.' });
    }
    if (!queryExisting && !['success', 'processing'].includes(String(gateway.status || '').toLowerCase())) {
      await saveGatewayRefundResponse({ refundId: refund.id, requestId, error: 'SSLCommerz could not initiate the refund.' });
      return res.status(502).json({ success: false, message: 'SSLCommerz could not initiate the refund. The item remains available for manual review.' });
    }
    const refundReference = String(gateway.refund_ref_id || refund.gateway_refund_ref || '');
    if (!refundReference) {
      await saveGatewayRefundResponse({ refundId: refund.id, requestId, error: 'SSLCommerz did not return a refund reference.' });
      return res.status(502).json({ success: false, message: 'SSLCommerz did not return a refund reference; retry or process manually after checking the gateway.' });
    }
    await saveGatewayRefundResponse({ refundId: refund.id, requestId, refundReference });
    if (queryExisting && String(gateway.status || '').toLowerCase() === 'refunded') {
      const completed = await completeGatewayRefund({ refundId: refund.id, adminId: req.user.id, refundReference });
      await notifyRefundCompleted(completed);
      return res.json({ success: true, data: completed, gatewayStatus: 'refunded' });
    }
    return res.json({ success: true, data: { id: refund.id, status: 'processing', gateway_refund_ref: refundReference }, gatewayStatus: String(gateway.status || 'processing') });
  } catch (error) {
    console.error('SSLCommerz refund action failed:', error.message);
    const expected = /pending gateway refund|manual bookings|bank transaction|different gateway|state changed/i.test(error.message);
    res.status(expected ? 409 : 502).json({ success: false, message: expected ? error.message : 'Unable to confirm the SSLCommerz refund state. Retry the status check before processing manually.' });
  }
});

app.post('/api/admin/refunds/:refundId/uddoktapay', requireAuth, requireRole('admin'), async (req, res) => {
  let config;
  try { config = await getPaymentGatewayConfig('uddoktapay'); }
  catch {
    return res.status(503).json({ success: false, message: 'UddoktaPay settings cannot be decrypted. Verify its server encryption key.' });
  }
  if (!config?.isActive || !config.automatedRefundsEnabled || !config.apiKey) {
    return res.status(503).json({ success: false, message: 'UddoktaPay automated refunds are not enabled in Admin settings.' });
  }
  const requestId = crypto.createHash('sha256').update(`uddoktapay:${req.params.refundId}`).digest('hex').slice(0, 30);
  try {
    const refund = await claimRefundForGateway({ refundId: req.params.refundId, adminId: req.user.id, requestId, gateway: 'uddoktapay' });
    const apiOrigin = config.isSandbox ? 'https://sandbox.uddoktapay.com' : config.baseUrl;
    const response = await fetch(`${apiOrigin}/api/refund-payment`, {
      method: 'POST',
      headers: { 'RT-UDDOKTAPAY-API-KEY': config.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: refund.provider_transaction_id,
        payment_method: refund.payment_method,
        amount: Number(refund.amount).toFixed(2),
        product_name: 'Turf booking',
        reason: String(refund.reason || 'Turf booking refund').slice(0, 255),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('UddoktaPay refund request returned an HTTP error.');
    let result = {};
    try { result = await response.json(); } catch { result = {}; }
    if (result.status === false) {
      await saveGatewayRefundResponse({ refundId: refund.id, requestId, error: String(result.message || 'UddoktaPay rejected the refund request.') });
      return res.status(502).json({ success: false, message: 'UddoktaPay did not accept the refund request. The item remains available for review.' });
    }
    const refundReference = String(result.refund_id || result.refund_reference || '');
    await saveGatewayRefundResponse({
      refundId: refund.id,
      requestId,
      refundReference: refundReference || undefined,
      submitted: true,
      error: refundReference ? undefined : 'Submitted to UddoktaPay. Verify completion in the UddoktaPay dashboard and record its reference here.',
    });
    res.json({
      success: true,
      message: 'Submitted to UddoktaPay. Verify completion in the UddoktaPay dashboard, then record its refund reference here.',
      data: { id: refund.id, status: 'processing', gateway_request_id: requestId, gateway_refund_ref: refundReference || null },
      gatewayStatus: 'processing',
    });
  } catch (error) {
    console.error('UddoktaPay refund action failed:', error.message);
    const expected = /pending gateway refund|manual bookings|provider|automated refunds|different gateway|already processing|state changed/i.test(error.message);
    res.status(expected ? 409 : 502).json({ success: false, message: expected ? error.message : 'Unable to submit the UddoktaPay refund request. Verify it manually before retrying.' });
  }
});

app.post('/api/admin/refunds/:refundId/processed', requireAuth, requireRole('admin'), async (req, res) => {
  const reference = String(req.body.reference || '').trim();
  try {
    const refund = await markRefundProcessed({ refundId: req.params.refundId, adminId: req.user.id, reference });
    await notifyRefundCompleted(refund);
    res.json({ success: true, data: refund });
  } catch (error) {
    const expected = /reference|required|pending refund|supported sslcommerz/i.test(error.message);
    res.status(expected ? 400 : 500).json({ success: false, message: expected ? error.message : 'Unable to record refund processing.' });
  }
});

app.post('/api/admin/withdrawals/:withdrawalId/decision', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = String(req.body.decision || '');
  if (!['approve', 'reject', 'paid'].includes(decision)) return res.status(400).json({ success: false, message: 'Decision must be approve, reject, or paid.' });
  try {
    const withdrawal = await decideWithdrawal({
      withdrawalId: req.params.withdrawalId,
      adminId: req.user.id,
      decision,
      reference: String(req.body.reference || '').trim() || null,
      reason: String(req.body.reason || '').trim() || null,
    });
    if (decision !== 'approve') {
      const message = decision === 'paid'
        ? `Your withdrawal of ৳${Number(withdrawal.amount).toLocaleString()} was paid. Reference: ${withdrawal.reference || 'not provided'}.`
        : `Your withdrawal request of ৳${Number(withdrawal.amount).toLocaleString()} was rejected: ${withdrawal.rejection_reason || 'No reason provided.'} Funds have been returned to your available balance.`;
      await notifyPlayer({
        userId: withdrawal.owner_id,
        type: 'payment',
        title: decision === 'paid' ? 'Withdrawal Approved & Paid' : 'Withdrawal Rejected',
        message,
        data: { eventKey: `withdrawal-${withdrawal.id}-${withdrawal.status}`, withdrawalId: withdrawal.id },
      });
    }
    res.json({ success: true, data: withdrawal });
  } catch (error) {
    const expected = /invalid|state/i.test(error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to process withdrawal decision.' });
  }
});

const adminSettingValidators = {
  public_api_base_url: (value) => Boolean(normalizePublicApiBaseUrl(value, { allowHttpLocalhost: process.env.NODE_ENV !== 'production' })),
  global_commission_rate: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
  platform_fee_rate: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
  gateway_fee_rate: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
  minimum_withdrawal_amount: (value) => Number.isFinite(Number(value?.amount ?? value)) && Number(value?.amount ?? value) >= 0,
  cancellation_window_hours: (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 720,
  booking_hold_minutes: (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 60,
  monthly_subscription_amount: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10000000,
  owner_billing_switch_enabled: (value) => typeof value === 'boolean',
  platform_fee_enabled: (value) => typeof value === 'boolean',
  gateway_fee_enabled: (value) => typeof value === 'boolean',
  show_fee_breakdown: (value) => typeof value === 'boolean',
  supported_sports: (value) => Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.trim().length <= 60),
  featured_packages: (value) => Array.isArray(value) && value.length <= 20 && value.every((item) => item && typeof item.id === 'string' && item.id.length <= 100 && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100 && Number.isFinite(Number(item.price)) && Number(item.price) >= 0 && Number.isInteger(Number(item.durationDays)) && Number(item.durationDays) > 0 && Number.isInteger(Number(item.priority)) && Number(item.priority) > 0 && typeof item.description === 'string' && item.description.length <= 500) && new Set(value.map((item) => item.id)).size === value.length,
};

const legalPageDefinitions = {
  'privacy-policy': {
    title: 'Privacy Policy',
    content: 'STARTER DRAFT — ADMIN REVIEW REQUIRED\n\nReplace this draft with the platform’s approved privacy policy before publishing. Describe only data collection, use, sharing, security, retention, and user rights that have been verified for the live service.',
  },
  'terms-of-service': {
    title: 'Terms of Service',
    content: 'STARTER DRAFT — ADMIN REVIEW REQUIRED\n\nReplace this draft with the platform’s approved terms of service before publishing. Confirm all legal, operational, payment, account, and dispute terms before making this page public.',
  },
  'refund-policy': {
    title: 'Refund Policy',
    content: 'This page explains the platform cancellation and refund rules. The refund percentage depends on the policy attached to the booking. Player cancellation requests are reviewed by the turf owner; requests not decided within 24 hours are automatically approved using the percentage captured when the request was submitted. Owner-initiated cancellations receive a full refund. Payment gateway fees are non-refundable. Manual booking refunds are handled offline by the owner. See the matrix below for the current global default policy; a turf-specific or owner-specific policy may apply to a booking.',
  },
};

const readLegalPages = async () => {
  const settings = await readAdminSettings();
  const savedPages = settings.legal_pages && typeof settings.legal_pages === 'object' ? settings.legal_pages : {};
  return Object.fromEntries(Object.entries(legalPageDefinitions).map(([slug, definition]) => {
    const saved = savedPages[slug];
    return [slug, {
      title: definition.title,
      content: typeof saved?.content === 'string' ? saved.content : definition.content,
      published: typeof saved?.published === 'boolean' ? saved.published : false,
    }];
  }));
};

const getDefaultRefundTiers = async () => {
  const policies = await listCancellationPolicies();
  const policy = policies.find((item) => (item.is_default ?? item.isDefault) === true && (item.is_active ?? item.isActive) !== false);
  return (policy?.tiers || []).map((tier) => ({
    minHoursSinceBooking: Number(tier.hours_before_start_min ?? tier.min),
    maxHoursSinceBooking: tier.hours_before_start_max == null && tier.max == null ? null : Number(tier.hours_before_start_max ?? tier.max),
    refundPercentage: Number(tier.refund_percentage ?? tier.refundPercentage),
  }));
};

app.get('/api/admin/legal-pages', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    res.json({ success: true, data: { pages: await readLegalPages(), refundTiers: await getDefaultRefundTiers() } });
  } catch (error) {
    console.error('Admin legal page load failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load legal pages.' });
  }
});

app.put('/api/admin/legal-pages', requireAuth, requireRole('admin'), async (req, res) => {
  const pages = req.body?.pages;
  const slugs = Object.keys(legalPageDefinitions);
  if (!pages || typeof pages !== 'object' || Array.isArray(pages) || Object.keys(pages).length !== slugs.length
    || slugs.some((slug) => !pages[slug] || typeof pages[slug].content !== 'string'
      || pages[slug].content.length > 30_000 || typeof pages[slug].published !== 'boolean'
      || (pages[slug].published && !pages[slug].content.trim())
      || (pages[slug].published && pages[slug].content.trimStart().startsWith('STARTER DRAFT')))) {
    return res.status(400).json({ success: false, message: 'Provide valid content and publication state for all three legal pages. Replace starter drafts before publishing.' });
  }
  const normalizedPages = Object.fromEntries(slugs.map((slug) => [slug, {
    content: pages[slug].content,
    published: pages[slug].published,
  }]));
  try {
    const savedPages = await writeAdminSetting({ key: 'legal_pages', value: normalizedPages, adminId: req.user.id });
    res.json({ success: true, data: { pages: await readLegalPages(), saved: Boolean(savedPages) } });
  } catch (error) {
    console.error('Admin legal page save failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to save legal pages.' });
  }
});

app.get('/api/public/legal-pages/:slug', async (req, res) => {
  const definition = legalPageDefinitions[req.params.slug];
  if (!definition) return res.status(404).json({ success: false, message: 'Legal page not found.' });
  try {
    const pages = await readLegalPages();
    const page = pages[req.params.slug];
    const responseData = { slug: req.params.slug, title: page.title, published: page.published, content: page.published ? page.content : null };
    if (req.params.slug === 'refund-policy') responseData.refundTiers = page.published ? await getDefaultRefundTiers() : [];
    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Public legal page load failed:', error.message);
    res.status(503).json({ success: false, message: 'Unable to load this page right now.' });
  }
});

app.get('/api/admin/settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const settings = await readAdminSettings();
    delete settings.smtp_configs;
    delete settings.sslcommerz_config;
    delete settings.shurjopay_config;
    delete settings.uddoktapay_config;
    settings.payment_gateways = await listSafePaymentGatewayConfigs();
    const serverBaseUrl = resolvePublicApiBaseUrl(settings, req);
    settings.public_api_base_url = serverBaseUrl;
    settings.payment_gateways = settings.payment_gateways.map((gateway) => gateway.provider === 'surjopay'
      ? { ...gateway, ipnUrl: `${serverBaseUrl}/api/payments/surjopay/webhook` }
      : gateway);
    res.json({ success: true, data: settings });
  }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load platform settings.' }); }
});

app.put('/api/admin/sslcommerz-config', requireAuth, requireRole('admin'), async (req, res) => {
  const config = req.body?.config;
  if (!config || typeof config.storeId !== 'string' || config.storeId.length > 120 || typeof config.apiSecret !== 'string' || config.apiSecret.length > 500 || typeof config.label !== 'string' || config.label.trim().length < 1 || config.label.length > 120 || typeof config.isSandbox !== 'boolean' || typeof config.isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Check the SSLCommerz Store ID, Store Password, mode, and enabled setting.' });
  }
  try { res.json({ success: true, data: await saveSslcommerzConfig({ config, adminId: req.user.id }) }); }
  catch (error) {
    const message = String(error.message || '');
    if (message.includes('required before enabling')) return res.status(400).json({ success: false, message });
    console.error('SSLCommerz configuration save failed:', message);
    res.status(503).json({ success: false, message: 'Unable to save SSLCommerz settings. Verify the server encryption key is configured.' });
  }
});

app.put('/api/admin/payment-gateway-config/:provider', requireAuth, requireRole('admin'), async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const config = req.body?.config;
  const validCommon = config && typeof config.label === 'string' && config.label.trim().length > 0 && config.label.length <= 120 && typeof config.isSandbox === 'boolean' && typeof config.isActive === 'boolean';
  const validProvider = provider === 'surjopay'
    ? validCommon && typeof config.prefix === 'string' && config.prefix.length <= 40 && typeof config.username === 'string' && config.username.length <= 120 && typeof config.password === 'string' && config.password.length <= 500
    : provider === 'uddoktapay'
      ? validCommon && typeof config.baseUrl === 'string' && config.baseUrl.length <= 300 && typeof config.apiKey === 'string' && config.apiKey.length <= 500 && typeof config.automatedRefundsEnabled === 'boolean'
      : false;
  if (!validProvider) return res.status(400).json({ success: false, message: 'Check the gateway label, sandbox/live mode, activation state, and provider credentials.' });
  try {
    const saved = await savePaymentGatewayConfig({ provider, config, adminId: req.user.id });
    res.json({ success: true, data: saved });
  } catch (error) {
    const message = String(error.message || '');
    const expected = /required before enabling|valid UddoktaPay|HTTPS origin|Unsupported payment gateway/i.test(message);
    if (!expected) console.error(`${provider} configuration save failed:`, message);
    res.status(expected ? 400 : 503).json({ success: false, message: expected ? message : `Unable to save ${provider} settings. Verify its independent server encryption key is configured.` });
  }
});

app.get('/api/payments/gateways', async (_req, res) => {
  try {
    const gateways = await listSafePaymentGatewayConfigs();
    res.json({ success: true, data: gateways.filter((config) => config.isActive).map(({ id, provider, label, isSandbox, isActive }) => ({ id, provider, label, isSandbox, isActive })) });
  } catch { res.status(503).json({ success: false, message: 'Unable to load payment options.' }); }
});

app.get('/api/public/billing-options', async (_req, res) => {
  try {
    const settings = await readAdminSettings();
    res.json({ success: true, data: {
      monthlySubscriptionAmount: Number(settings.monthly_subscription_amount || 0),
      bookingHoldMinutes: Number(settings.booking_hold_minutes ?? 10),
      ownerBillingSwitchEnabled: settings.owner_billing_switch_enabled === true,
      platformFeeRate: Number(settings.platform_fee_rate ?? 5),
      gatewayFeeRate: Number(settings.gateway_fee_rate ?? 2.5),
      platformFeeEnabled: settings.platform_fee_enabled !== false,
      gatewayFeeEnabled: settings.gateway_fee_enabled !== false,
      showFeeBreakdown: settings.show_fee_breakdown !== false,
      featureFlags: await listFeatureFlags(),
    } });
  } catch { res.status(503).json({ success: false, message: 'Unable to load owner billing options.' }); }
});

app.get('/api/admin/smtp-configs', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: (await listSmtpConfigs()).map(safeSmtpConfig) }); }
  catch (error) { console.error('SMTP configuration load failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load SMTP settings.' }); }
});

app.get('/api/player/notifications', requireAuth, requireRole('player', 'turf_owner', 'admin'), async (req, res) => {
  try {
    const notifications = await listUserNotifications(req.user.id);
    res.json({ success: true, data: notifications.map((item) => ({
      id: item.id, userId: item.user_id, role: req.user.role, type: item.type, title: item.title,
      message: item.message, data: item.data || {}, read: Boolean(item.read_at), createdAt: item.created_at,
    })) });
  } catch (error) { console.error('Player notification load failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load notifications.' }); }
});

app.patch('/api/player/notifications/:notificationId/read', requireAuth, requireRole('player', 'turf_owner', 'admin'), async (req, res) => {
  try {
    const updated = await markUserNotificationRead({ userId: req.user.id, notificationId: req.params.notificationId });
    if (!updated) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true, data: { id: req.params.notificationId, read: true } });
  } catch (error) { console.error('Player notification update failed:', error.message); res.status(500).json({ success: false, message: 'Unable to update notification.' }); }
});

app.get('/api/player/favorites', requireAuth, requireRole('player'), async (req, res) => {
  try {
    res.json({ success: true, data: await listPlayerFavorites(req.user.id) });
  } catch (error) {
    console.error('Player favorites load failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load saved turfs.' });
  }
});

app.post('/api/player/favorites/:turfId', requireAuth, requireRole('player'), async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.turfId)) {
    return res.status(400).json({ success: false, message: 'A valid turf ID is required.' });
  }
  try {
    await setPlayerFavorite({ playerId: req.user.id, turfId: req.params.turfId, isFavorite: true });
    res.status(201).json({ success: true, data: { turfId: req.params.turfId } });
  } catch (error) {
    const notFound = /active turf not found/i.test(error.message);
    if (!notFound) console.error('Player favorite save failed:', error.message);
    res.status(notFound ? 404 : 500).json({ success: false, message: notFound ? 'Active turf not found.' : 'Unable to save this turf.' });
  }
});

app.delete('/api/player/favorites/:turfId', requireAuth, requireRole('player'), async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.turfId)) {
    return res.status(400).json({ success: false, message: 'A valid turf ID is required.' });
  }
  try {
    await setPlayerFavorite({ playerId: req.user.id, turfId: req.params.turfId, isFavorite: false });
    res.json({ success: true, data: { turfId: req.params.turfId } });
  } catch (error) {
    console.error('Player favorite removal failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to remove this saved turf.' });
  }
});

app.get('/api/notifications/push/public-key', (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return res.status(503).json({ success: false, message: 'Web Push is not configured.' });
  res.json({ success: true, data: { publicKey } });
});

app.post('/api/player/notifications/push-subscriptions', requireAuth, requireRole('player', 'turf_owner', 'admin'), async (req, res) => {
  if (!req.body.subscription || typeof req.body.subscription !== 'object' || Array.isArray(req.body.subscription)) return res.status(400).json({ success: false, message: 'A Web Push subscription is required.' });
  try {
    const result = await savePushSubscription({ userId: req.user.id, subscription: req.body.subscription });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    const message = /Invalid Web Push/.test(error.message) ? error.message : 'Unable to save push notifications. Verify server notification encryption settings.';
    const status = message.startsWith('Invalid') ? 400 : 503;
    console.error('Push subscription save failed:', error.message);
    res.status(status).json({ success: false, message });
  }
});

app.delete('/api/player/notifications/push-subscriptions/:endpointHash', requireAuth, requireRole('player', 'turf_owner', 'admin'), async (req, res) => {
  try {
    const deleted = await deleteUserPushSubscription({ userId: req.user.id, endpointHash: req.params.endpointHash });
    if (!deleted) return res.status(404).json({ success: false, message: 'Push subscription not found.' });
    res.json({ success: true, data: { endpointHash: req.params.endpointHash, deleted: true } });
  } catch (error) { console.error('Push subscription removal failed:', error.message); res.status(500).json({ success: false, message: 'Unable to remove push subscription.' }); }
});

app.put('/api/admin/smtp-configs', requireAuth, requireRole('admin'), async (req, res) => {
  const configs = req.body.configs;
  if (!Array.isArray(configs) || configs.length > 10) return res.status(400).json({ success: false, message: 'Provide up to 10 SMTP configurations.' });
  const ids = new Set();
  for (const config of configs) {
    const valid = config && typeof config.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(config.id)
      && !ids.has(config.id) && typeof config.label === 'string' && config.label.trim().length > 0 && config.label.length <= 120
      && typeof config.host === 'string' && /^[a-zA-Z0-9.-]{1,253}$/.test(config.host)
      && Number.isInteger(Number(config.port)) && Number(config.port) >= 1 && Number(config.port) <= 65535
      && typeof config.secure === 'boolean' && typeof config.username === 'string' && config.username.length <= 254
      && typeof config.fromName === 'string' && config.fromName.length <= 120
      && typeof config.fromEmail === 'string' && /^\S+@\S+\.\S+$/.test(config.fromEmail) && config.fromEmail.length <= 254
      && typeof config.isActive === 'boolean' && (config.password === undefined || typeof config.password === 'string');
    if (!valid) return res.status(400).json({ success: false, message: 'Check the SMTP host, port, sender, and other required fields.' });
    ids.add(config.id);
  }
  if (configs.filter((config) => config.isActive).length > 1) return res.status(400).json({ success: false, message: 'Only one SMTP configuration can be active.' });
  try {
    const saved = await saveSmtpConfigs({ configs, adminId: req.user.id });
    res.json({ success: true, data: saved.map(safeSmtpConfig) });
  } catch (error) {
    const message = String(error.message || '');
    if (message.startsWith('SMTP password is required')) return res.status(400).json({ success: false, message: 'Enter a password for each new SMTP configuration.' });
    console.error('SMTP configuration save failed:', message);
    res.status(500).json({ success: false, message: 'Unable to save SMTP settings.' });
  }
});

app.get('/api/admin/feature-flags', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: await getCachedFeatureFlags() }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load feature flags.' }); }
});

app.patch('/api/admin/feature-flags/:key', requireAuth, requireRole('admin'), async (req, res) => {
  if (typeof req.body.value !== 'boolean') return res.status(400).json({ success: false, message: 'Feature flag value must be true or false.' });
  try {
    const data = await setFeatureFlag({ key: String(req.params.key), value: req.body.value, adminId: req.user.id });
    await invalidateFeatureFlagsCache();
    res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'Invalid feature flag update.') return res.status(404).json({ success: false, code: 'unknown_feature_flag', message: 'Feature flag was not found.' });
    console.error('Feature flag update failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update the feature flag.' });
  }
});

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const role = String(req.query.role || '');
  const status = String(req.query.status || '');
  if (role && !['player', 'turf_owner', 'staff', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid user role filter.' });
  if (status && !['active', 'pending_approval', 'suspended', 'deactivated'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid user status filter.' });
  try { res.json({ success: true, data: await listUsersForAdmin({ search: String(req.query.search || '').slice(0, 120), role, status }) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load users.' }); }
});

app.post('/api/admin/users/:userId/status', requireAuth, requireRole('admin'), async (req, res) => {
  const status = String(req.body.status || '');
  const reason = String(req.body.reason || '').trim();
  if (req.params.userId === req.user.id) return res.status(400).json({ success: false, message: 'You cannot change your own account status.' });
  if (!['active', 'suspended', 'deactivated'].includes(status) || reason.length > 1000) return res.status(400).json({ success: false, message: 'Choose an allowed status and keep the reason under 1,000 characters.' });
  try {
    const user = await changeUserStatus({ userId: req.params.userId, status, adminId: req.user.id, reason });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to update account status.' }); }
});

app.get('/api/admin/owner-commissions', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: await listOwnerCommissionSettings() }); }
  catch (error) { console.error('Owner commission list failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load owner commission settings.' }); }
});

app.put('/api/admin/owners/:ownerId/commission', requireAuth, requireRole('admin'), async (req, res) => {
  const value = req.body.commissionOverride;
  if (value !== null && (value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) return res.status(400).json({ success: false, message: 'Commission override must be between 0 and 100, or null to use the global rate.' });
  try {
    const result = await setOwnerCommissionOverride({ ownerId: req.params.ownerId, commissionOverride: value === null ? null : Number(value), adminId: req.user.id });
    if (!result) return res.status(404).json({ success: false, message: 'Turf owner was not found.' });
    res.json({ success: true, data: result });
  } catch (error) { res.status(400).json({ success: false, message: error.message || 'Unable to update owner commission.' }); }
});

app.put('/api/admin/settings/:key', requireAuth, requireRole('admin'), async (req, res) => {
  const validator = adminSettingValidators[req.params.key];
  if (!validator) return res.status(404).json({ success: false, message: 'Setting is not configurable through this API.' });
  if (!validator(req.body.value)) return res.status(400).json({ success: false, message: 'Setting value is invalid.' });
  try {
    const booleanKeys = ['platform_fee_enabled', 'gateway_fee_enabled', 'show_fee_breakdown', 'owner_billing_switch_enabled'];
    const value = req.params.key === 'public_api_base_url'
      ? normalizePublicApiBaseUrl(req.body.value, { allowHttpLocalhost: process.env.NODE_ENV !== 'production' })
      : booleanKeys.includes(req.params.key) || ['supported_sports', 'minimum_withdrawal_amount'].includes(req.params.key)
      ? req.body.value : Number(req.body.value);
    res.json({ success: true, data: { key: req.params.key, value: await writeAdminSetting({ key: req.params.key, value, adminId: req.user.id }) } });
  } catch (error) {
    console.error('Admin platform setting update failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update platform setting.' });
  }
});

  app.get('/api/admin/subscriptions', requireAuth, requireRole('admin'), async (_req, res) => {
    try { res.json({ success: true, data: await listSubscriptionOwners() }); }
    catch (error) { console.error('Subscription owner list failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load subscription owners.' }); }
  });

  app.post('/api/admin/subscriptions/:ownerId/payment', requireAuth, requireRole('admin'), async (req, res) => {
    const reference = String(req.body.reference || '').trim();
    if (!reference || reference.length > 255) return res.status(400).json({ success: false, message: 'Enter a payment reference of up to 255 characters.' });
    try {
      const payment = await recordOwnerSubscriptionPayment({ ownerId: req.params.ownerId, adminId: req.user.id, receivedAt: new Date().toISOString(), reference });
      res.json({ success: true, data: payment });
    } catch (error) {
      const expected = /not found|already recorded/i.test(error.message);
      res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to record subscription payment.' });
    }
  });

app.get('/api/admin/reports/revenue', requireAuth, requireRole('admin'), async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return res.status(400).json({ success: false, message: 'Report dates must use YYYY-MM-DD.' });
  try { res.json({ success: true, data: await adminRevenueReport({ from: from || undefined, to: to || undefined }) }); }
  catch (error) { console.error('Admin revenue report failed:', error.message); res.status(500).json({ success: false, message: 'Unable to generate revenue report.' }); }
});

app.get('/api/admin/disputes', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: await listAdminDisputes() }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load disputes.' }); }
});

app.post('/api/admin/disputes/:disputeId/decision', requireAuth, requireRole('admin'), async (req, res) => {
  const status = String(req.body.status || '');
  const resolution = String(req.body.resolution || '').trim();
  if (!['investigating', 'resolved', 'closed'].includes(status) || (['resolved', 'closed'].includes(status) && !resolution)) return res.status(400).json({ success: false, message: 'Choose a valid dispute status and provide a resolution when closing it.' });
  try {
    const prior = (await listAdminDisputes()).find((item) => item.id === req.params.disputeId);
    const dispute = await resolveDispute({ disputeId: req.params.disputeId, adminId: req.user.id, status, resolution });
    if (!dispute) return res.status(404).json({ success: false, message: 'Open dispute not found.' });
    const raisedBy = await findUserById(dispute.raised_by || prior?.raised_by);
    if (raisedBy?.role === 'player') await notifyPlayer({
      userId: raisedBy.id, type: 'dispute', title: 'Dispute status updated',
      message: `Your dispute is now ${status}.${['resolved', 'closed'].includes(status) ? ` ${resolution}` : ''}`,
      data: { bookingId: dispute.booking_id || prior?.booking_id, disputeId: dispute.id, eventKey: `dispute-status:${dispute.id}:${status}` },
    });
    res.json({ success: true, data: dispute });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to update dispute.' }); }
});

const validatePolicyTiers = (tiers) => {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 20) return 'A policy needs 1 to 20 refund tiers.';
  const normalized = tiers.map((tier) => ({
    min: Number(tier.min),
    max: tier.max === null || tier.max === '' ? null : Number(tier.max),
    refundPercentage: Number(tier.refundPercentage),
  })).sort((a, b) => a.min - b.min);
  if (normalized[0].min !== 0) return 'Policy tiers must start at 0 hours.';
  for (let index = 0; index < normalized.length; index += 1) {
    const tier = normalized[index];
    if (!Number.isInteger(tier.min) || tier.min < 0 || (tier.max !== null && (!Number.isInteger(tier.max) || tier.max <= tier.min)) || !Number.isFinite(tier.refundPercentage) || tier.refundPercentage < 0 || tier.refundPercentage > 100) return 'Each tier needs valid hour boundaries and a refund percentage from 0 to 100.';
    if (index < normalized.length - 1 && (tier.max === null || tier.max !== normalized[index + 1].min)) return 'Policy tiers must be contiguous with one open-ended final tier.';
    if (index === normalized.length - 1 && tier.max !== null) return 'The final tier must be open-ended.';
  }
  return normalized;
};

app.get('/api/admin/cancellation-policies', requireAuth, requireRole('admin'), async (_req, res) => {
  try { res.json({ success: true, data: await listCancellationPolicies() }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load cancellation policies.' }); }
});

const savePolicyHandler = async (req, res, isUpdate) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const tiers = validatePolicyTiers(req.body.tiers);
  if (!name || name.length > 100 || description.length > 1000 || typeof tiers === 'string') return res.status(400).json({ success: false, message: typeof tiers === 'string' ? tiers : 'Policy name and description are invalid.' });
  try {
    const policy = await saveCancellationPolicy({ id: isUpdate ? req.params.policyId : undefined, name, description, isDefault: req.body.isDefault === true, tiers, adminId: req.user.id });
    res.status(isUpdate ? 200 : 201).json({ success: true, data: policy });
  } catch (error) {
    const expected = /not found|default|assigned/i.test(error.message);
    res.status(expected ? 404 : 500).json({ success: false, message: expected ? error.message : 'Unable to save cancellation policy.' });
  }
};
app.post('/api/admin/cancellation-policies', requireAuth, requireRole('admin'), (req, res) => savePolicyHandler(req, res, false));
app.patch('/api/admin/cancellation-policies/:policyId', requireAuth, requireRole('admin'), (req, res) => savePolicyHandler(req, res, true));

app.post('/api/admin/cancellation-policies/:policyId/simulate', requireAuth, requireRole('admin'), async (req, res) => {
  const hours = Number(req.body.hoursSinceBooking ?? req.body.hoursBeforeStart);
  const turfPrice = Number(req.body.turfPrice ?? 1000);
  const bookingSource = String(req.body.bookingSource || 'online');
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(turfPrice) || turfPrice < 0 || !['online', 'manual_owner', 'manual_staff', 'admin'].includes(bookingSource)) return res.status(400).json({ success: false, message: 'Provide nonnegative hours since booking creation, a valid sample turf price, and a supported booking source.' });
  try {
    const policy = (await listCancellationPolicies()).find((item) => String(item.id) === req.params.policyId);
    if (!policy) return res.status(404).json({ success: false, message: 'Cancellation policy not found.' });
    const tiers = policy.tiers || [];
    const tier = tiers.find((item) => {
      const min = Number(item.hours_before_start_min ?? item.min);
      const maxValue = item.hours_before_start_max ?? item.max;
      const max = maxValue == null ? null : Number(maxValue);
      return hours >= min && (max === null || hours < max || (hours === 24 && min === 6 && max === 24));
    });
    if (!tier) return res.status(409).json({ success: false, message: 'Policy does not cover this cancellation time.' });
    const refundPercentage = Number(tier.refund_percentage ?? tier.refundPercentage);
    const platformSettings = await readAdminSettings();
    const platformFeeRate = Number(platformSettings.platform_fee_rate ?? 5);
    const gatewayFeeRate = Number(platformSettings.gateway_fee_rate ?? 2.5);
    const roundMoney = (amount) => Math.round(amount * 100) / 100;
    const platformFee = roundMoney(turfPrice * platformFeeRate / 100);
    const gatewayFee = bookingSource === 'online' ? roundMoney((turfPrice + platformFee) * gatewayFeeRate / 100) : 0;
    const playerRefund = bookingSource === 'online'
      ? roundMoney(turfPrice * refundPercentage / 100)
      : roundMoney(Math.max(0, turfPrice * refundPercentage / 100 - platformFee));
    const matchedTier = {
      hours_before_start_min: Number(tier.hours_before_start_min ?? tier.min),
      hours_before_start_max: (tier.hours_before_start_max ?? tier.max) == null ? null : Number(tier.hours_before_start_max ?? tier.max),
      refund_percentage: refundPercentage,
    };
    res.json({ success: true, data: {
      matchedTier,
      refundPercentage,
      exampleRefund: playerRefund,
      exampleAmounts: { turfPrice, playerRefund, platformKeeps: platformFee, gatewayFee, gatewayFeeRefunded: 0, bookingSource },
    } });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to simulate policy.' }); }
});

app.delete('/api/admin/cancellation-policies/:policyId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await deleteCancellationPolicy({ policyId: req.params.policyId, adminId: req.user.id });
    if (!deleted) return res.status(404).json({ success: false, message: 'Cancellation policy not found.' });
    res.json({ success: true, message: 'Cancellation policy deleted.' });
  } catch (error) { res.status(409).json({ success: false, message: error.message }); }
});

app.post('/api/admin/turfs/:turfId/cancellation-policy', requireAuth, requireRole('admin'), async (req, res) => {
  try { res.json({ success: true, data: await assignCancellationPolicy({ targetType: 'turf', targetId: req.params.turfId, policyId: String(req.body.policyId || ''), adminId: req.user.id }) }); }
  catch (error) { res.status(/not found/i.test(error.message) ? 404 : 400).json({ success: false, message: error.message }); }
});
app.delete('/api/admin/turfs/:turfId/cancellation-policy', requireAuth, requireRole('admin'), async (req, res) => {
  try { res.json({ success: true, data: await assignCancellationPolicy({ targetType: 'turf', targetId: req.params.turfId, adminId: req.user.id, remove: true }) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to remove turf policy override.' }); }
});
app.post('/api/admin/owners/:ownerId/cancellation-policy', requireAuth, requireRole('admin'), async (req, res) => {
  try { res.json({ success: true, data: await assignCancellationPolicy({ targetType: 'owner', targetId: req.params.ownerId, policyId: String(req.body.policyId || ''), adminId: req.user.id }) }); }
  catch (error) { res.status(/not found/i.test(error.message) ? 404 : 400).json({ success: false, message: error.message }); }
});
app.delete('/api/admin/owners/:ownerId/cancellation-policy', requireAuth, requireRole('admin'), async (req, res) => {
  try { res.json({ success: true, data: await assignCancellationPolicy({ targetType: 'owner', targetId: req.params.ownerId, adminId: req.user.id, remove: true }) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to remove owner policy override.' }); }
});

app.post('/api/bookings/:bookingId/disputes', requireAuth, requireRole('player', 'turf_owner'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  const description = String(req.body.description || '').trim();
  if (!reason || reason.length > 120 || description.length > 4000) return res.status(400).json({ success: false, message: 'Provide a reason (up to 120 characters) and description (up to 4,000 characters).' });
  try {
    const booking = await getBookingForUser(req.params.bookingId, req.user);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.status(201).json({ success: true, data: await createDispute({ bookingId: booking.id, userId: req.user.id, reason, description }) });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to open the dispute.' }); }
});

app.post('/api/bookings/:bookingId/reviews', requireAuth, requireRole('player'), async (req, res) => {
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 2000) return res.status(400).json({ success: false, message: 'Provide a rating from 1 through 5 and a comment of at most 2,000 characters.' });
  try {
    const review = await createReview({ bookingId: req.params.bookingId, playerId: req.user.id, rating, comment });
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    const expected = /completed bookings|duplicate|unique/i.test(error.message) || error.code === '23505' || error.code === 11000;
    const message = /duplicate|unique/i.test(error.message) || error.code === '23505' || error.code === 11000
      ? 'This booking has already been reviewed.'
      : /completed bookings/i.test(error.message)
        ? 'Only completed bookings whose end time has passed can be reviewed.'
        : 'Unable to save this review.';
    res.status(expected ? 409 : 500).json({ success: false, message });
  }
});

app.get('/api/staff/bookings', requireAuth, requireRole('staff'), async (req, res) => {
  const date = String(req.query.date || '');
  const status = String(req.query.status || '');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Date must use YYYY-MM-DD.' });
  if (status && !['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid booking status filter.' });
  try { res.json({ success: true, data: await listBookingsForStaff(req.user.id, { date, status }) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load assigned bookings.' }); }
});
app.get('/api/staff/assignments', requireAuth, requireRole('staff'), async (req, res) => {
  try { res.json({ success: true, data: await listStaffAssignmentsForUser(req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load your turf assignments.' }); }
});

app.post('/api/staff/bookings/:bookingId/check-in', requireAuth, requireRole('staff'), async (req, res) => {
  try {
    const booking = await updateStaffBookingStatus({ bookingId: req.params.bookingId, staffId: req.user.id, status: 'checked_in' });
    if (!booking) return res.status(404).json({ success: false, message: 'Confirmed booking on an assigned turf was not found.' });
    res.json({ success: true, data: booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to check in the booking.' }); }
});

app.post('/api/staff/bookings/:bookingId/complete', requireAuth, requireRole('staff'), async (req, res) => {
  try {
    const booking = await updateStaffBookingStatus({ bookingId: req.params.bookingId, staffId: req.user.id, status: 'completed' });
    if (!booking) return res.status(404).json({ success: false, message: 'Checked-in booking on an assigned turf was not found.' });
    res.json({ success: true, data: booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to complete the booking.' }); }
});

app.get('/api/admin/owners/pending', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const owners = await listPendingOwners();
    res.json({
      success: true,
      data: owners.map((owner) => ({
        id: owner.user_id || owner.id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
        businessName: owner.business_name,
        tradeLicenseNumber: owner.nid_or_trade_license,
        payoutMethod: owner.payout_method,
        payoutDetails: owner.payout_details,
        approvalStatus: owner.approval_status,
        reviewMessage: owner.review_message || '',
        documents: (owner.business_documents || []).map(({ id, document_type, file_name, mime_type }) => ({
          id, type: document_type, fileName: file_name, mimeType: mime_type,
          url: `/api/admin/owners/${owner.user_id || owner.id}/documents/${id}`,
        })),
      })),
    });
  } catch (error) {
    console.error('Pending owner query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load the owner review queue.' });
  }
});

app.get('/api/admin/owners/:ownerId/documents/:documentId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const document = await findOwnerDocument(req.params.ownerId, req.params.documentId);
    if (!document?.storage_key) return res.status(404).json({ success: false, message: 'Verification document not found.' });
    const filePath = path.resolve(privateDocumentDirectory, path.basename(document.storage_key));
    if (!filePath.startsWith(`${privateDocumentDirectory}${path.sep}`)) {
      return res.status(404).json({ success: false, message: 'Verification document not found.' });
    }
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(path.basename(document.file_name || 'verification-document'))}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ success: false, message: 'Unable to read verification document.' });
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ success: false, message: 'Verification document not found.' });
    console.error('Verification document read failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to read verification document.' });
  }
});

app.post('/api/admin/owners/:ownerId/review', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = String(req.body.decision || '');
  const reason = String(req.body.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'Decision must be approve or reject.' });
  }
  if (decision === 'reject' && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required when rejecting an owner.' });
  }
  try {
    const result = await reviewOwnerAccount({ ownerId: req.params.ownerId, adminId: req.user.id, approve: decision === 'approve', reason });
    if (!result) return res.status(404).json({ success: false, message: 'Pending owner account not found.' });
    if (result.missingDocument) return res.status(400).json({ success: false, message: 'A trade license document is required before approval.' });
    await notifyPlayer({
      userId: req.params.ownerId,
      type: 'approval',
      title: decision === 'approve' ? 'Account Approved!' : 'Account Review Update',
      message: decision === 'approve' ? 'Your turf owner account is verified. You can now list turfs.' : `Your turf owner application was not approved: ${reason}`,
      data: { eventKey: `owner-review-${req.params.ownerId}-${result.approvalStatus}`, screen: 'owner_dashboard' },
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Owner review action failed:', error.message);
    if (/monthly subscription amount/i.test(error.message)) return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: 'Unable to review owner account.' });
  }
});

app.post('/api/admin/owners/:ownerId/request-corrections', requireAuth, requireRole('admin'), async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 2000) return res.status(400).json({ success: false, message: 'Enter a correction message of 1 to 2000 characters.' });
  try {
    const result = await requestOwnerCorrections({ ownerId: req.params.ownerId, adminId: req.user.id, message });
    if (!result) return res.status(404).json({ success: false, message: 'Pending owner account not found.' });
    await notifyPlayer({ userId: req.params.ownerId, type: 'approval', title: 'Business verification needs an update', message: `Please update your business verification: ${message}`, data: { eventKey: `owner-correction-${crypto.randomUUID()}`, screen: 'owner_verification' } });
    res.json({ success: true, data: result });
  } catch (error) { console.error('Owner correction request failed:', error.message); res.status(500).json({ success: false, message: 'Unable to request owner corrections.' }); }
});

app.get('/api/open-matches', requireAuth, requireRole('player'), requireSquadsEnabled, async (req, res) => {
  try {
    const filters = {
      area: String(req.query.area || '').trim().slice(0, 120),
      sport: String(req.query.sport || '').trim().slice(0, 50),
      date: String(req.query.date || '').trim(),
      skill: String(req.query.skill || '').trim(),
    };
    if (filters.date && !/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) return res.status(400).json({ success: false, message: 'Choose a valid match date.' });
    if (filters.skill && !['casual', 'intermediate', 'competitive'].includes(filters.skill)) return res.status(400).json({ success: false, message: 'Choose a valid skill level.' });
    res.json({ success: true, data: await listOpenMatches(filters) });
  } catch (error) { console.error('Open Match list failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load Open Matches.' }); }
});
app.get('/api/open-match-participants', requireAuth, requireRole('player'), requireSquadsEnabled, async (req, res) => {
  try { res.json({ success: true, data: await listOpenMatchParticipants(req.user.id) }); }
  catch (error) { console.error('Open Match participants failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load Open Match participants.' }); }
});
app.post('/api/player/bookings/:bookingId/open-match', requireAuth, requireRole('player'), requireSquadsEnabled, async (req, res) => {
  const skillLevel = String(req.body.skillLevel || '');
  const maxPlayers = Number(req.body.maxPlayers);
  const notes = String(req.body.notes || '').trim();
  if (!['casual', 'intermediate', 'competitive'].includes(skillLevel)) return res.status(400).json({ success: false, message: 'Choose a valid skill level.' });
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 22) return res.status(400).json({ success: false, message: 'Total players must be a whole number between 2 and 22.' });
  if (notes.length > 1000) return res.status(400).json({ success: false, message: 'Notes must be 1000 characters or fewer.' });
  try {
    const match = await createOpenMatchForBooking({ bookingId: req.params.bookingId, captainId: req.user.id, skillLevel, maxPlayers, notes });
    if (match?.error === 'match_exists') return res.status(409).json({ success: false, message: 'This booking already has an Open Match.' });
    if (!match || match.error === 'booking_not_eligible') return res.status(400).json({ success: false, message: 'Only the booking owner can host a match for a confirmed booking whose start time is still in the future.' });
    res.status(201).json({ success: true, data: match });
  } catch (error) { console.error('Open Match creation failed:', error.message); res.status(500).json({ success: false, message: 'Unable to post this Open Match.' }); }
});

const tournamentCatalogHandler = async (req, res) => {
  try {
    const common = { sportType: String(req.query.sport || '') || undefined, area: String(req.query.area || '') || undefined };
    let tournaments;
    if (req.user.role === 'admin') tournaments = await listTournaments({ ...common, status: String(req.query.status || '') || undefined });
    else if (req.user.role === 'turf_owner') {
      const [publicTournaments, ownerTournaments] = await Promise.all([listTournaments({ ...common, status: 'open' }), listTournaments({ ...common, ownerId: req.user.id })]);
      tournaments = [...new Map([...publicTournaments, ...ownerTournaments].map((t) => [t.id,t])).values()];
    } else tournaments = await listTournaments({ ...common, status: 'open' });
    const children = await Promise.all(tournaments.map((t) => listTournamentChildren(t.id)));
    if (req.user.role === 'player') {
      for (const child of children) for (const team of child.teams) {
        team.rosterMembers = (team.rosterMembers || []).filter((member) => member.status !== 'pending' || member.playerId === req.user.id || team.captainId === req.user.id);
        team.rosterMembers = team.rosterMembers.map((member) => ({ ...member, ...(member.playerId === req.user.id || team.captainId === req.user.id ? {} : { playerId: undefined }) }));
      }
    }
    res.json({ success: true, data: { tournaments, teams: children.flatMap((c) => c.teams), matches: children.flatMap((c) => c.matches) } });
  } catch (error) { console.error('Tournament catalog failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load tournaments.' }); }
};
app.get('/api/tournaments/catalog', requireAuth, requireTournamentsEnabled, tournamentCatalogHandler);
app.get('/api/tournaments', requireTournamentsEnabled, async (_req,res) => {
  try {
    const publicStatuses = new Set(['open','registration_closed','ongoing','completed']);
    const tournaments = (await listTournaments()).filter((tournament) => publicStatuses.has(tournament.status)).slice(0,100).map((tournament) => ({
      id:tournament.id, turfId:tournament.turfId, turfName:tournament.turfName, name:tournament.name,
      sportType:tournament.sportType, format:tournament.format, startDate:tournament.startDate, endDate:tournament.endDate,
      maxTeams:tournament.maxTeams, entryFeeAmount:tournament.entryFeeAmount, prizePoolNote:tournament.prizePoolNote,
      status:tournament.status, description:tournament.description, createdAt:tournament.createdAt,
    }));
    res.json({success:true,data:tournaments});
  } catch (error) { console.error('Public tournament list failed:',error.message); res.status(500).json({success:false,message:'Unable to load tournaments.'}); }
});
app.get('/api/tournaments/:id', requireAuth, requireTournamentsEnabled, async (req, res) => {
  try {
    const tournament = (await listTournaments({ id: req.params.id }))[0];
    const ownerCanView = req.user.role === 'turf_owner' && (await listTournaments({ id: tournament?.id, ownerId: req.user.id })).length > 0;
    if (!tournament || (tournament.status !== 'open' && req.user.role !== 'admin' && !ownerCanView)) return res.status(404).json({ success: false, message: 'Tournament not found.' });
    const children = await listTournamentChildren(tournament.id);
    if (req.user.role === 'player') for (const team of children.teams) {
      team.rosterMembers = (team.rosterMembers || []).filter((member) => member.status !== 'pending' || member.playerId === req.user.id || team.captainId === req.user.id);
      team.rosterMembers = team.rosterMembers.map((member) => ({ ...member, ...(member.playerId === req.user.id || team.captainId === req.user.id ? {} : { playerId: undefined }) }));
    }
    res.json({ success: true, data: { ...tournament, ...children } });
  } catch (error) { console.error('Tournament detail failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load tournament.' }); }
});
app.post('/api/owner/tournaments', requireAuth, requireRole('turf_owner', 'admin'), requireTournamentsEnabled, async (req, res) => {
  try {
    if (req.user.role === 'turf_owner') {
      const profile = await findOwnerProfile(req.user.id);
      if (req.user.status !== 'active' || profile?.approval_status !== 'active') return res.status(403).json({ success: false, message: 'Owner account approval is required.' });
    }
    const name = String(req.body.name || '').trim(); const sportType = String(req.body.sportType || '').trim();
    const startDate = String(req.body.startDate || ''); const endDate = String(req.body.endDate || ''); const maxTeams = Number(req.body.maxTeams); const teamSize = Number(req.body.teamSize);
    if (!name || name.length > 150) return res.status(400).json({ success:false, message:'Enter a tournament name of 1 to 150 characters.' });
    if (!sportType || sportType.length > 50) return res.status(400).json({ success:false, message:'Choose a valid sport.' });
    const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
    if (!isValidDate(startDate) || !isValidDate(endDate)) return res.status(400).json({ success:false, message:'Choose valid start and end dates.' });
    if (endDate < startDate) return res.status(400).json({ success:false, message:'End date must be on or after the start date.' });
    if (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 10000) return res.status(400).json({ success:false, message:'Maximum teams must be a whole number of at least 2.' });
    if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 100) return res.status(400).json({ success:false,message:'Team roster size must be a whole number between 2 and 100, including the captain.' });
    const fee = req.body.entryFeeAmount == null ? undefined : Number(req.body.entryFeeAmount);
    if (fee !== undefined && (!Number.isFinite(fee) || fee < 0 || fee > 99999999)) return res.status(400).json({ success: false, message: 'Entry fee must be a non-negative amount.' });
    const tournament = await createTournament(req.user.id, { turfId: String(req.body.turfId || ''), name, sportType, format: String(req.body.format || '').slice(0, 50), startDate, endDate, maxTeams, teamSize, entryFeeAmount: fee, prizePoolNote: String(req.body.prizePoolNote || '').slice(0, 2000), description: String(req.body.description || '').slice(0, 5000), isAdmin: req.user.role === 'admin' });
    if (!tournament) return res.status(404).json({ success: false, message: 'Hosting turf not found or not managed by your account.' });
    res.status(201).json({ success: true, data: tournament });
  } catch (error) { console.error('Tournament creation failed:', error.message); res.status(500).json({ success: false, message: 'Unable to create tournament.' }); }
});
app.patch('/api/owner/tournaments/:id', requireAuth, requireRole('turf_owner', 'admin'), requireTournamentsEnabled, async (req, res) => {
  try {
    if (req.user.role === 'turf_owner') { const profile = await findOwnerProfile(req.user.id); if (req.user.status !== 'active' || profile?.approval_status !== 'active') return res.status(403).json({ success: false, message: 'Owner account approval is required.' }); }
    const { status: _requestedStatus, ...editableFields } = req.body;
    const updated = await updateTournament(req.params.id, req.user.id, { ...editableFields, isAdmin: req.user.role === 'admin' });
    if (!updated) return res.status(404).json({ success: false, message: 'Tournament not found or access denied.' });
    res.json({ success: true, data: updated });
  } catch (error) { console.error('Tournament update failed:', error.message); res.status(500).json({ success: false, message: 'Unable to update tournament.' }); }
});
app.post('/api/owner/tournaments/:id/resubmit', requireAuth, requireRole('turf_owner'), requireTournamentsEnabled, async (req, res) => {
  try {
    const profile = await findOwnerProfile(req.user.id);
    if (req.user.status !== 'active' || profile?.approval_status !== 'active') return res.status(403).json({ success: false, message: 'Owner account approval is required.' });
    const tournament = await resubmitTournament({ id:req.params.id, ownerId:req.user.id });
    if (!tournament) return res.status(409).json({ success:false, message:'Only a tournament with requested changes can be resubmitted by its owner.' });
    res.json({ success:true, data:tournament });
  } catch (error) { console.error('Tournament resubmission failed:', error.message); res.status(500).json({ success:false, message:'Unable to resubmit tournament.' }); }
});
app.get('/api/admin/tournaments/pending', requireAuth, requireRole('admin'), requireTournamentsEnabled, async (_req,res) => {
  try { res.json({ success:true, data:await listTournaments({ status:'pending_review' }) }); }
  catch (error) { console.error('Pending tournament review queue failed:',error.message); res.status(500).json({success:false,message:'Unable to load tournament review queue.'}); }
});
app.post('/api/admin/tournaments/:id/decision', requireAuth, requireRole('admin'), requireTournamentsEnabled, async (req,res) => {
  const decision = String(req.body.decision || ''); const message = String(req.body.message || '').trim();
  if (!['approve','request_changes'].includes(decision)) return res.status(400).json({success:false,message:'Choose approve or request changes.'});
  if (decision === 'request_changes' && (!message || message.length > 2000)) return res.status(400).json({success:false,message:'Enter a reason of 1 to 2000 characters.'});
  try {
    const tournament = await decideTournamentReview({id:req.params.id,adminId:req.user.id,decision,message});
    if (!tournament) return res.status(409).json({success:false,message:'Tournament is no longer awaiting admin review.'});
    res.json({success:true,data:tournament});
  } catch (error) { console.error('Tournament review decision failed:',error.message); res.status(500).json({success:false,message:'Unable to save tournament review decision.'}); }
});
app.post('/api/owner/tournaments/:id/cancel', requireAuth, requireRole('turf_owner', 'admin'), requireTournamentsEnabled, async (req, res) => {
  try {
    const updated = await updateTournament(req.params.id, req.user.id, { status: 'cancelled', isAdmin: req.user.role === 'admin' });
    if (!updated) return res.status(404).json({ success: false, message: 'Tournament not found or access denied.' });
    res.json({ success: true, data: updated });
  } catch (error) { console.error('Tournament cancellation failed:', error.message); res.status(500).json({ success: false, message: 'Unable to cancel tournament.' }); }
});
app.get('/api/tournaments/:id/player-search', requireAuth, requireRole('player'), requireTournamentsEnabled, async (req,res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2 || query.length > 60) return res.status(400).json({success:false,message:'Enter at least two characters to search.'});
  try {
    const tournament = (await listTournaments({id:req.params.id,status:'open'}))[0];
    if (!tournament || tournament.startDate <= new Date().toISOString().slice(0,10)) return res.status(404).json({success:false,message:'Tournament registration is unavailable.'});
    res.json({success:true,data:await searchTournamentPlayers(req.params.id,query)});
  } catch (error) { console.error('Tournament player search failed:',error.message); res.status(500).json({success:false,message:'Unable to search players.'}); }
});
app.post('/api/tournaments/:id/register', requireAuth, requireRole('player'), requireTournamentsEnabled, async (req, res) => {
  try {
    const teamName = String(req.body.teamName || '').trim(); const rosterNotes = String(req.body.rosterNotes || '').trim();
    if (!teamName || teamName.length > 100 || rosterNotes.length > 5000) return res.status(400).json({ success: false, message: 'Enter a team name (up to 100 characters) and roster notes up to 5000 characters.' });
    const members = Array.isArray(req.body.rosterMembers) ? req.body.rosterMembers : [];
    if (members.length > 99 || members.some((member) => {
      const playerInvite = typeof member?.playerId === 'string';
      const manualName = typeof member?.memberName === 'string' ? member.memberName.trim() : '';
      return playerInvite
        ? !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(member.playerId) || Boolean(member.memberName)
        : !manualName || manualName.length > 100;
    })) return res.status(400).json({success:false,message:'Fill each roster place with either a member name or an invited player.'});
    const team = await registerTournamentTeam(req.params.id, req.user.id, teamName, rosterNotes, members);
    if (team?.rosterSizeError) return res.status(400).json({success:false,message:`This tournament requires exactly ${team.rosterSizeError} players including you. Fill ${team.rosterSizeError - 1} teammate places.`});
    if (team?.rosterConflict) return res.status(409).json({success:false,message:'A selected player is unavailable or already on a team in this tournament.'});
    if (!team) return res.status(409).json({ success: false, message: 'Registration is closed, full, or unavailable for this tournament.' });
    res.status(201).json({ success: true, data: team });
  } catch (error) { const duplicate = /unique|duplicate/i.test(error.message); res.status(duplicate ? 409 : 500).json({ success: false, message: duplicate ? 'A team with that name is already registered.' : 'Unable to register team.' }); }
});
app.post('/api/tournaments/:tournamentId/invitations/:memberId/respond', requireAuth, requireRole('player'), requireTournamentsEnabled, async (req,res) => {
  const decision = String(req.body.decision || '');
  if (!['accept','decline'].includes(decision)) return res.status(400).json({success:false,message:'Choose accept or decline.'});
  try {
    const outcome = await respondTournamentInvitation({memberId:req.params.memberId,playerId:req.user.id,decision});
    if (outcome?.duplicate) return res.status(409).json({success:false,message:'You are already on another team in this tournament.'});
    if (!outcome) return res.status(404).json({success:false,message:'This invitation is no longer available.'});
    res.json({success:true,data:outcome});
  } catch (error) { console.error('Tournament invitation response failed:',error.message); res.status(500).json({success:false,message:'Unable to update the invitation.'}); }
});
app.delete('/api/tournaments/:tournamentId/teams/:teamId', requireAuth, requireRole('player','turf_owner','admin'), requireTournamentsEnabled, async (req,res) => {
  try {
    const removed = await withdrawTournamentTeam({tournamentId:req.params.tournamentId,teamId:req.params.teamId,actorId:req.user.id,actorRole:req.user.role});
    if (!removed) return res.status(404).json({success:false,message:'Team was not found or you cannot withdraw it.'});
    res.json({success:true,data:{teamId:req.params.teamId,status:'withdrawn'}});
  } catch (error) { console.error('Tournament team withdrawal failed:',error.message); res.status(500).json({success:false,message:'Unable to withdraw team.'}); }
});

app.get('/api/turfs', async (req, res) => {
  try {
    const filters = {
      search: String(req.query.search || '').slice(0, 120),
      area: String(req.query.area || '').slice(0, 120),
      city: String(req.query.city || '').slice(0, 120),
      sport: String(req.query.sport || '').slice(0, 60),
    };
    for (const [key, maximum] of [['minPrice', 1000000], ['maxPrice', 1000000], ['minRating', 5]]) {
      if (req.query[key] !== undefined) {
        const value = Number(req.query[key]);
        if (!Number.isFinite(value) || value < 0 || value > maximum) return res.status(400).json({ success: false, message: `Invalid ${key} filter.` });
        filters[key] = value;
      }
    }
    const rows = await listPublicTurfs(filters);

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(normalizeTurf),
    });
  } catch (error) {
    console.error('Public turf query failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Unable to query turfs table.',
    });
  }
});

const parseHomeTurfsFilters = (req) => {
  const filters = {
    search: String(req.query.search || '').slice(0, 120),
    area: String(req.query.area || '').slice(0, 120),
    city: String(req.query.city || '').slice(0, 120),
    sport: String(req.query.sport || '').slice(0, 60),
  };
  const minPrice = req.query.price_min;
  const maxPrice = req.query.price_max;
  const minRating = req.query.rating_min;
  if (minPrice !== undefined) {
    const value = Number(minPrice);
    if (!Number.isFinite(value) || value < 0 || value > 1000000) throw Object.assign(new Error('Invalid price_min filter.'), { status: 400 });
    filters.minPrice = value;
  }
  if (maxPrice !== undefined) {
    const value = Number(maxPrice);
    if (!Number.isFinite(value) || value < 0 || value > 1000000) throw Object.assign(new Error('Invalid price_max filter.'), { status: 400 });
    filters.maxPrice = value;
  }
  if (minRating !== undefined) {
    const value = Number(minRating);
    if (!Number.isFinite(value) || value < 0 || value > 5) throw Object.assign(new Error('Invalid rating_min filter.'), { status: 400 });
    filters.minRating = value;
  }
  return filters;
};

const paginateHomeTurfs = (items, { page, limit }) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 12;
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;
  const sliced = items.slice(start, start + safeLimit);
  return {
    items: sliced,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      next: safePage < totalPages ? `/api/home/all-turfs?page=${safePage + 1}&limit=${safeLimit}` : null,
      prev: safePage > 1 ? `/api/home/all-turfs?page=${safePage - 1}&limit=${safeLimit}` : null,
    },
  };
};

const sortTurfsForHome = (rows, sort = 'relevance', lat, lng) => {
  const sorted = [...rows];
  switch (sort) {
    case 'price_asc':
      sorted.sort((a, b) => Number(a.basePricePerHour || 0) - Number(b.basePricePerHour || 0));
      break;
    case 'price_desc':
      sorted.sort((a, b) => Number(b.basePricePerHour || 0) - Number(a.basePricePerHour || 0));
      break;
    case 'rating_desc':
      sorted.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
      break;
    case 'newest':
      sorted.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      break;
    case 'distance':
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        sorted.sort((a, b) => {
          const da = Math.hypot(Number(a.latitude || 0) - lat, Number(a.longitude || 0) - lng);
          const db = Math.hypot(Number(b.latitude || 0) - lat, Number(b.longitude || 0) - lng);
          return da - db;
        });
      }
      break;
    default:
      sorted.sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
      break;
  }
  return sorted;
};

app.get('/api/home/featured-turfs', async (_req, res) => {
  try {
    const rows = await listPublicTurfs({});
    res.json({ success: true, data: rows.slice(0, 6).map(normalizeTurf) });
  } catch (error) {
    console.error('Featured turf home query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load featured turfs.' });
  }
});

app.get('/api/home/trending-turfs', async (_req, res) => {
  try {
    const rows = await listPublicTurfs({});
    const data = rows
      .map(normalizeTurf)
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0))
      .slice(0, 6);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Trending turf home query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load trending turfs.' });
  }
});

app.get('/api/home/nearby-turfs', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ success: false, message: 'lat and lng query parameters are required.' });
  try {
    const rows = await listPublicTurfs({});
    const normalized = rows.map(normalizeTurf);
    const nearby = normalized
      .filter((turf) => turf.latitude && turf.longitude)
      .map((turf) => ({ ...turf, distanceKm: Math.hypot(turf.latitude - lat, turf.longitude - lng) }))
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))
      .slice(0, 6);
    res.json({ success: true, data: nearby });
  } catch (error) {
    console.error('Nearby turf home query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load nearby turfs.' });
  }
});

app.get('/api/home/all-turfs', async (req, res) => {
  try {
    const filters = parseHomeTurfsFilters(req);
    const sort = String(req.query.sort || 'relevance');
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const page = Number(req.query.page || '1');
    const limit = Number(req.query.limit || '12');
    const rows = sortTurfsForHome(await listPublicTurfs(filters), sort, Number.isFinite(lat) ? lat : undefined, Number.isFinite(lng) ? lng : undefined);
    const { items, pagination } = paginateHomeTurfs(rows.map(normalizeTurf), { page, limit });
    res.json({ success: true, data: { items, pagination } });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) || 500 : 500;
    console.error('Home turf discovery query failed:', error.message || error);
    res.status(status).json({ success: false, message: error.message || 'Unable to load turfs.' });
  }
});


const normalizeTurfInput = (body) => {
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const basePricePerHour = Number(body.basePricePerHour);
  const uniqueListingValues = (values) => [...new Map(values.map(String).map((value) => value.trim()).filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()];
  const sportTypes = Array.isArray(body.sportTypes) ? uniqueListingValues(body.sportTypes) : [];
  const amenities = Array.isArray(body.amenities) ? uniqueListingValues(body.amenities) : [];
  const photos = Array.isArray(body.photos) ? body.photos.map(String).map((value) => value.trim()).filter(Boolean) : [];
  const pricingRules = Array.isArray(body.pricingRules) ? body.pricingRules : [];
  const operatingHours = body.operatingHours && typeof body.operatingHours === 'object' && !Array.isArray(body.operatingHours)
    ? body.operatingHours : { openTime: '07:00', closeTime: '23:00' };
  const validOpenClock = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value));
  const validCloseClock = (value) => validOpenClock(value) || String(value) === '24:00';
  const dayHours = operatingHours.days && typeof operatingHours.days === 'object' ? operatingHours.days : operatingHours;
  const definedDayHours = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .map((day) => dayHours[day]).filter(Boolean);
  const hoursToValidate = definedDayHours.length ? definedDayHours : [operatingHours];
  if (hoursToValidate.some((hours) => hours.closed !== true && (!validOpenClock(hours.openTime || '07:00') || !validCloseClock(hours.closeTime || '23:00')))) {
    return { error: 'Operating hours must use valid HH:MM opening and closing times.' };
  }
  for (const hours of Object.values(dayHours)) {
    if (!Array.isArray(hours?.slots)) continue;
    const slots = hours.slots.map((slot) => ({ start: String(slot.startTime || ''), end: String(slot.endTime || '') }))
      .sort((a, b) => a.start.localeCompare(b.start));
    let previousEnd = -1;
    for (const slot of slots) {
      const validSlotTime = (value, allow24 = false) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value) || (allow24 && value === '24:00');
      if (!validSlotTime(slot.start) || !validSlotTime(slot.end, true)) return { error: 'Configured slots must use half-hour time boundaries.' };
      const toMinutes = (value) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      if (end - start !== 60 || start < previousEnd) return { error: 'Configured slots must be one hour long and may not overlap.' };
      previousEnd = end;
    }
  }
  const isValidCalendarDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const dateRanges = operatingHours.dateRanges;
  if (dateRanges !== undefined && !Array.isArray(dateRanges)) return { error: 'Date-range availability must be a list.' };
  const validatedDateRanges = (dateRanges || []).map((range) => {
    if (!range || !isValidCalendarDate(String(range.startDate || '')) || !isValidCalendarDate(String(range.endDate || '')) ||
        range.startDate > range.endDate || !Array.isArray(range.slots)) return null;
    const slots = range.slots.map((slot) => ({ startTime: String(slot?.startTime || ''), endTime: String(slot?.endTime || '') }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    let previousEnd = -1;
    for (const slot of slots) {
      const validSlotTime = (value, allow24 = false) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value) || (allow24 && value === '24:00');
      if (!validSlotTime(slot.startTime) || !validSlotTime(slot.endTime, true)) return null;
      const toMinutes = (value) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      if (end - start !== 60 || start < previousEnd) return null;
      previousEnd = end;
    }
    return { startDate: range.startDate, endDate: range.endDate, slots };
  });
  if (validatedDateRanges.some((range) => !range)) return { error: 'Date-range schedules must contain valid, non-overlapping one-hour slots.' };
  const sortedDateRanges = [...validatedDateRanges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 1; index < sortedDateRanges.length; index += 1) {
    if (sortedDateRanges[index].startDate <= sortedDateRanges[index - 1].endDate) return { error: 'Date-range schedules may not overlap.' };
  }
  const dhakaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  const dateLimit = new Date(`${dhakaToday}T00:00:00Z`);
  dateLimit.setUTCDate(dateLimit.getUTCDate() + 365);
  const latestScheduleDate = dateLimit.toISOString().slice(0, 10);
  if (sortedDateRanges.some((range) => range.endDate >= dhakaToday && range.endDate > latestScheduleDate)) {
    return { error: 'Date-range schedules cannot extend more than 365 days into the future.' };
  }
  if (!name || !address || !Number.isFinite(basePricePerHour) || basePricePerHour <= 0 || sportTypes.length === 0) {
    return { error: 'Turf name, address, positive hourly price, and at least one sport type are required.' };
  }
  if (photos.some((url) => !/^https?:\/\//i.test(url))) return { error: 'Turf photos must be HTTP or HTTPS URLs.' };
  if (sportTypes.length > 50 || amenities.length > 50 || [...sportTypes, ...amenities].some((value) => value.length > 60)) return { error: 'Sports and amenities must contain at most 50 unique values, each no longer than 60 characters.' };
  const validatedRules = [];
  for (const rule of pricingRules) {
    const label = String(rule.label || 'Shift').trim();
    const isSpecialDate = rule.date != null && String(rule.date).trim() !== '';
    const hasWeekday = rule.dayOfWeek != null && String(rule.dayOfWeek).trim() !== '';
    const date = isSpecialDate ? String(rule.date).trim() : null;
    const dateIsValid = !isSpecialDate || (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date);
    const timeIsValid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(rule.startTime)) && (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(rule.endTime)) || String(rule.endTime) === '24:00');
    const dayOfWeek = Number(rule.dayOfWeek);
    if (isSpecialDate === hasWeekday || (!isSpecialDate && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) || !dateIsValid || !timeIsValid ||
        String(rule.endTime) <= String(rule.startTime) || !label || label.length > 60 || !Number.isFinite(Number(rule.pricePerHour)) || Number(rule.pricePerHour) <= 0) {
      return { error: 'Every pricing override must have a valid weekday or exact date, a positive time range, and a positive price.' };
    }
    validatedRules.push({ id: crypto.randomUUID(), label, dayOfWeek: isSpecialDate ? null : dayOfWeek, date, startTime: String(rule.startTime), endTime: String(rule.endTime), pricePerHour: Number(rule.pricePerHour) });
  }
  for (let index = 0; index < validatedRules.length; index += 1) {
    const rule = validatedRules[index];
    const sameSchedule = validatedRules.slice(0, index).filter((other) => other.date === rule.date && other.dayOfWeek === rule.dayOfWeek);
    if (sameSchedule.some((other) => rule.startTime < other.endTime && other.startTime < rule.endTime)) return { error: 'Pricing ranges at the same priority cannot overlap.' };
  }
  return {
    value: {
      name, description: String(body.description || '').trim(), address,
      area: String(body.area || '').trim(), city: String(body.city || '').trim(),
      latitude: body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude == null ? null : Number(body.longitude),
      sportTypes, amenities, photos,
      basePricePerHour,
      operatingHours: { ...operatingHours, ...(dateRanges !== undefined ? { dateRanges: sortedDateRanges } : {}) },
      pricingRules: validatedRules,
    },
  };
};

app.get('/api/turfs/:turfId/availability', async (req, res) => {
  const date = String(req.query.date || '');
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ success: false, message: 'A date in YYYY-MM-DD format is required.' });
  }
  try {
    const turf = await getTurf(req.params.turfId);
    if (!turf || turf.status !== 'active' || turf.deleted_at) {
      return res.status(404).json({ success: false, message: 'Turf not found.' });
    }
    const slots = await listAvailability(turf.id, date);
    res.json({ success: true, data: slots });
  } catch (error) {
    console.error('Availability query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load turf availability.' });
  }
});

app.get('/api/turfs/:turfId', async (req, res) => {
  try {
    const turf = await getTurf(req.params.turfId);
    if (!turf || turf.status !== 'active' || turf.deleted_at) {
      return res.status(404).json({ success: false, message: 'Turf not found.' });
    }
    res.json({ success: true, data: normalizeTurf(turf) });
  } catch (error) {
    console.error('Turf detail query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load turf details.' });
  }
});

app.get('/api/turfs/:turfId/reviews', async (req, res) => {
  try {
    const turf = await getTurf(req.params.turfId);
    if (!turf || turf.status !== 'active') return res.status(404).json({ success: false, message: 'Turf not found.' });
    res.json({ success: true, data: await listTurfReviews(turf.id) });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to load turf reviews.' }); }
});

app.get('/api/owner/turfs', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const turfs = await listOwnerTurfs(req.user.id);
    const previousNotifications = await listUserNotifications(req.user.id);
    const existingEvents = new Set(previousNotifications.map((item) => item.data?.eventKey).filter(Boolean));
    for (const turf of turfs) {
      const days = turf.operating_hours?.days || {};
      const hasWeeklySlots = Object.values(days).some((day) => Array.isArray(day?.slots) && day.slots.length > 0);
      const eventKey = `turf-schedule-required-${turf.id}`;
      if (!hasWeeklySlots && !existingEvents.has(eventKey)) await notifyPlayer({
        userId: req.user.id,
        type: 'system',
        title: 'Create your turf availability',
        message: `Your turf "${turf.name}" needs at least one saved weekly time slot before players can see it. Open Slot Availability to create its schedule.`,
        data: { eventKey, screen: 'owner_slots', turfId: turf.id },
      });
    }
    res.json({ success: true, data: turfs.map(normalizeTurf) });
  } catch (error) {
    console.error('Owner turf list failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load your turfs.' });
  }
});

app.post('/api/owner/turfs/:turfId/removal-request', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const reason = String(req.body.reason || 'Owner requested permanent turf removal.').trim();
  if (reason.length > 1000) return res.status(400).json({ success: false, message: 'Removal reason must be 1,000 characters or fewer.' });
  try {
    const request = await requestTurfRemoval({ ownerId: req.user.id, turfId: req.params.turfId, reason });
    res.status(201).json({ success: true, data: request, message: 'Turf hidden from players. Your removal request is awaiting admin review.' });
  } catch (error) {
    const expected = /only an active turf|already pending/i.test(error.message);
    if (!expected) console.error('Turf removal request failed:', error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to submit the turf removal request.' });
  }
});

app.get('/api/owner/bookings', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const date = String(req.query.date || '');
  const status = String(req.query.status || '');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Date must use YYYY-MM-DD.' });
  if (status && !['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid booking status filter.' });
  try { res.json({ success: true, data: await listBookingsForOwner(req.user.id, { date, status }) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load your bookings.' }); }
});

app.get('/api/owner/reports', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const isValidDate = (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  if (!isValidDate(from) || !isValidDate(to) || (from && to && from > to)) return res.status(400).json({ success: false, message: 'Choose a valid report date range.' });
  try { res.json({ success: true, data: await ownerRevenueReport(req.user.id, { from: from || undefined, to: to || undefined }) }); }
  catch (error) { console.error('Owner revenue report failed:', error.message); res.status(500).json({ success: false, message: 'Unable to generate your report.' }); }
});

app.post('/api/owner/bookings/:bookingId/check-in', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const booking = await updateOwnerBookingStatus({ bookingId: req.params.bookingId, ownerId: req.user.id, status: 'checked_in' });
    if (!booking) return res.status(409).json({ success: false, message: 'Confirmed booking on a turf you own was not found.' });
    return res.json({ success: true, data: booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to check in this booking.' }); }
});
app.post('/api/owner/bookings/:bookingId/complete', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const booking = await updateOwnerBookingStatus({ bookingId: req.params.bookingId, ownerId: req.user.id, status: 'completed' });
    if (!booking) return res.status(409).json({ success: false, message: 'Checked-in booking on a turf you own was not found.' });
    return res.json({ success: true, data: booking });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to complete this booking.' }); }
});

const slotBlockHandler = (blocked) => async (req, res) => {
  const date = String(req.body.date || '');
  const startTime = String(req.body.startTime || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({ success: false, message: 'Provide a slot date and start time.' });
  }
  try {
    const slot = await setSlotBlocked({ turfId: req.params.turfId, date, startTime, blocked, actorId: req.user.id, actorRole: req.user.role });
    if (!slot) return res.status(409).json({ success: false, message: 'Available slot or permission was not found.' });
    return res.json({ success: true, data: slot });
  } catch (error) {
    console.error('Slot availability update failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update this slot.' });
  }
};
app.post('/api/owner/turfs/:turfId/slots/block', requireAuth, requireRole('turf_owner'), requireApprovedOwner, slotBlockHandler(true));
app.post('/api/owner/turfs/:turfId/slots/unblock', requireAuth, requireRole('turf_owner'), requireApprovedOwner, slotBlockHandler(false));
app.post('/api/staff/turfs/:turfId/slots/block', requireAuth, requireRole('staff'), slotBlockHandler(true));
app.post('/api/staff/turfs/:turfId/slots/unblock', requireAuth, requireRole('staff'), slotBlockHandler(false));

app.get('/api/owner/staff', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try { res.json({ success: true, data: await listOwnerStaff(req.user.id) }); }
  catch (error) { res.status(500).json({ success: false, message: 'Unable to load staff assignments.' }); }
});

const staffPermissionKeys = new Set(['bookings.view', 'bookings.view_player_contact', 'bookings.check_in', 'bookings.complete', 'bookings.cancel', 'bookings.create_manual', 'slots.view', 'slots.block', 'slots.unblock']);
app.post('/api/owner/staff', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const turfIds = Array.isArray(req.body.turfIds) ? [...new Set(req.body.turfIds.map(String))] : [];
  const permissions = Array.isArray(req.body.permissions) ? [...new Set(req.body.permissions.map(String))] : [];
  if (!name || name.length > 150 || !/^\S+@\S+\.\S+$/.test(email) || !phone || phone.length > 50 || turfIds.length < 1 || turfIds.length > 25 || permissions.some((permission) => !staffPermissionKeys.has(permission))) {
    return res.status(400).json({ success: false, message: 'Provide staff name, valid email, phone, owned turf assignments, and supported permissions.' });
  }
  const smtpConfig = await getActiveSmtpConfig().catch(() => null);
  if (!smtpConfig) {
    return res.status(503).json({ success: false, message: 'Staff invitations require email delivery to be configured.' });
  }
  const temporaryPassword = crypto.randomBytes(18).toString('base64url');
  let result;
  try {
    result = await createStaffAccountAndAssignments({
      ownerId: req.user.id, staff: { name, email, phone }, turfIds, permissions,
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
    });
    let invitationEmailSent = false;
    const transport = createSmtpTransport(smtpConfig);
    await transport.sendMail({
      from: `"${smtpConfig.fromName || 'TurfySlot'}" <${smtpConfig.fromEmail}>`,
      to: email,
      subject: 'Your Turfyslot staff account',
      text: result.created
        ? `Hello ${name},\r\n\r\nYour staff account has been created. Sign in with ${email} and the temporary password below. Change it after your first sign-in.\r\n\r\nTemporary password: ${temporaryPassword}\r\n\r\nYour owner assigned the turf duties listed in your dashboard. Keep this password private.`
        : `Hello ${name},\r\n\r\nYour Turfyslot staff permissions have been updated for one or more of your assigned turfs.`,
      html: renderBrandedEmail({
        preheader: result.created ? 'Your staff access is ready.' : 'Your staff permissions were updated.',
        title: result.created ? 'Welcome to the turf team' : 'Staff access updated',
        body: result.created
          ? `<p style=\"margin:0 0 16px\">Hello ${escapeHtml(name)}, your staff account is ready.</p><p style=\"margin:0 0 12px\">Sign in with the details below, then change your temporary password after your first sign-in.</p><div style=\"background:#f1f7ef;border:1px solid #d8e8d4;border-radius:12px;padding:16px;margin:16px 0\"><p style=\"margin:0 0 8px\"><strong>Email:</strong> ${escapeHtml(email)}</p><p style=\"margin:0\"><strong>Temporary password:</strong> <span style=\"font-family:monospace\">${escapeHtml(temporaryPassword)}</span></p></div><p style=\"margin:0\">Your owner assigned your turf duties in the dashboard. Keep this password private.</p>`
          : `<p style=\"margin:0\">Hello ${escapeHtml(name)}, your staff permissions have been updated for one or more of your assigned turfs. Sign in to see your current access.</p>`,
      }),
    });
    invitationEmailSent = true;
    if (result.created) await issueAuthCodeForUser(result.user, 'email_verification').catch(() => 'unavailable');
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: { staff: result.user, turfIds, permissions, invitationEmailSent },
    });
  } catch (error) {
    if (result?.created) {
      try {
        await revokeOwnerStaffAccess({ ownerId: req.user.id, staffId: result.user.id });
        await deleteUnassignedStaffUser(result.user.id);
      } catch (cleanupError) { console.error('Staff invitation rollback failed:', cleanupError.message); }
    }
    if (result?.created && error?.code !== '23505' && error?.code !== 11000) {
      return res.status(503).json({ success: false, message: 'Staff account was not created because the invitation email could not be delivered.' });
    }
    if (result && !result.created) {
      return res.json({ success: true, data: { staff: result.user, turfIds, permissions, invitationEmailSent: false } });
    }
    const expected = /owner|turf|permission|email|staff account|assigned/i.test(error.message);
    res.status(expected ? 400 : 500).json({ success: false, message: expected ? error.message : 'Unable to create staff access.' });
  }
});

app.delete('/api/owner/staff/:staffId', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const turfIds = await revokeOwnerStaffAccess({ ownerId: req.user.id, staffId: req.params.staffId });
    if (!turfIds.length) return res.status(404).json({ success: false, message: 'No staff assignments were found for your turfs.' });
    res.json({ success: true, data: { staffId: req.params.staffId, revokedTurfIds: turfIds } });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to revoke staff access.' }); }
});

app.delete('/api/owner/staff/:staffId/turfs/:turfId', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  try {
    const turfIds = await revokeOwnerStaffAccess({ ownerId: req.user.id, staffId: req.params.staffId, turfId: req.params.turfId });
    if (!turfIds.length) return res.status(404).json({ success: false, message: 'Staff assignment was not found for this turf.' });
    res.json({ success: true, data: { staffId: req.params.staffId, revokedTurfIds: turfIds } });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to revoke this staff assignment.' }); }
});

const manualBookingPayload = (req) => ({
  actorId: req.user.id,
  actorRole: req.user.role,
  turfId: String(req.body.turfId || ''),
  date: String(req.body.date || ''),
  startTime: String(req.body.startTime || ''),
  durationHours: Number(req.body.durationHours),
  customerName: String(req.body.customerName || '').trim(),
  customerPhone: String(req.body.customerPhone || '').trim(),
  customerEmail: String(req.body.customerEmail || '').trim(),
  paymentMethod: String(req.body.paymentMethod || ''),
  paymentStatus: String(req.body.paymentStatus || 'pending'),
  paymentAmount: req.body.paymentAmount,
  paymentReference: String(req.body.paymentReference || '').trim(),
  notes: String(req.body.notes || '').trim(),
  idempotencyKey: String(req.get('Idempotency-Key') || '').trim(),
});

const createManualBookingHandler = async (req, res) => {
  const input = manualBookingPayload(req);
  if (input.customerEmail && !/^\S+@\S+\.\S+$/.test(input.customerEmail)) return res.status(400).json({ success: false, message: 'Customer email is invalid.' });
  if (input.paymentReference.length > 255 || input.notes.length > 2000) return res.status(400).json({ success: false, message: 'Payment reference or notes are too long.' });
  try {
    await expirePendingBookingHolds();
    const booking = await createManualBooking(input);
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    const expected = /valid|required|duration|date|time|payment|availability|consecutive|available|owner|permission|Idempotency|amount|turf/i.test(error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to create manual booking.' });
  }
};
app.post('/api/owner/bookings/manual', requireAuth, requireRole('turf_owner'), requireApprovedOwner, createManualBookingHandler);
app.post('/api/staff/bookings/manual', requireAuth, requireRole('staff'), createManualBookingHandler);

app.post('/api/owner/turfs', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const parsed = normalizeTurfInput(req.body);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const turf = await createTurf(req.user.id, parsed.value);
    await notifyPlayer({
      userId: req.user.id,
      type: 'system',
      title: 'Create your turf availability',
      message: `Your turf "${turf.name}" has been submitted. Add at least one weekly time slot in Slot Availability; players will not see the turf until you save its schedule and the listing is approved.`,
      data: { eventKey: `turf-schedule-required-${turf.id}`, screen: 'owner_slots', turfId: turf.id },
    });
    res.status(201).json({ success: true, message: 'Turf submitted for admin review.', data: normalizeTurf(turf) });
  } catch (error) {
    console.error('Turf submission failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to submit turf.' });
  }
});

app.put('/api/owner/turfs/:turfId', requireAuth, requireRole('turf_owner'), requireApprovedOwner, async (req, res) => {
  const parsed = normalizeTurfInput(req.body);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const turf = await updateOwnerTurf(req.user.id, req.params.turfId, parsed.value);
    if (!turf) return res.status(404).json({ success: false, message: 'Turf not found.' });
    res.json({ success: true, data: normalizeTurf(turf) });
  } catch (error) {
    console.error('Turf update failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to update turf.' });
  }
});

app.get('/api/owner/turfs/:turfId/addons', requireAuth, requireRole('turf_owner'), requireApprovedOwner, requireAddonsEnabled, async (req, res) => {
  try {
    const rows = await listOwnerTurfAddons(req.user.id, req.params.turfId);
    if (!rows) return res.status(404).json({ success: false, message: 'Turf not found.' });
    res.json({ success: true, data: rows.map(normalizeTurfAddon) });
  } catch (error) { console.error('Turf add-on query failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load turf add-ons.' }); }
});

app.post('/api/owner/turfs/:turfId/addons', requireAuth, requireRole('turf_owner'), requireApprovedOwner, requireAddonsEnabled, async (req, res) => {
  const parsed = parseTurfAddonInput(req.body);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const addon = await createOwnerTurfAddon(req.user.id, req.params.turfId, parsed.value);
    if (!addon) return res.status(404).json({ success: false, message: 'Turf not found.' });
    res.status(201).json({ success: true, data: normalizeTurfAddon(addon) });
  } catch (error) { console.error('Turf add-on creation failed:', error.message); res.status(500).json({ success: false, message: 'Unable to create turf add-on.' }); }
});

app.patch('/api/owner/turfs/:turfId/addons/:addonId', requireAuth, requireRole('turf_owner'), requireApprovedOwner, requireAddonsEnabled, async (req, res) => {
  const parsed = parseTurfAddonInput(req.body);
  if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
  try {
    const addon = await updateOwnerTurfAddon(req.user.id, req.params.turfId, req.params.addonId, parsed.value);
    if (!addon) return res.status(404).json({ success: false, message: 'Turf add-on not found.' });
    res.json({ success: true, data: normalizeTurfAddon(addon) });
  } catch (error) { console.error('Turf add-on update failed:', error.message); res.status(500).json({ success: false, message: 'Unable to update turf add-on.' }); }
});

app.delete('/api/owner/turfs/:turfId/addons/:addonId', requireAuth, requireRole('turf_owner'), requireApprovedOwner, requireAddonsEnabled, async (req, res) => {
  try {
    const deleted = await deleteOwnerTurfAddon(req.user.id, req.params.turfId, req.params.addonId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Turf add-on not found.' });
    res.json({ success: true });
  } catch (error) { console.error('Turf add-on deletion failed:', error.message); res.status(500).json({ success: false, message: 'Unable to delete turf add-on.' }); }
});

app.post('/api/owner/turfs/:turfId/photos', requireAuth, requireRole('turf_owner'), requireApprovedOwner,
  parsePublicImageUpload(publicImageUpload.array('photos', 5)), async (req, res) => {
    const files = req.files || [];
    const removeUploadedFiles = () => Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
    if (!files.length) return res.status(400).json({ success: false, message: 'Choose at least one turf photo.' });
    try {
      for (const file of files) {
        if (!await verifyPublicImageSignature(file)) {
          await removeUploadedFiles();
          return res.status(400).json({ success: false, message: 'An uploaded file does not contain a valid JPEG, PNG, or WEBP image.' });
        }
      }
      const row = await getTurf(req.params.turfId, { publicOnly: false });
      if (!row || row.owner_id !== req.user.id) {
        await removeUploadedFiles();
        return res.status(404).json({ success: false, message: 'Turf not found.' });
      }
      const photoUrls = files.map((file) => publicImageUrl(req, 'turf-photos', file.filename));
      const parsed = normalizeTurfInput({ ...normalizeTurf(row), photos: photoUrls });
      if (parsed.error) {
        await removeUploadedFiles();
        return res.status(400).json({ success: false, message: parsed.error });
      }
      const updated = await updateOwnerTurf(req.user.id, req.params.turfId, parsed.value);
      if (!updated) {
        await removeUploadedFiles();
        return res.status(404).json({ success: false, message: 'Turf not found.' });
      }
      res.json({ success: true, data: normalizeTurf(updated) });
    } catch (error) {
      await removeUploadedFiles();
      console.error('Turf photo upload failed:', error.message);
      res.status(500).json({ success: false, message: 'Unable to update turf photos.' });
    }
  }
);

app.get('/api/admin/turfs/pending', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const turfs = await listPendingTurfs();
    res.json({ success: true, data: turfs.map(normalizeTurf) });
  } catch (error) {
    console.error('Pending turf query failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load the turf review queue.' });
  }
});

app.post('/api/admin/turfs/:turfId/corrections', requireAuth, requireRole('admin'), async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, message: 'Enter a correction message of 1 to 2,000 characters.' });
  }
  try {
    const turf = await requestTurfCorrections({ turfId: req.params.turfId, adminId: req.user.id, message });
    if (!turf) return res.status(404).json({ success: false, message: 'Pending turf not found.' });
    await notifyPlayer({
      userId: turf.owner_id,
      type: 'approval',
      title: `Corrections requested for ${turf.name}`,
      message: `Please update your turf listing using the owner dashboard before it can be approved.\n\n${message}`,
      data: { eventKey: `turf-corrections-${turf.id}-${crypto.randomUUID()}`, turfId: turf.id },
    });
    res.json({ success: true, data: normalizeTurf(turf) });
  } catch (error) {
    console.error('Turf correction request failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to request turf corrections.' });
  }
});

app.get('/api/admin/turf-removal-requests', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    res.json({ success: true, data: await listPendingTurfRemovalRequests() });
  } catch (error) {
    console.error('Turf removal queue load failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load turf removal requests.' });
  }
});

app.post('/api/admin/turf-removal-requests/:requestId/decision', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = String(req.body.decision || '');
  const reason = String(req.body.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, message: 'Decision must be approve or reject.' });
  if (decision === 'reject' && !reason) return res.status(400).json({ success: false, message: 'A reason is required when rejecting a removal request.' });
  if (reason.length > 1000) return res.status(400).json({ success: false, message: 'Decision reason must be 1,000 characters or fewer.' });
  try {
    const request = await decideTurfRemovalRequest({ requestId: req.params.requestId, adminId: req.user.id, decision, reason });
    await notifyPlayer({
      userId: request.owner_id,
      type: 'approval',
      title: decision === 'approve' ? 'Turf removal approved' : 'Turf removal request rejected',
      message: decision === 'approve'
        ? 'Your turf removal request was approved.'
        : `Your turf removal request was rejected: ${reason}`,
      data: { eventKey: `turf-removal-${request.id}-${decision}`, turfId: request.turf_id },
    });
    res.json({ success: true, data: request });
  } catch (error) {
    const expected = /pending turf removal request not found/i.test(error.message);
    if (!expected) console.error('Turf removal decision failed:', error.message);
    res.status(expected ? 404 : 500).json({ success: false, message: expected ? error.message : 'Unable to process the turf removal request.' });
  }
});

app.post('/api/admin/turfs/:turfId/review', requireAuth, requireRole('admin'), async (req, res) => {
  const decision = String(req.body.decision || '');
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'Decision must be approve or reject.' });
  }
  try {
    const turf = await setTurfReviewStatus(req.params.turfId, decision === 'approve' ? 'active' : 'inactive');
    if (!turf) return res.status(404).json({ success: false, message: 'Pending turf not found.' });
    await notifyPlayer({
      userId: turf.owner_id,
      type: 'approval',
      title: decision === 'approve' ? 'Turf Approved!' : 'Turf Review Update',
      message: decision === 'approve' ? `Your turf "${turf.name}" is now live and publicly bookable.` : `Your turf "${turf.name}" was not approved.`,
      data: { eventKey: `turf-review-${turf.id}-${decision}`, turfId: turf.id },
    });
    res.json({ success: true, data: normalizeTurf(turf) });
  } catch (error) {
    console.error('Turf review action failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to review turf.' });
  }
});

const normalizeBooking = (row) => ({
  id: row.id,
  bookingNumber: row.booking_number,
  playerId: row.player_id || undefined,
  customerName: row.customer_name || row.player_name || '',
  customerPhone: row.customer_phone || row.player_phone || '',
  customerEmail: row.player_email || '',
  turfId: row.turf_id,
  turfName: row.turf_name || '',
  date: row.booking_date instanceof Date ? row.booking_date.toISOString().slice(0, 10) : String(row.booking_date || '').slice(0, 10),
  startTime: String(row.start_time || '').slice(0, 5),
  endTime: String(row.end_time || '').slice(0, 5),
  totalHours: Number(row.total_hours || 1),
  bookingSource: row.booking_source,
  status: row.status,
  baseAmount: Number(row.base_amount || 0),
  commissionAmount: Number(row.commission_amount || 0),
  platformFeeAmount: Number(row.platform_fee_amount || 0),
  hasGatewayFee: Boolean(row.has_gateway_fee ?? row.gateway_fee_amount),
  gatewayFeeAmount: Number(row.gateway_fee_amount || 0),
  totalPaid: Number(row.total_payable || 0),
  netOwnerAmount: Number(row.net_owner_amount || 0),
  paymentMethod: row.booking_source === 'online' ? row.payment_gateway || 'sslcommerz' : row.payment_method || 'cash',
  paymentStatus: row.payment_status || row.gateway_payment_status || 'pending',
  paymentReference: row.payment_reference || undefined,
  expiresAt: row.expires_at || undefined,
  cancellationReason: row.cancellation_reason || undefined,
  cancelledBy: row.cancelled_by || undefined,
  qrCode: row.booking_number || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

app.get('/api/bookings', requireAuth, requireRole('player'), async (req, res) => {
  try { res.json({ success: true, data: (await listBookingsForPlayer(req.user.id)).map(normalizeBooking) }); }
  catch (error) { console.error('Player booking history failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load booking history.' }); }
});

app.post('/api/bookings', requireAuth, requireRole('player'), requireVerifiedEmail, async (req, res) => {
  const clientIdempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (clientIdempotencyKey.length < 8 || clientIdempotencyKey.length > 120) return res.status(400).json({ success: false, message: 'Idempotency-Key must contain between 8 and 120 characters.' });
  const idempotencyKey = `player:${req.user.id}:${clientIdempotencyKey}`;
  try {
    const booking = await createBookingHold({
      playerId: req.user.id,
      turfId: String(req.body.turfId || ''),
      date: String(req.body.date || ''),
      startTime: String(req.body.startTime || ''),
      durationHours: Number(req.body.durationHours),
      idempotencyKey,
    });
    res.status(201).json({
      success: true,
      message: `All requested slots are held for ${Math.max(1, Math.ceil((new Date(booking.expires_at).getTime() - Date.now()) / 60_000))} minutes. Complete payment to confirm the booking.`,
      data: {
        id: booking.id,
        bookingNumber: booking.booking_number,
        status: booking.status,
        date: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        totalHours: Number(booking.total_hours),
        baseAmount: Number(booking.base_amount),
        platformFeeAmount: Number(booking.platform_fee_amount),
        gatewayFeeAmount: Number(booking.gateway_fee_amount),
        totalPayable: Number(booking.total_payable),
        paymentStatus: booking.payment_status,
        expiresAt: booking.expires_at,
      },
    });
  } catch (error) {
    const expected = /required|valid|duration|consecutive|unavailable|availability|booked|slot/i.test(error.message);
    console.error('Booking hold request failed:', expected ? error.message : 'Unexpected booking persistence error.');
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to reserve this booking.' });
  }
});

app.get('/api/bookings/:bookingId', requireAuth, requireRole('player', 'turf_owner', 'staff', 'admin'), async (req, res) => {
  try {
    const booking = await getBookingForUser(req.params.bookingId, req.user);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Booking access check failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load booking.' });
  }
});

app.post('/api/bookings/:bookingId/release-hold', requireAuth, requireRole('player'), async (req, res) => {
  try {
    const released = await releasePendingBookingHold({ bookingId: req.params.bookingId, playerId: req.user.id });
    if (!released) return res.status(409).json({ success: false, message: 'This booking hold is no longer active.' });
    res.json({ success: true, message: 'Booking hold released.' });
  } catch (error) {
    console.error('Booking hold release failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to release this booking hold.' });
  }
});

const bookingStartTimeDhaka = (booking) => {
  const rawDate = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date).slice(0, 10);
  const timeMatch = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(String(booking.start_time || '').trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !timeMatch) throw new Error('Booking date or start time is invalid.');
  const rawTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:${timeMatch[3] || '00'}`;
  return new Date(`${rawDate}T${rawTime}+06:00`);
};

app.post('/api/bookings/:bookingId/cancel', requireAuth, requireRole('player', 'turf_owner'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason || reason.length > 1000) return res.status(400).json({ success: false, message: 'A cancellation reason (up to 1,000 characters) is required.' });
  try {
    const booking = await getBookingForUser(req.params.bookingId, req.user);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    const ownerInitiated = req.user.role === 'turf_owner';
    const bookingStart = bookingStartTimeDhaka(booking);
    if (bookingStart.getTime() < Date.now() && !ownerInitiated) return res.status(409).json({ success: false, message: 'A booking cannot be cancelled after its start time.' });
    const bookingCreatedAt = new Date(booking.created_at);
    if (!Number.isFinite(bookingCreatedAt.getTime())) return res.status(409).json({ success: false, message: 'The booking creation time is unavailable for cancellation policy calculation.' });
    const hoursSinceBooking = Math.max(0, (Date.now() - bookingCreatedAt.getTime()) / 3_600_000);
    const refundPercentage = ownerInitiated ? 100 : await resolveCancellationRefundPercentage({ turfId: booking.turf_id, ownerId: booking.owner_id, hoursSinceBooking });
    if (!ownerInitiated) {
      const request = await createPlayerCancellationRequest({ bookingId: booking.id, playerId: req.user.id, reason, refundPercentage });
      await notifyPlayer({ userId: booking.owner_id, type: 'booking', title: 'Cancellation request needs review',
        message: `${booking.player_name || 'A player'} requested cancellation for booking ${booking.booking_number}. Respond within 24 hours.`,
        data: { bookingId: booking.id, eventKey: `cancellation-request:${booking.id}:${request.requestedAt}` } });
      await notifyPlayer({ userId: req.user.id, type: 'booking', title: 'Cancellation request submitted',
        message: 'Your booking remains active while the turf owner reviews your request. No later than 24 hours, it will be resolved automatically.',
        data: { bookingId: booking.id, refundPercentage, eventKey: `cancellation-request-submitted:${booking.id}` } });
      return res.json({ success: true, data: { bookingId: booking.id, status: 'pending', refundPercentage, requestedAt: request.requestedAt } });
    }
    const result = await cancelBookingAndQueueRefund({ bookingId: booking.id, actorId: req.user.id, reason, refundPercentage, ownerInitiated });
    if (booking.player_id) {
      await notifyPlayer({
        userId: booking.player_id, type: 'booking',
        title: ownerInitiated ? 'Booking cancelled by the turf owner' : 'Booking cancelled',
        message: ownerInitiated ? 'The turf owner cancelled your booking. A full refund has been initiated.' : 'Your turf booking has been cancelled.',
        data: { bookingId: booking.id, eventKey: `booking-cancelled:${booking.id}` },
      });
      if (Number(result.refundAmount) > 0) await notifyPlayer({
        userId: booking.player_id, type: 'refund', title: 'Refund initiated',
        message: `A refund of ${Number(result.refundAmount).toFixed(2)} has been initiated for your booking.`,
        data: { bookingId: booking.id, refundAmount: result.refundAmount, eventKey: `refund-initiated:${booking.id}` },
      });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    const expected = /confirmed bookings|state changed/i.test(error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to cancel this booking.' });
  }
});

app.post('/api/owner/bookings/:bookingId/cancellation-request', requireAuth, requireRole('turf_owner'), async (req, res) => {
  const decision = String(req.body.decision || '');
  const reason = String(req.body.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ success: false, message: 'Choose approve or reject.' });
  if (!reason || reason.length > 1000) return res.status(400).json({ success: false, message: 'A decision reason (up to 1,000 characters) is required.' });
  try {
    const booking = await getBookingForUser(req.params.bookingId, req.user);
    if (!booking || booking.owner_id !== req.user.id) return res.status(404).json({ success: false, message: 'Booking not found.' });
    let refundAmount = 0;
    if (decision === 'approve') {
      const refundPercentage = Number(booking.cancellation_request_refund_percentage ?? booking.cancellationRequestRefundPercentage);
      if (!Number.isFinite(refundPercentage)) return res.status(409).json({ success: false, message: 'The saved cancellation calculation is missing.' });
      const cancellation = await cancelBookingAndQueueRefund({ bookingId: booking.id, actorId: req.user.id, reason: booking.cancellation_request_reason || 'Player cancellation request approved', refundPercentage, actorRole: 'turf_owner', refundInitiator: 'player' });
      refundAmount = Number(cancellation.refundAmount || 0);
    }
    await recordCancellationRequestDecision({ bookingId: booking.id, ownerId: req.user.id, decision: decision === 'approve' ? 'approved' : 'rejected', reason });
    if (booking.player_id) await notifyPlayer({ userId: booking.player_id, type: 'booking', title: decision === 'approve' ? 'Cancellation request approved' : 'Cancellation request rejected',
      message: decision === 'approve' ? `Your cancellation request was approved. Owner reason: ${reason}` : `Your booking remains active. Owner reason: ${reason}`,
      data: { bookingId: booking.id, eventKey: `cancellation-request-${decision}:${booking.id}` } });
    res.json({ success: true, data: { bookingId: booking.id, decision, reason, refundAmount } });
  } catch (error) {
    const expected = /not found|state changed|confirmed bookings|already resolved/i.test(error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to resolve this cancellation request.' });
  }
});

app.get('/api/admin/bookings', requireAuth, requireRole('admin'), async (req, res) => {
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const status = String(req.query.status || '');
  const filters = { dateFrom, dateTo, status, turfId: String(req.query.turfId || ''), ownerId: String(req.query.ownerId || ''), playerId: String(req.query.playerId || '') };
  if ((dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) return res.status(400).json({ success: false, message: 'Date filters must be valid YYYY-MM-DD values in ascending order.' });
  if (status && !['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid booking status filter.' });
  for (const key of ['turfId', 'ownerId', 'playerId']) if (filters[key].length > 100) return res.status(400).json({ success: false, message: 'Invalid identifier filter.' });
  try { res.json({ success: true, data: await listBookingsForAdmin(filters) }); }
  catch (error) { console.error('Admin booking report failed:', error.message); res.status(500).json({ success: false, message: 'Unable to load the booking report.' }); }
});

app.post('/api/admin/bookings/:bookingId/force-refund', requireAuth, requireRole('admin'), async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason || reason.length > 1000) return res.status(400).json({ success: false, message: 'A reason (up to 1,000 characters) is required for an admin override.' });
  try {
    const result = await cancelBookingAndQueueRefund({ bookingId: req.params.bookingId, actorId: req.user.id, reason, refundPercentage: 100, adminOverride: true });
    res.json({ success: true, data: result });
  } catch (error) {
    const expected = /confirmed bookings|state changed/i.test(error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to force-cancel and refund this booking.' });
  }
});

const SSLCOMMERZ_SANDBOX_API = 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
const SSLCOMMERZ_LIVE_API = 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';
const API_PUBLIC_URL = process.env.API_PUBLIC_URL?.replace(/\/+$/, '');
const resolvePublicApiBaseUrl = (settings, req) => {
  const configuredUrl = normalizePublicApiBaseUrl(settings?.public_api_base_url, { allowHttpLocalhost: process.env.NODE_ENV !== 'production' });
  if (configuredUrl) return configuredUrl;
  if (API_PUBLIC_URL) return API_PUBLIC_URL;

  const requestUrl = new URL(`${req.protocol}://${req.get('host')}`);
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(requestUrl.hostname);
  if (isLocalhost) {
    requestUrl.protocol = 'http:';
    requestUrl.port = String(PORT);
    return requestUrl.origin;
  }
  return requestUrl.origin;
};
const getPublicApiBaseUrl = async (req) => resolvePublicApiBaseUrl(await readAdminSettings(), req);
if (process.env.NODE_ENV === 'production') {
  let publicApiUrl;
  try { publicApiUrl = new URL(API_PUBLIC_URL || ''); } catch { throw new Error('API_PUBLIC_URL must be an absolute HTTPS URL in production.'); }
  if (publicApiUrl.protocol !== 'https:' || publicApiUrl.username || publicApiUrl.password || publicApiUrl.pathname !== '/') throw new Error('API_PUBLIC_URL must be an HTTPS origin without credentials or a path in production.');
}

// Real SSLCommerz session initiation — sandbox or live, using the store credentials
// configured by the admin in the Payment Gateway settings panel.
app.post('/api/payments/sslcommerz/init', requireAuth, requireRole('player'), paymentLimiter, async (req, res) => {
  const bookingId = String(req.body.bookingId || '');
  const booking = await getBookingForPayment(bookingId, req.user.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Pending booking not found.' });
  if (booking.status !== 'pending_payment' || booking.payment_status !== 'pending' || new Date(booking.expires_at).getTime() <= Date.now()) {
    return res.status(409).json({ success: false, message: 'The booking payment hold has expired.' });
  }
  const amount = Number(booking.total_payable);
  const currency = 'BDT';
  const bookingNumber = booking.booking_number;
  let gatewayConfig;
  try { gatewayConfig = await getSslcommerzConfig(); } catch { return res.status(503).json({ success: false, message: 'Payment gateway settings cannot be decrypted. Verify the server encryption key.' }); }
  if (!gatewayConfig?.isActive || !gatewayConfig.storeId || !gatewayConfig.storePassword) return res.status(503).json({ success: false, message: 'Payment gateway is not configured or enabled in Admin settings.' });
  const { storeId, storePassword, isSandbox } = gatewayConfig;
  if (booking.payment_gateway === 'sslcommerz' && booking.gateway_response?.checkout_url) {
    return res.json({ success: true, gatewayPageURL: booking.gateway_response.checkout_url, tranId: booking.transaction_id });
  }
  if (!await claimPaymentGatewayForCheckout(booking.transaction_id, 'sslcommerz')) {
    return res.status(409).json({ success: false, message: 'A checkout session is already being created for this booking. Reopen it or check its status.' });
  }
  const apiUrl = isSandbox ? SSLCOMMERZ_SANDBOX_API : SSLCOMMERZ_LIVE_API;
  const tranId = bookingNumber;
  const serverBaseUrl = await getPublicApiBaseUrl(req);

  const payload = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: String(amount),
    currency,
    tran_id: tranId,
    success_url: `${serverBaseUrl}/api/payments/sslcommerz/success`,
    fail_url: `${serverBaseUrl}/api/payments/sslcommerz/fail`,
    cancel_url: `${serverBaseUrl}/api/payments/sslcommerz/cancel`,
    ipn_url: `${serverBaseUrl}/api/payments/sslcommerz/ipn`,
    cus_name: req.user.name,
    cus_email: req.user.email,
    cus_phone: req.user.phone,
    cus_add1: 'Dhaka',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: 'Turf Slot Booking',
    product_category: 'Sports Booking',
    product_profile: 'general',
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json();

    if (data.status !== 'SUCCESS') {
      return res.status(502).json({ success: false, message: 'SSLCommerz session initiation failed.' });
    }
    const sessionUrl = new URL(data.GatewayPageURL);
    const allowedHosts = isSandbox ? ['sandbox.sslcommerz.com'] : ['securepay.sslcommerz.com'];
    if (sessionUrl.protocol !== 'https:' || !allowedHosts.includes(sessionUrl.hostname)) {
      return res.status(502).json({ success: false, message: 'SSLCommerz returned an invalid checkout URL.' });
    }

    await savePaymentSession(tranId, { sessionKey: data.sessionkey, gatewayStatus: data.status, checkout_url: data.GatewayPageURL }, 'sslcommerz');
    res.json({ success: true, gatewayPageURL: data.GatewayPageURL, tranId });
  } catch (error) {
    console.error('Payment session creation failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to reach SSLCommerz.' });
  }
});

app.post('/api/payments/:provider/init', requireAuth, requireRole('player'), paymentLimiter, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!['surjopay', 'uddoktapay'].includes(provider)) return res.status(404).json({ success: false, message: 'Payment provider is not supported.' });
  const booking = await getBookingForPayment(String(req.body.bookingId || ''), req.user.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Pending booking not found.' });
  if (booking.status !== 'pending_payment' || booking.payment_status !== 'pending' || new Date(booking.expires_at).getTime() <= Date.now()) {
    return res.status(409).json({ success: false, message: 'The booking payment hold has expired.' });
  }
  if (booking.payment_gateway === provider && booking.gateway_response?.checkout_url) {
    return res.json({ success: true, gatewayPageURL: booking.gateway_response.checkout_url, tranId: booking.transaction_id });
  }
  let config;
  try { config = await getPaymentGatewayConfig(provider); }
  catch (error) {
    console.error(`${provider} configuration unavailable:`, error.message);
    return res.status(503).json({ success: false, message: 'Payment gateway credentials are unavailable. Verify the server encryption key.' });
  }
  if (!config?.isActive) return res.status(503).json({ success: false, message: 'Payment gateway is not configured or enabled in Admin settings.' });
  if (!await claimPaymentGatewayForCheckout(booking.transaction_id, provider)) {
    return res.status(409).json({ success: false, message: 'A checkout session is already being created with another provider or the existing session is still active.' });
  }

  const serverBaseUrl = await getPublicApiBaseUrl(req);
  const amount = Number(booking.total_payable).toFixed(2);
  try {
    if (provider === 'surjopay') {
      const apiBase = config.isSandbox ? 'https://sandbox.shurjopayment.com/api' : 'https://engine.shurjopayment.com/api';
      const authResponse = await fetch(`${apiBase}/get_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: config.username, password: config.password }), signal: AbortSignal.timeout(10_000),
      });
      if (!authResponse.ok) throw new Error('ShurjoPay authentication failed.');
      const authData = await authResponse.json();
      if (!authData.token || !authData.store_id) throw new Error('ShurjoPay did not issue a checkout token.');
      const form = new FormData();
      const checkoutFields = {
        prefix: config.prefix,
        token: authData.token,
        return_url: `${serverBaseUrl}/api/payments/surjopay/success`,
        cancel_url: `${serverBaseUrl}/api/payments/surjopay/cancel`,
        store_id: String(authData.store_id),
        amount,
        order_id: booking.transaction_id,
        currency: 'BDT',
        customer_name: req.user.name,
        customer_address: 'Dhaka',
        customer_email: req.user.email,
        customer_phone: req.user.phone,
        customer_city: 'Dhaka',
        customer_post_code: '1207',
        customer_state: 'Dhaka',
        customer_country: 'BD',
        client_ip: String(req.ip || '').replace(/^::ffff:/, ''),
      };
      for (const [key, value] of Object.entries(checkoutFields)) form.append(key, String(value || ''));
      const checkoutResponse = await fetch(`${apiBase}/secret-pay`, {
        method: 'POST', headers: { Authorization: `${authData.token_type || 'Bearer'} ${authData.token}`, Accept: 'application/json' },
        body: form, signal: AbortSignal.timeout(10_000),
      });
      if (!checkoutResponse.ok) throw new Error('ShurjoPay checkout request failed.');
      const checkoutData = await checkoutResponse.json();
      if (!checkoutData.checkout_url || !checkoutData.sp_order_id || String(checkoutData.customer_order_id) !== String(booking.transaction_id)) {
        throw new Error('ShurjoPay returned an invalid checkout response.');
      }
      const checkoutUrl = new URL(checkoutData.checkout_url);
      const allowedHosts = config.isSandbox ? ['sandbox.securepay.shurjopayment.com'] : ['securepay.shurjopayment.com'];
      if (checkoutUrl.protocol !== 'https:' || !allowedHosts.includes(checkoutUrl.hostname)) throw new Error('ShurjoPay returned an invalid checkout URL.');
      await savePaymentSession(booking.transaction_id, { provider_reference: String(checkoutData.sp_order_id), customer_order_id: String(checkoutData.customer_order_id) }, provider);
      return res.json({ success: true, gatewayPageURL: checkoutUrl.href, tranId: booking.transaction_id });
    }

    const apiOrigin = config.isSandbox ? 'https://sandbox.uddoktapay.com' : config.baseUrl;
    if (!apiOrigin) return res.status(503).json({ success: false, message: 'A production UddoktaPay API origin is required.' });
    const checkoutResponse = await fetch(`${apiOrigin}/api/checkout-v2`, {
      method: 'POST',
      headers: { 'RT-UDDOKTAPAY-API-KEY': config.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: req.user.name,
        email: req.user.email,
        amount,
        metadata: { booking_id: booking.id, order_id: booking.transaction_id },
        redirect_url: `${serverBaseUrl}/api/payments/uddoktapay/success`,
        return_type: 'GET',
        cancel_url: `${serverBaseUrl}/api/payments/uddoktapay/cancel`,
        webhook_url: `${serverBaseUrl}/api/payments/uddoktapay/webhook`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!checkoutResponse.ok) throw new Error('UddoktaPay checkout request failed.');
    const checkoutData = await checkoutResponse.json();
    if (checkoutData.status !== true || typeof checkoutData.payment_url !== 'string') throw new Error('UddoktaPay did not return a payment URL.');
    const checkoutUrl = new URL(checkoutData.payment_url);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.origin !== new URL(apiOrigin).origin) throw new Error('UddoktaPay returned an invalid checkout URL.');
    const providerReference = checkoutUrl.pathname.split('/').filter(Boolean).at(-1) || '';
    if (!/^[a-zA-Z0-9_-]{8,160}$/.test(providerReference)) throw new Error('UddoktaPay returned an invalid invoice reference.');
    await savePaymentSession(booking.transaction_id, { provider_reference: providerReference, customer_order_id: String(booking.transaction_id), checkout_url: checkoutUrl.href }, provider);
    res.json({ success: true, gatewayPageURL: checkoutUrl.href, tranId: booking.transaction_id });
  } catch (error) {
    console.error(`${provider} checkout initiation failed:`, error.message);
    res.status(502).json({ success: false, message: `Unable to start ${provider} checkout. Check the gateway settings and try again.` });
  }
});

const validateAndConfirmSslcommerz = async (body) => {
  const valId = String(body.val_id || '').trim();
  const tranId = String(body.tran_id || '').trim();
  const gatewayConfig = await getSslcommerzConfig();
  const storeId = gatewayConfig?.storeId;
  const storePassword = gatewayConfig?.storePassword;
  if (!valId || !tranId || !gatewayConfig?.isActive || !storeId || !storePassword) throw new Error('Missing payment validation fields or active gateway configuration.');
  const isSandbox = gatewayConfig.isSandbox;
  const validationUrl = new URL(isSandbox
    ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
    : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php');
  validationUrl.search = new URLSearchParams({ val_id: valId, store_id: storeId, store_passwd: storePassword, format: 'json' }).toString();
  const response = await fetch(validationUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Gateway validation request failed.');
  const validation = await response.json();
  if (!['VALID', 'VALIDATED'].includes(String(validation.status || '').toUpperCase())) throw new Error('Gateway did not validate payment.');
  if (String(validation.tran_id || '') !== tranId) throw new Error('Gateway transaction ID mismatch.');
  const safeResponse = Object.fromEntries(['status', 'tran_id', 'val_id', 'amount', 'currency', 'bank_tran_id', 'card_type', 'tran_date']
    .filter((key) => validation[key] !== undefined)
    .map((key) => [key, validation[key]]));
  const booking = await confirmBookingPayment({
    transactionId: tranId,
    amount: Number(validation.amount),
    currency: String(validation.currency || ''),
    validationId: valId,
    gatewayResponse: safeResponse,
  });
  if (booking?.player_id && booking.status === 'confirmed') {
    await scheduleBookingReminder(booking);
    const turf = await getTurf(booking.turf_id, { publicOnly: false });
    await notifyPlayer({
      userId: booking.player_id, type: 'booking', title: 'Booking confirmed',
      message: `Your booking ${booking.booking_number} for ${turf?.name || 'the turf'} on ${String(booking.booking_date || '').slice(0, 10)} at ${String(booking.start_time || '').slice(0, 5)} is confirmed.`,
      data: { bookingId: booking.id, eventKey: `booking-confirmed:${booking.id}` },
    });
    await notifyPlayer({
      userId: booking.player_id, type: 'payment', title: 'Payment successful',
      message: `Your SSLCommerz payment of ৳${Number(booking.total_payable || 0).toFixed(2)} was received for booking ${booking.booking_number}.`,
      data: { bookingId: booking.id, eventKey: `payment-success:${booking.id}` },
    });
    if (turf?.owner_id) await notifyPlayer({
      userId: turf.owner_id, type: 'booking', title: 'Online booking paid and confirmed',
      message: `Booking ${booking.booking_number} for ${turf.name} on ${String(booking.booking_date || '').slice(0, 10)} at ${String(booking.start_time || '').slice(0, 5)} has been paid and confirmed.`,
      data: { bookingId: booking.id, eventKey: `owner-booking-confirmed:${booking.id}` },
    });
  } else if (booking?.player_id && booking.status === 'expired_refund_pending') {
    await notifyPlayer({
      userId: booking.player_id, type: 'payment', title: 'Payment received after booking expired',
      message: 'Your booking hold expired before payment was confirmed. A refund is pending review.',
      data: { bookingId: booking.id, eventKey: `booking-late-payment:${booking.id}` },
    });
  }
  return booking;
};

app.post('/api/payments/sslcommerz/ipn', paymentCallbackLimiter, async (req, res) => {
  try {
    const booking = await validateAndConfirmSslcommerz(req.body);
    res.status(200).json({ success: true, bookingId: booking.id, status: booking.status });
  } catch (error) {
    console.error('SSLCommerz IPN validation failed:', error.message);
    res.status(400).json({ success: false, message: 'Payment could not be validated.' });
  }
});

app.post('/api/payments/sslcommerz/success', paymentCallbackLimiter, async (req, res) => {
  const tranId = String(req.body.tran_id || '');
  try {
    const booking = await validateAndConfirmSslcommerz(req.body);
    if (booking.status === 'expired_refund_pending') return res.status(200).type('html').send(checkoutReturnPage('Payment received, refund pending', 'The booking hold expired before payment was confirmed. The payment is queued for refund review.'));
    return res.status(200).type('html').send(checkoutReturnPage('Payment received', 'SSLCommerz validated your payment and your booking is confirmed.'));
  } catch (error) {
    console.error('SSLCommerz success callback validation failed:', error.message);
    return res.status(200).type('html').send(checkoutReturnPage('Payment status pending', 'We could not confirm this payment yet. Return to your Turfyslot tab and check the booking status before trying again.'));
  }
});

app.post('/api/payments/sslcommerz/fail', paymentCallbackLimiter, (req, res) => {
  res.status(200).type('html').send(checkoutReturnPage('Payment not completed', 'SSLCommerz did not complete the payment. Return to Turfyslot to check your booking and try again if the booking hold is still active.'));
});

app.post('/api/payments/sslcommerz/cancel', paymentCallbackLimiter, (req, res) => {
  res.status(200).type('html').send(checkoutReturnPage('Payment cancelled', 'The checkout was cancelled. Return to Turfyslot to check your booking or restart checkout while the slot hold is active.'));
});

const verifyAlternativePayment = async ({ provider, providerReference }) => {
  let payment = await getPaymentForGatewayCallback({ gateway: provider, providerReference });
  if (!payment && provider !== 'uddoktapay') throw new Error('Payment reference is not recognized.');
  const config = await getPaymentGatewayConfig(provider);
  if (!config) throw new Error('Payment provider configuration is unavailable.');
  let verified;
  let validationId = providerReference;

  if (provider === 'surjopay') {
    const apiBase = config.isSandbox ? 'https://sandbox.shurjopayment.com/api' : 'https://engine.shurjopayment.com/api';
    const authResponse = await fetch(`${apiBase}/get_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password }), signal: AbortSignal.timeout(10_000),
    });
    if (!authResponse.ok) throw new Error('ShurjoPay verification authentication failed.');
    const authData = await authResponse.json();
    if (!authData.token) throw new Error('ShurjoPay did not issue a verification token.');
    const response = await fetch(`${apiBase}/verification`, {
      method: 'POST', headers: { Authorization: `${authData.token_type || 'Bearer'} ${authData.token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: providerReference }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('ShurjoPay verification request failed.');
    const result = await response.json();
    verified = Array.isArray(result) ? result[0] : result;
    if (!verified || String(verified.sp_code) !== '1000' || String(verified.order_id) !== providerReference || String(verified.customer_order_id) !== String(payment.transaction_id)) {
      throw new Error('ShurjoPay did not verify the expected booking payment.');
    }
    validationId = String(verified.invoice_no || providerReference);
  } else {
    const apiOrigin = config.isSandbox ? 'https://sandbox.uddoktapay.com' : config.baseUrl;
    if (!apiOrigin) throw new Error('UddoktaPay production API origin is missing.');
    const response = await fetch(`${apiOrigin}/api/verify-payment`, {
      method: 'POST', headers: { 'RT-UDDOKTAPAY-API-KEY': config.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: providerReference }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('UddoktaPay verification request failed.');
    verified = await response.json();
    if (String(verified.status || '').toUpperCase() !== 'COMPLETED' || String(verified.invoice_id) !== providerReference) {
      throw new Error('UddoktaPay did not verify the expected booking payment.');
    }
    const verifiedOrderId = String(verified.metadata?.order_id || '');
    if (!payment && verifiedOrderId) {
      payment = await getPaymentForGatewayCallback({ gateway: provider, providerReference, transactionId: verifiedOrderId });
    }
    if (!payment || verifiedOrderId !== String(payment.transaction_id)) {
      throw new Error('UddoktaPay payment does not match a Turfyslot checkout session.');
    }
    validationId = providerReference;
  }

  const amount = Number(verified.amount);
  const currency = String(verified.currency || 'BDT').toUpperCase();
  if (!Number.isFinite(amount) || Math.abs(Number(payment.expected_amount) - amount) > 0.01 || currency !== 'BDT' || payment.expected_currency !== 'BDT') {
    throw new Error('Verified payment amount or currency does not match the booking.');
  }
  const safeResponse = provider === 'surjopay'
    ? { provider_reference: providerReference, transaction_status: verified.transaction_status || verified.bank_status || '', sp_code: verified.sp_code, amount: verified.amount, currency: verified.currency || 'BDT', transaction_id: verified.bank_trx_id || '' }
    : { provider_reference: providerReference, status: verified.status, amount: verified.amount, currency, transaction_id: verified.transaction_id || '', payment_method: verified.payment_method || '' };
  return confirmBookingPayment({ transactionId: payment.transaction_id, amount, currency, validationId, gatewayResponse: safeResponse, gateway: provider });
};

const notifyAlternativePaymentConfirmed = async (booking, provider) => {
  if (!booking?.player_id || booking.status !== 'confirmed') return;
  await scheduleBookingReminder(booking);
  const turf = await getTurf(booking.turf_id, { publicOnly: false });
  const providerLabel = provider === 'surjopay' ? 'ShurjoPay' : 'UddoktaPay';
  await notifyPlayer({
    userId: booking.player_id, type: 'booking', title: 'Booking confirmed',
    message: `Your booking ${booking.booking_number} for ${turf?.name || 'the turf'} is confirmed.`,
    data: { bookingId: booking.id, eventKey: `booking-confirmed:${booking.id}` },
  });
  await notifyPlayer({
    userId: booking.player_id, type: 'payment', title: 'Payment successful',
    message: `Your ${providerLabel} payment was received for booking ${booking.booking_number}.`,
    data: { bookingId: booking.id, eventKey: `payment-success:${booking.id}` },
  });
  if (turf?.owner_id) await notifyPlayer({
    userId: turf.owner_id, type: 'booking', title: 'Online booking paid and confirmed',
    message: `Booking ${booking.booking_number} for ${turf.name} has been paid and confirmed.`,
    data: { bookingId: booking.id, eventKey: `owner-booking-confirmed:${booking.id}` },
  });
};

const handleShurjopaySuccess = async (req, res) => {
  const providerReference = String(req.body?.order_id || req.query?.order_id || '').trim();
  try {
    if (!providerReference) throw new Error('ShurjoPay order reference is missing.');
    const booking = await verifyAlternativePayment({ provider: 'surjopay', providerReference });
    await notifyAlternativePaymentConfirmed(booking, 'surjopay');
    if (booking.status === 'expired_refund_pending') return res.status(200).type('html').send(checkoutReturnPage('Payment received, refund pending', 'The booking hold expired before payment was confirmed. The payment is queued for refund review.'));
    return res.status(200).type('html').send(checkoutReturnPage('Payment received', 'ShurjoPay validated your payment and your booking is confirmed.'));
  } catch (error) {
    console.error('ShurjoPay callback validation failed:', error.message);
    return res.status(200).type('html').send(checkoutReturnPage('Payment status pending', 'We could not confirm this payment yet. Return to Turfyslot and check the booking status before trying again.'));
  }
};

app.post('/api/payments/surjopay/success', paymentCallbackLimiter, handleShurjopaySuccess);
app.get('/api/payments/surjopay/success', paymentCallbackLimiter, handleShurjopaySuccess);
app.post('/api/payments/surjopay/webhook', paymentCallbackLimiter, async (req, res) => {
  const providerReference = String(req.body?.order_id || req.query?.order_id || '').trim();
  try {
    if (!providerReference) return res.status(400).json({ success: false, message: 'ShurjoPay order ID is required.' });
    const booking = await verifyAlternativePayment({ provider: 'surjopay', providerReference });
    await notifyAlternativePaymentConfirmed(booking, 'surjopay');
    res.status(200).json({ success: true, status: booking.status });
  } catch (error) {
    console.error('ShurjoPay IPN validation failed:', error.message);
    res.status(400).json({ success: false, message: 'Payment could not be validated.' });
  }
});
app.post('/api/payments/surjopay/cancel', paymentCallbackLimiter, (_req, res) => res.status(200).type('html').send(checkoutReturnPage('Payment cancelled', 'The ShurjoPay checkout was cancelled. Return to Turfyslot to check your booking.')));
app.get('/api/payments/surjopay/cancel', paymentCallbackLimiter, (_req, res) => res.status(200).type('html').send(checkoutReturnPage('Payment cancelled', 'The ShurjoPay checkout was cancelled. Return to Turfyslot to check your booking.')));

const handleUddoktapaySuccess = async (req, res) => {
  const providerReference = String(req.query?.invoice_id || req.body?.invoice_id || '').trim();
  try {
    if (!providerReference) throw new Error('UddoktaPay invoice reference is missing.');
    const booking = await verifyAlternativePayment({ provider: 'uddoktapay', providerReference });
    await notifyAlternativePaymentConfirmed(booking, 'uddoktapay');
    const returnUrl = new URL(CLIENT_URL);
    returnUrl.searchParams.set('payment', booking.status === 'expired_refund_pending' ? 'refund_pending' : 'success');
    returnUrl.searchParams.set('booking_id', String(booking.id));
    return res.redirect(303, returnUrl.toString());
  } catch (error) {
    console.error('UddoktaPay callback validation failed:', error.message);
    return res.status(200).type('html').send(checkoutReturnPage('Payment status pending', 'We could not confirm this payment yet. Return to Turfyslot and check the booking status before trying again.'));
  }
};

app.get('/api/payments/uddoktapay/success', paymentCallbackLimiter, handleUddoktapaySuccess);
app.post('/api/payments/uddoktapay/success', paymentCallbackLimiter, handleUddoktapaySuccess);
app.get('/api/payments/uddoktapay/cancel', paymentCallbackLimiter, (_req, res) => res.status(200).type('html').send(checkoutReturnPage('Payment cancelled', 'The UddoktaPay checkout was cancelled. Return to Turfyslot to check your booking.')));
app.post('/api/payments/uddoktapay/cancel', paymentCallbackLimiter, (_req, res) => res.status(200).type('html').send(checkoutReturnPage('Payment cancelled', 'The UddoktaPay checkout was cancelled. Return to Turfyslot to check your booking.')));

app.post('/api/payments/uddoktapay/webhook', paymentCallbackLimiter, async (req, res) => {
  try {
    const config = await getPaymentGatewayConfig('uddoktapay');
    const suppliedKey = Buffer.from(String(req.get('RT-UDDOKTAPAY-API-KEY') || ''));
    const expectedKey = Buffer.from(String(config?.apiKey || ''));
    if (!config || !expectedKey.length || suppliedKey.length !== expectedKey.length || !crypto.timingSafeEqual(suppliedKey, expectedKey)) {
      return res.status(401).json({ success: false, message: 'Webhook authentication failed.' });
    }
    const providerReference = String(req.body?.invoice_id || '').trim();
    if (!providerReference) return res.status(400).json({ success: false, message: 'Invoice reference is required.' });
    const booking = await verifyAlternativePayment({ provider: 'uddoktapay', providerReference });
    await notifyAlternativePaymentConfirmed(booking, 'uddoktapay');
    res.status(200).json({ success: true, status: booking.status });
  } catch (error) {
    console.error('UddoktaPay webhook validation failed:', error.message);
    res.status(400).json({ success: false, message: 'Payment could not be validated.' });
  }
});

app.post('/api/payments/:provider/verify', requireAuth, requireRole('player'), paymentLimiter, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!['surjopay', 'uddoktapay'].includes(provider)) return res.status(404).json({ success: false, message: 'Payment provider is not supported.' });
  const booking = await getBookingForPayment(String(req.body.bookingId || ''), req.user.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
  if (booking.status === 'confirmed') return res.json({ success: true, status: booking.status });
  const providerReference = booking.gateway_response?.provider_reference;
  if (booking.payment_gateway !== provider || !providerReference) return res.status(409).json({ success: false, message: 'No pending payment session exists for this provider.' });
  try {
    const updated = await verifyAlternativePayment({ provider, providerReference });
    await notifyAlternativePaymentConfirmed(updated, provider);
    res.json({ success: true, status: updated.status });
  } catch (error) {
    res.status(409).json({ success: false, message: 'The payment is not confirmed yet.' });
  }
});

// Builds a nodemailer transport from the SMTP settings configured in the Admin panel.
const createSmtpTransport = ({ host, port, secure, username, password }) =>
  nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Boolean(secure), // true for 465 (SSL), false for 587/2525 (STARTTLS)
    auth: { user: username, pass: password },
  });
const getActiveSmtpConfig = async () => (await listSmtpConfigs()).find((config) => config.isActive) || null;
const safeSmtpConfig = ({ password, password_encrypted, ...config }) => ({ ...config, password: '', passwordSet: Boolean(config.passwordSet || password || password_encrypted) });
const sendNotificationEmail = async ({ userId, title, message }) => {
  const [recipient, smtpConfig] = await Promise.all([findUserById(userId), getActiveSmtpConfig()]);
  if (!recipient?.email || !smtpConfig) return;
  await createSmtpTransport(smtpConfig).sendMail({
    from: `"${smtpConfig.fromName || 'TurfySlot'}" <${smtpConfig.fromEmail}>`,
    to: recipient.email,
    subject: `TurfySlot: ${String(title).slice(0, 180)}`,
    text: String(message).slice(0, 5000),
    html: renderBrandedEmail({ preheader: String(message).slice(0, 120), title: String(title).slice(0, 180), body: `<p style="margin:0">${escapeHtml(message).replace(/\n/g, '<br>')}</p>` }),
  });
};
const sendWebPushNotifications = async ({ userId, title, message, data }) => {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return;
  const subscriptions = await listUserPushSubscriptions(userId);
  if (!subscriptions.length) return;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  await Promise.all(subscriptions.map(async ({ endpointHash, subscription }) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify({ title: String(title).slice(0, 200), body: String(message).slice(0, 1000), data: data || {} }), { TTL: 3600 });
    } catch (error) {
      if ([404, 410].includes(Number(error.statusCode))) {
        await deleteUserPushSubscription({ userId, endpointHash });
        return;
      }
      throw error;
    }
  }));
};
const sendNotificationSms = async ({ userId, message }) => {
  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID;
  if (!apiKey || !senderId) return;
  const user = await findUserById(userId);
  const phone = String(user?.phone || '').trim();
  if (!phone) return;
  const endpoint = new URL(process.env.SMS_API_URL || 'https://api.bulksmsbd.co/send');
  if (endpoint.protocol !== 'https:') throw new Error('SMS_API_URL must use HTTPS.');
  const payload = new URLSearchParams({ api_key: apiKey, senderid: senderId, type: 'text', number: phone, message: String(message).slice(0, 1000) });
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload.toString(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}.`);
  const responseText = await response.text();
  if (/"?(success|status|error)"?\s*[:=]\s*"?(false|fail|failed|error|[1-9][0-9]*)/i.test(responseText)) throw new Error('SMS provider rejected the notification.');
};
const notifyPlayer = async ({ userId, type, title, message, data }) => {
  if (!userId) return;
  let existingEvent = false;
  try { existingEvent = (await createUserNotification({ userId, type, title, message, data }))?.wasCreated === false; }
  catch (error) { console.error('In-app notification could not be saved:', error.message); }
  if (existingEvent) return;
  const eventKey = typeof data?.eventKey === 'string' ? data.eventKey : crypto.randomUUID();
  if (notificationEmailQueue) {
    const jobId = `notification-email-${crypto.createHash('sha256').update(`${userId}:${eventKey}`).digest('hex')}`;
    try {
      await notificationEmailQueue.add('send-notification-email', { userId, title, message }, {
        jobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 30 * 24 * 60 * 60 }, removeOnFail: 100,
      });
    } catch (error) { console.error('Notification email could not be queued:', error.message); }
  } else {
    void sendNotificationEmail({ userId, title, message }).catch((error) => console.error('Notification email failed:', error.message));
  }
  if (pushNotificationQueue) {
    const jobId = `push-notification-${crypto.createHash('sha256').update(`${userId}:${eventKey}`).digest('hex')}`;
    try {
      await pushNotificationQueue.add('send-push-notification', { userId, title, message, data }, {
        jobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 30 * 24 * 60 * 60 }, removeOnFail: 100,
      });
    } catch (error) { console.error('Push notification could not be queued:', error.message); }
  } else {
    void sendWebPushNotifications({ userId, title, message, data }).catch((error) => console.error('Push notification failed:', error.message));
  }
  if (process.env.SMS_API_KEY && process.env.SMS_SENDER_ID) {
    const jobId = `sms-notification-${crypto.createHash('sha256').update(`${userId}:${eventKey}`).digest('hex')}`;
    if (notificationSmsQueue) {
      try {
        await notificationSmsQueue.add('send-sms-notification', { userId, message }, {
          jobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 30 * 24 * 60 * 60 }, removeOnFail: 100,
        });
      } catch (error) { console.error('Notification SMS could not be queued:', error.message); }
    } else {
      void sendNotificationSms({ userId, message }).catch((error) => console.error('Notification SMS failed:', error.message));
    }
  }
};
const notifyAdmins = async ({ type, title, message, data }) => {
  try {
    const admins = await listUsersForAdmin({ role: 'admin', status: 'active' });
    await Promise.all(admins.map((admin) => notifyPlayer({
      userId: admin.id,
      type,
      title,
      message,
      data: { ...data, eventKey: `${String(data?.eventKey || crypto.randomUUID())}:${admin.id}` },
    })));
  } catch (error) {
    console.error('Admin notification delivery failed:', error.message);
  }
};
const notifyRefundCompleted = async (refund) => {
  if (!refund?.booking_id) return;
  try {
    const booking = await getBookingForUser(refund.booking_id, { role: 'admin' });
    if (booking?.player_id) await notifyPlayer({
      userId: booking.player_id, type: 'refund', title: 'Refund completed',
      message: `A refund of ${Number(refund.amount).toFixed(2)} has been marked completed for your booking.`,
      data: { bookingId: booking.id, refundId: refund.id, eventKey: `refund-completed:${refund.id}` },
    });
  } catch (error) { console.error('Refund completion notification failed:', error.message); }
};
const scheduleBookingReminder = async (booking) => {
  if (!booking?.player_id || !bookingReminderQueue) return;
  const date = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date || '').slice(0, 10);
  const time = String(booking.start_time || '').slice(0, 8).padEnd(8, '0');
  const startsAt = new Date(`${date}T${time}+06:00`).getTime();
  if (!Number.isFinite(startsAt) || startsAt <= Date.now()) return;
  try {
    await bookingReminderQueue.add('booking-reminder', { bookingId: booking.id }, {
      jobId: `booking-reminder-${booking.id}`,
      delay: Math.max(0, startsAt - 2 * 60 * 60 * 1000 - Date.now()),
      removeOnComplete: { age: 30 * 24 * 60 * 60 }, removeOnFail: 100,
    });
  } catch (error) { console.error('Booking reminder could not be scheduled:', error.message); }
};

const authCodeHash = (userId, purpose, code) => crypto.createHmac('sha256', JWT_REFRESH_SECRET).update(`${userId}:${purpose}:${code}`).digest('hex');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const renderBrandedEmail = ({ preheader = '', title, body }) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f1f5f2;font-family:Arial,Helvetica,sans-serif;color:#14251b"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f2;padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe8e1;border-radius:18px;overflow:hidden"><tr><td style="background:#0a1e14;padding:24px 32px"><div style="font-size:20px;font-weight:800;letter-spacing:.2px;color:#fff">Turfy<span style="color:#c8ff5e">Slot</span></div><div style="font-size:11px;color:#b7c5bb;margin-top:5px">BOOK YOUR GAME. OWN THE MOMENT.</div></td></tr><tr><td style="padding:32px"><h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#13271b">${escapeHtml(title)}</h1><div style="font-size:15px;line-height:1.7;color:#425247">${body}</div><div style="height:1px;background:#e7eee9;margin:28px 0 18px"></div><p style="font-size:12px;line-height:1.6;color:#78857c;margin:0">This is an automated message from TurfySlot. If you did not expect this email, you can ignore it.</p></td></tr><tr><td style="background:#f8faf8;padding:16px 32px;color:#829087;font-size:11px">(c) ${new Date().getFullYear()} TurfySlot | Turf booking made simple</td></tr></table></td></tr></table></body></html>`;
const issueAuthCodeForUser = async (user, purpose) => {
  const smtpConfig = await getActiveSmtpConfig().catch(() => null);
  if (!smtpConfig) return 'unavailable';
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = authCodeHash(user.id, purpose, code);
  const created = await createAuthCode({ userId: user.id, purpose, codeHash, lifetimeMinutes: 15 });
  if (!created) return 'throttled';
  const isReset = purpose === 'password_reset';
  const title = isReset ? 'Password reset code' : 'Email verification code';
  try {
    await createSmtpTransport(smtpConfig).sendMail({
      from: `"${smtpConfig.fromName || 'TurfySlot'}" <${smtpConfig.fromEmail}>`, to: user.email,
      subject: `TurfySlot ${title}`,
      text: `Hello ${user.name}, your ${isReset ? 'password reset' : 'email verification'} code is ${code}. It expires in 15 minutes.`,
      html: renderBrandedEmail({
        preheader: `${title} - valid for 15 minutes`,
        title,
        body: `<p style="margin:0 0 16px">Hello ${escapeHtml(user.name)},</p><p style="margin:0 0 10px">Use this one-time code to continue:</p><div style="display:inline-block;background:#f1f7ef;border:1px solid #d8e8d4;border-radius:12px;padding:14px 22px;font-size:28px;font-weight:800;letter-spacing:7px;color:#183d26">${escapeHtml(code)}</div><p style="margin:18px 0 0">This code expires in <strong>15 minutes</strong>. If you did not request it, ignore this email.</p>`,
      }),
    });
    return 'sent';
  } catch (error) {
    await invalidateAuthCodes(user.id, purpose);
    console.error('Authentication email delivery failed:', error.message);
    return 'unavailable';
  }
};

app.post('/api/auth/email/verification/request', authLimiter, requireAuth, async (req, res) => {
  const user = await findUserById(req.user.id);
  if (user?.email_verified_at) return res.status(409).json({ success: false, message: 'Email is already verified.' });
  try {
    const result = await issueAuthCodeForUser(user, 'email_verification');
    if (result === 'throttled') return res.status(429).json({ success: false, message: 'Wait one minute before requesting another code.' });
    if (result !== 'sent') return res.status(503).json({ success: false, message: 'Email verification is temporarily unavailable. Contact the platform administrator.' });
    res.json({ success: true, message: `A verification code was sent to ${user.email}.` });
  } catch (error) { console.error('Email verification code request failed:', error.message); res.status(500).json({ success: false, message: 'Unable to send a verification code.' }); }
});

app.patch('/api/auth/player/email', authLimiter, requireAuth, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  if (req.user.role !== 'player') return res.status(403).json({ success: false, message: 'Only player accounts can use this email correction flow.' });
  try {
    const user = await updateUnverifiedPlayerEmail({ userId: req.user.id, email });
    const safe = sanitizeUser(user);
    let delivery = 'unavailable';
    try { delivery = await issueAuthCodeForUser(user, 'email_verification'); } catch (error) { console.error('Replacement verification email failed:', error.message); }
    if (delivery === 'sent') return res.json({ success: true, emailUpdated: true, data: { user: safe }, message: `Email updated. A fresh verification code was sent to ${safe.email}.` });
    if (delivery === 'throttled') return res.status(429).json({ success: false, emailUpdated: true, data: { user: safe }, message: 'Email updated. Wait one minute, then request a fresh verification code.' });
    return res.status(503).json({ success: false, emailUpdated: true, data: { user: safe }, message: 'Email updated, but a verification code could not be sent. Use Resend code to try again.' });
  } catch (error) {
    const expected = /only a player|cannot be changed|different email|already registered|valid email/i.test(error.message);
    if (!expected) console.error('Unverified player email correction failed:', error.message);
    res.status(expected ? 409 : 500).json({ success: false, message: expected ? error.message : 'Unable to update the email address.' });
  }
});

app.post('/api/auth/email/verification/confirm', requireAuth, emailVerificationCodeLimiter, async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Enter the six-digit code from your email.' });
  try {
    const verified = await consumeAuthCode({ userId: req.user.id, purpose: 'email_verification', codeHash: authCodeHash(req.user.id, 'email_verification', code) });
    if (!verified) return res.status(400).json({ success: false, message: 'The code is invalid, expired, or has already been used.' });
    res.json({ success: true, message: 'Email verified. You can now book a turf.' });
  } catch (error) { console.error('Email verification failed:', error.message); res.status(500).json({ success: false, message: 'Unable to verify the email.' }); }
});

app.post('/api/auth/password-reset/request', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  try {
    const user = await findUserByEmail(email);
    if (user) await issueAuthCodeForUser(user, 'password_reset');
    res.json({ success: true, message: 'If an account exists for that email, a reset code will be sent.' });
  } catch (error) { console.error('Password reset request failed:', error.message); res.status(500).json({ success: false, message: 'Unable to process the reset request.' }); }
});

app.post('/api/auth/password-reset/confirm', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 200) return res.status(400).json({ success: false, message: 'Enter the email, six-digit code, and a password at least 8 characters long.' });
  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ success: false, message: 'The code is invalid or expired.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const reset = await consumeAuthCode({ userId: user.id, purpose: 'password_reset', codeHash: authCodeHash(user.id, 'password_reset', code), passwordHash });
    if (!reset) return res.status(400).json({ success: false, message: 'The code is invalid, expired, or has already been used.' });
    res.json({ success: true, message: 'Password reset. Sign in with your new password.' });
  } catch (error) { console.error('Password reset confirmation failed:', error.message); res.status(500).json({ success: false, message: 'Unable to reset the password.' }); }
});

app.post('/api/email/send-test', requireAuth, requireRole('admin'), async (req, res) => {
  const toEmail = String(req.body.toEmail || '').trim();
  const configId = String(req.body.configId || '');
  if (!/^\S+@\S+\.\S+$/.test(toEmail) || !configId) return res.status(400).json({ success: false, message: 'A valid recipient and saved SMTP configuration are required.' });
  try {
    const smtpConfig = (await listSmtpConfigs()).find((config) => config.id === configId);
    if (!smtpConfig) return res.status(404).json({ success: false, message: 'SMTP configuration was not found.' });
    const transporter = createSmtpTransport(smtpConfig);
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"${smtpConfig.fromName || 'TurfySlot'}" <${smtpConfig.fromEmail}>`,
      to: toEmail,
      subject: 'TurfySlot SMTP Test Email',
      text: 'This is a test email confirming your TurfySlot SMTP configuration is working correctly.',
      html: renderBrandedEmail({ preheader: 'Your outgoing email configuration is working.', title: 'Email is working', body: '<p style="margin:0">This message confirms that your TurfySlot SMTP settings can deliver email successfully.</p>' }),
    });
    res.json({ success: true, message: 'Test email sent successfully.', messageId: info.messageId });
  } catch (error) {
    console.error('SMTP test failed:', error.message);
    res.status(502).json({ success: false, message: 'Failed to verify the SMTP configuration or send the test email.' });
  }
});

app.post('/api/email/send', requireAuth, requireRole('admin'), async (req, res) => {
  const toEmail = String(req.body.toEmail || '').trim();
  const subject = String(req.body.subject || '').trim();
  const html = typeof req.body.html === 'string' ? req.body.html : '';
  const text = typeof req.body.text === 'string' ? req.body.text : '';
  if (!/^\S+@\S+\.\S+$/.test(toEmail) || !subject || subject.length > 200 || html.length > 100_000 || text.length > 100_000) {
    return res.status(400).json({ success: false, message: 'Provide a valid recipient, subject, and email body.' });
  }
  try {
    const smtpConfig = await getActiveSmtpConfig();
    if (!smtpConfig) return res.status(503).json({ success: false, message: 'No active SMTP configuration is available.' });
    const transporter = createSmtpTransport(smtpConfig);
    const info = await transporter.sendMail({
      from: `"${smtpConfig.fromName || 'TurfySlot'}" <${smtpConfig.fromEmail}>`,
      to: toEmail,
      subject,
      text: text || '',
      html: html || text || '',
    });
    res.json({ success: true, message: 'Email sent successfully.', messageId: info.messageId });
  } catch (error) {
    console.error('Admin email send failed:', error.message);
    res.status(502).json({ success: false, message: 'Failed to send email.' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

const autoApproveOverdueCancellationRequests = async () => {
  const overdue = await listExpiredCancellationRequests();
  for (const request of overdue) {
    try {
      const owner = await findUserById(request.owner_id);
      const booking = await getBookingForUser(request.booking_id, { role: 'admin' });
      if (!owner || !booking || booking.cancellation_request_status !== 'pending') continue;
      const reason = 'Automatically approved because the owner did not respond within 24 hours.';
      await cancelBookingAndQueueRefund({ bookingId: booking.id, actorId: null,
        reason: booking.cancellation_request_reason || reason, refundPercentage: Number(request.refund_percentage), actorRole: 'system', refundInitiator: 'player' });
      await recordCancellationRequestDecision({ bookingId: booking.id, ownerId: owner.id, decision: 'approved', reason });
      if (booking.player_id) await notifyPlayer({ userId: booking.player_id, type: 'booking', title: 'Cancellation request auto-approved',
        message: `The owner did not respond within 24 hours. Your request was approved using the saved ${Number(request.refund_percentage)}% policy calculation.`,
        data: { bookingId: booking.id, eventKey: `cancellation-request-auto-approved:${booking.id}` } });
    } catch (error) {
      if (!/confirmed bookings|state changed|not found|already resolved/i.test(error.message)) console.error('Overdue cancellation request could not be resolved:', error.message);
    }
  }
};

const runOwnerSubscriptionCycle = async () => {
  const { reminders, overdueOwners } = await processOwnerSubscriptionCycle();
  for (const reminder of reminders) {
    const dueText = reminder.daysUntilDue === 0 ? 'today' : 'in 7 days';
    await notifyPlayer({
      userId: reminder.ownerId, type: 'payment', title: 'Monthly subscription payment reminder',
      message: `Your Turfyslot monthly subscription payment is due ${dueText} (${reminder.dueDate}). Please arrange payment with the platform admin.`,
      data: { subscriptionPeriod: reminder.dueDate, eventKey: `subscription-reminder:${reminder.ownerId}:${reminder.dueDate}:${reminder.daysUntilDue}` },
    });
  }
  for (const owner of overdueOwners) {
    await notifyPlayer({
      userId: owner.ownerId, type: 'payment', title: 'Turfs disabled for overdue subscription',
      message: `The subscription due on ${owner.dueDate} is more than five days overdue. Your active turfs have been made unavailable until payment is recorded.`,
      data: { subscriptionPeriod: owner.dueDate, eventKey: `subscription-disabled:${owner.ownerId}:${owner.dueDate}` },
    });
  }
};

connectDatabase()
  .then(() => migrateSensitivePayoutDetails())
  .then(() => {
    const beginListening = async () => {
      if (bookingExpiryQueue) {
        await rateLimitRedis.ping();
        await Promise.all([expirePendingBookingHolds(), releaseMaturedWalletHolds(), completeEndedBookings(), autoApproveOverdueCancellationRequests(), runOwnerSubscriptionCycle()]);
        await bookingExpiryQueue.add('sweep-expired-holds', {}, { repeat: { every: 60_000 }, jobId: 'sweep-expired-holds' });
        await bookingExpiryQueue.add('release-wallet-holds', {}, { repeat: { every: 60_000 }, jobId: 'release-wallet-holds' });
        await bookingExpiryQueue.add('complete-ended-bookings', {}, { repeat: { every: 60_000 }, jobId: 'complete-ended-bookings' });
        await bookingExpiryQueue.add('resolve-cancellation-requests', {}, { repeat: { every: 60_000 }, jobId: 'resolve-cancellation-requests' });
        await bookingExpiryQueue.add('owner-subscription-cycle', {}, { repeat: { every: 60_000 }, jobId: 'owner-subscription-cycle' });
        bookingExpiryWorker = new Worker('booking-expiry', async (job) => {
          if (job.name === 'sweep-expired-holds') return expirePendingBookingHolds();
          if (job.name === 'release-wallet-holds') return releaseMaturedWalletHolds();
          if (job.name === 'complete-ended-bookings') return completeEndedBookings();
          if (job.name === 'resolve-cancellation-requests') return autoApproveOverdueCancellationRequests();
          if (job.name === 'owner-subscription-cycle') return runOwnerSubscriptionCycle();
          return undefined;
        }, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
        bookingReminderWorker = new Worker('booking-reminders', async (job) => {
          const booking = await getBookingForUser(job.data.bookingId, { role: 'admin' });
          if (!booking || booking.status !== 'confirmed' || !booking.player_id) return;
          const date = booking.booking_date instanceof Date ? booking.booking_date.toISOString().slice(0, 10) : String(booking.booking_date || '').slice(0, 10);
          const time = String(booking.start_time || '').slice(0, 8).padEnd(8, '0');
          if (new Date(`${date}T${time}+06:00`).getTime() <= Date.now()) return;
          const eventKey = `booking-reminder:${booking.id}`;
          await notifyPlayer({
            userId: booking.player_id, type: 'booking', title: 'Booking reminder',
            message: `Your booking at ${booking.turf_name || 'the turf'} starts in about two hours.`,
            data: { bookingId: booking.id, eventKey },
          });
        }, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
        notificationEmailWorker = new Worker('email-notifications', async (job) => {
          if (job.name === 'send-notification-email') return sendNotificationEmail(job.data);
          return undefined;
        }, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
        pushNotificationWorker = new Worker('push-notifications', async (job) => {
          if (job.name === 'send-push-notification') return sendWebPushNotifications(job.data);
          return undefined;
        }, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
        if (notificationSmsQueue) notificationSmsWorker = new Worker('sms-notifications', async (job) => {
          if (job.name === 'send-sms-notification') return sendNotificationSms(job.data);
          return undefined;
        }, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
      } else {
        const expirySweep = setInterval(() => Promise.all([expirePendingBookingHolds(), releaseMaturedWalletHolds(), completeEndedBookings(), autoApproveOverdueCancellationRequests(), runOwnerSubscriptionCycle()])
          .catch((error) => console.error('Booking and wallet sweep failed:', error.message)), 60_000);
        expirySweep.unref();
        expirePendingBookingHolds().catch((error) => console.error('Initial booking expiry sweep failed:', error.message));
        releaseMaturedWalletHolds().catch((error) => console.error('Initial wallet release sweep failed:', error.message));
        completeEndedBookings().catch((error) => console.error('Initial ended booking completion sweep failed:', error.message));
      }
      app.listen(PORT, () => console.log(`Turfyslot server listening on port ${PORT} (${dbProvider}).`));
    };
    return beginListening();
  })
  .catch((error) => {
    console.error('Database startup failed:', error.message);
    process.exitCode = 1;
  });

process.on('SIGTERM', async () => {
  if (notificationSmsWorker) await notificationSmsWorker.close();
  if (pushNotificationWorker) await pushNotificationWorker.close();
  if (notificationEmailWorker) await notificationEmailWorker.close();
  if (bookingReminderWorker) await bookingReminderWorker.close();
  if (bookingExpiryWorker) await bookingExpiryWorker.close();
  if (notificationSmsQueue) await notificationSmsQueue.close();
  if (pushNotificationQueue) await pushNotificationQueue.close();
  if (notificationEmailQueue) await notificationEmailQueue.close();
  if (bookingReminderQueue) await bookingReminderQueue.close();
  if (bookingExpiryQueue) await bookingExpiryQueue.close();
  if (rateLimitRedis) await rateLimitRedis.quit();
  await closeDatabase();
  process.exit(0);
});
