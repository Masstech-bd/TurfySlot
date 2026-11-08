export type UserRole = 'player' | 'turf_owner' | 'staff' | 'admin';

export type UserStatus = 'active' | 'pending_approval' | 'suspended' | 'deactivated';

export type TurfStatus = 'draft' | 'pending_review' | 'active' | 'inactive' | 'suspended';

export type SlotStatus = 'available' | 'locked' | 'booked' | 'blocked';

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

export type BookingSource = 'online' | 'manual_owner' | 'manual_staff' | 'admin';

export type PaymentMethod = 'sslcommerz' | 'surjopay' | 'uddoktapay' | 'cash' | 'bkash' | 'nagad' | 'rocket' | 'bank_transfer';

export type PaymentStatus = 'paid' | 'pending' | 'partial';

export type OwnerBillingModel = 'commission' | 'monthly_subscription';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  createdAt: string;
  emailVerified?: boolean;
}

export interface TurfOwnerProfile {
  id: string;
  userId: string;
  businessName: string;
  nidOrTradeLicense: string;
  businessVerificationDocuments?: Array<{
    id?: string;
    url?: string;
    fileName: string;
    mimeType: string;
    dataUrl: string;
    documentType: 'trade_license' | 'supporting_business_document';
  }>;
  payoutMethod: 'bkash' | 'nagad' | 'rocket' | 'bank_account';
  payoutDetails: {
    accountNumber: string;
    bankName?: string;
    branchName?: string;
    accountHolderName?: string;
  };
  approvalStatus: 'pending_approval' | 'active' | 'rejected' | 'suspended';
  billingModel?: OwnerBillingModel;
  pendingBillingModel?: OwnerBillingModel;
  billingModelChangeEffectiveDate?: string;
  billingSwitchEnabled?: boolean;
  subscriptionDueDate?: string;
  subscriptionDueAmount?: number;
  subscriptionPaidThrough?: string;
  subscriptionPaidAt?: string;
  subscriptionPaymentReference?: string;
  reviewMessage?: string;
  approvedBy?: string;
  approvedAt?: string;
  commissionOverride?: number; // percentage override e.g. 4%
}

export interface PricingRule {
  id: string;
  label?: string;
  dayOfWeek?: number; // 0 = Sunday, 6 = Saturday; absent for exact-date rules
  date?: string; // YYYY-MM-DD; takes priority over a recurring weekday rule
  startTime: string; // "18:00"
  endTime: string;   // "23:00"
  pricePerHour: number;
}

export interface TurfAddon {
  id: string;
  turfId: string;
  name: string;
  description?: string;
  category: 'equipment' | 'service' | 'food' | 'other';
  price: number;
  stockQuantity?: number | null;
  isActive: boolean;
  displayOrder: number;
}

export interface Turf {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerBillingModel?: OwnerBillingModel;
  name: string;
  description: string;
  address: string;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  sportTypes: string[]; // 'Football', 'Cricket', 'Futsal', 'Badminton'
  amenities: string[];  // 'Floodlights', 'Washroom', 'Dressing Room', 'Parking', 'Seating Area', 'Cafeteria'
  basePricePerHour: number;
  pricingRules?: PricingRule[];
  operatingHours: {
    openTime: string;  // "07:00"
    closeTime: string; // "00:00"
    days?: Record<string, { openTime?: string; closeTime?: string; closed?: boolean; slots?: { startTime: string; endTime: string }[] }>;
    dateRanges?: { startDate: string; endDate: string; slots: { startTime: string; endTime: string }[] }[];
  };
  photos: string[];
  addons?: TurfAddon[];
  status: TurfStatus;
  correctionMessage?: string;
  commissionRateOverride?: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
  cancellationPolicyId?: string;
  effectiveCancellationPolicy?: CancellationPolicy;
  cancellationCutoffHours?: number; // owner-controlled: player cannot cancel within this many hours of slot start
  isFeatured?: boolean;
  featuredUntil?: string; // ISO — when featured placement expires
  featuredPriority?: number; // lower number = higher placement (matches package priority)
}

export interface Slot {
  id: string;
  turfId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "18:00"
  endTime: string;   // "19:00"
  price: number;
  pricingLabel?: string;
  status: SlotStatus;
  lockedUntil?: string;
  lockedByUserId?: string;
}

export interface BookingAddonLineItem {
  id: string;
  addonId: string;
  name: string;
  price: number;
  quantity: number;
  totalPrice: number;
  category?: 'equipment' | 'service' | 'food' | 'other';
}

export interface Booking {
  id: string;
  bookingNumber: string;
  playerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  turfId: string;
  turfName: string;
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotIds?: string[];
  totalHours?: number;
  bookingSource: BookingSource;
  status: BookingStatus;
  baseAmount: number;
  addonTotal?: number;
  bookingAddons?: BookingAddonLineItem[];
  commissionAmount: number; // calculated at confirmation
  platformFeeAmount: number;
  hasGatewayFee: boolean;
  gatewayFeeAmount: number;
  totalPaid: number;
  netOwnerAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  notes?: string;
  cancellationPolicyId?: string;
  expiresAt?: string;
  cancellationReason?: string;
  cancellationRequestStatus?: 'pending' | 'approved' | 'rejected';
  cancellationRequestReason?: string;
  cancellationRequestedAt?: string;
  cancellationRequestRefundPercentage?: number;
  cancellationDecisionReason?: string;
  cancellationDecidedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  refundAmount?: number;
  refundedPlatformFee?: number;
  qrCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPermission {
  id: string;
  key:
    | 'bookings.view'
    | 'bookings.view_player_contact'
    | 'bookings.check_in'
    | 'bookings.complete'
    | 'bookings.cancel'
    | 'bookings.create_manual'
    | 'slots.view'
    | 'slots.block'
    | 'slots.unblock';
  label: string;
  description: string;
}

export interface StaffAssignment {
  id: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  staffPhone: string;
  ownerId: string;
  turfIds: string[];
  permissions: string[];
  status: 'pending_setup' | 'active';
  invitedAt?: string;
  setupLink?: string;
  createdAt: string;
}

export interface OwnerWallet {
  ownerId: string;
  availableBalance: number;
  heldBalance: number; // Held for bookings still inside cancellation window
  totalEarnings: number;
  totalWithdrawn: number;
}

export interface WithdrawalRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  businessName: string;
  amount: number;
  payoutMethod: string;
  payoutDetails: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  reference?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface RefundRequest {
  id: string;
  bookingId: string;
  bookingNumber: string;
  playerName: string;
  turfName: string;
  amount: number;
  bookingSource: BookingSource;
  status: 'pending' | 'processing';
  gatewaySupported: boolean;
  paymentGateway?: string;
  gatewayRefundReference?: string;
  gatewayRequestId?: string;
  gatewayError?: string;
  createdAt: string;
}

export interface CancellationTier {
  id: string;
  minHoursBefore: number; // e.g. 24
  maxHoursBefore?: number; // e.g. 9999
  refundPercentage: number; // e.g. 100, 50, 0
  description: string;
}

export interface CancellationPolicy {
  id: string;
  name: string;
  isDefault: boolean;
  ownerId?: string;
  turfId?: string;
  description: string;
  tiers: CancellationTier[];
}

export interface Review {
  id: string;
  bookingId: string;
  playerId: string;
  playerName: string;
  turfId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  bookingNumber: string;
  raisedByUserId: string;
  raisedByName: string;
  role: UserRole;
  category: 'refund_issue' | 'facility_unavailable' | 'double_booking' | 'payment_mismatch' | 'other';
  description: string;
  status: 'pending' | 'investigating' | 'resolved' | 'rejected';
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  role: UserRole;
  type: 'booking' | 'payment' | 'refund' | 'approval' | 'system' | 'dispute';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface PlatformSettings {
  globalCommissionRate: number; // e.g. 5%
  platformFeeRate: number;      // e.g. 5%
  gatewayFeeRate: number;       // e.g. 2.5%
  monthlySubscriptionAmount?: number;
  bookingHoldMinutes?: number;
  autoCheckInEnabled?: boolean;
  autoCompleteEnabled?: boolean;
  ownerBillingSwitchEnabled?: boolean;
  platformFeeEnabled?: boolean;
  gatewayFeeEnabled?: boolean;
  showFeeBreakdown?: boolean;
  minWithdrawalAmount: number;  // e.g. 1000 BDT
  defaultCancellationWindowHours: number; // e.g. 24
  supportedSports: string[];
  enableOpenMatches?: boolean;
  enableTournaments?: boolean;
  featureFlags?: {
    addons_enabled: boolean;
    squad_enabled: boolean;
    tournament_enabled: boolean;
    featured_turf_enabled: boolean;
    featured_addon_enabled: boolean;
    whatsapp_enabled: boolean;
    trending_enabled: boolean;
    near_you_enabled: boolean;
  };
  featuredPackages?: Array<{
    id: string;
    name: string;
    price: number;
    durationDays: number;
    priority: number;
    description: string;
  }>;
  /** Admin-configured pay-to numbers shown to owners when requesting Featured listing */
  featuredPaymentInfo?: {
    bkashNumber: string;
    nagadNumber?: string;
    rocketNumber?: string;
    bankDetails?: string;
    instructions: string;
  };
  paymentGateways?: PaymentGatewayConfig[];
  smtpConfigs?: SmtpConfig[];
}

export interface SupportFaq {
  id: string;
  question: string;
  answer: string;
}

export interface SupportSettings {
  email: string;
  phoneOne: string;
  phoneTwo: string;
  address: string;
  faqs: SupportFaq[];
}

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  email: 'masstech.ctg@gmail.com',
  phoneOne: '013218850',
  phoneTwo: '01712906544',
  address: '3rd Floor, Hafez Plaza, 425 Pathantuli, Chittagong',
  faqs: [],
};

export type FeaturedRequestStatus =
  | 'pending_payment'
  | 'payment_submitted'
  | 'pending_approval'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface FeaturedRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  turfId: string;
  turfName: string;
  packageId: string;
  packageName: string;
  amount: number;
  cashPaid?: number;
  creditApplied?: number;
  gatewayFeeAmount?: number;
  durationDays: number;
  priority: number;
  status: FeaturedRequestStatus;
  paymentMethod?: string;
  paymentReference?: string;
  paymentNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
}

export type PaymentGatewayProvider = 'sslcommerz' | 'surjopay' | 'uddoktapay';

export interface PaymentGatewayConfig {
  id: string;
  provider: PaymentGatewayProvider;
  label: string;
  isSandbox: boolean;
  isActive: boolean;
  storeId?: string;
  prefix?: string;
  ipnUrl?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  passwordSet?: boolean;
  apiKeySet?: boolean;
  automatedRefundsEnabled?: boolean;
}

export interface SmtpConfig {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean; // true = SSL/TLS (usually port 465), false = STARTTLS (usually 587/2525)
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  passwordSet?: boolean;
}


// Section 49: Player Squad / Matchmaking
export type OpenMatchSkillLevel = 'casual' | 'intermediate' | 'competitive';
export type OpenMatchStatus = 'open' | 'full' | 'closed' | 'cancelled';
export type MatchParticipantStatus = 'joined' | 'left' | 'removed';

export interface OpenMatch {
  id: string;
  bookingId: string;
  bookingNumber: string;
  captainId: string;
  captainName: string;
  captainPhone: string;
  turfId: string;
  turfName: string;
  date: string;
  startTime: string;
  endTime: string;
  area: string;
  sportType: string;
  skillLevel: OpenMatchSkillLevel;
  maxPlayers: number;
  joinedCount: number;
  status: OpenMatchStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  playerId: string;
  playerName: string;
  playerPhone: string;
  joinedAt: string;
  status: MatchParticipantStatus;
}

// Section 50: Tournament (Simple Version)
export type TournamentStatus = 'pending_review' | 'changes_requested' | 'open' | 'registration_closed' | 'ongoing' | 'completed' | 'cancelled';
export type TournamentTeamStatus = 'pending_roster' | 'registered' | 'withdrawn' | 'disqualified';
export type TournamentMatchStatus = 'scheduled' | 'completed' | 'cancelled';

export interface TournamentRosterMember {
  id: string;
  teamId: string;
  playerId?: string;
  memberName: string;
  status: 'manual' | 'pending' | 'accepted' | 'declined';
  isManual?: boolean;
  createdAt?: string;
  respondedAt?: string;
}

export interface TournamentPlayerSearchResult { id: string; name: string }

export interface Tournament {
  id: string;
  turfId: string;
  turfName: string;
  organizerId: string;
  organizerName: string;
  name: string;
  sportType: string;
  format: string; // e.g. 'Knockout', 'Round Robin'
  startDate: string;
  endDate: string;
  maxTeams: number;
  teamSize?: number;
  entryFeeAmount?: number; // display text only, platform moves no money
  prizePoolNote?: string;  // display text only
  status: TournamentStatus;
  description: string;
  createdAt: string;
  reviewMessage?: string;
  reviewRevision?: number;
}

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  captainId: string;
  captainName: string;
  captainPhone: string;
  teamName: string;
  rosterNotes?: string;
  status: TournamentTeamStatus;
  registeredAt: string;
  rosterMembers?: TournamentRosterMember[];
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  roundName: string;
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  scheduledDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  slotId?: string;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string;
  status: TournamentMatchStatus;
  createdAt: string;
}
