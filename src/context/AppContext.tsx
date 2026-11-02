import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  UserRole,
  TurfOwnerProfile,
  Turf,
  Slot,
  Booking,
  BookingSource,
  PaymentMethod,
  PaymentStatus,
  StaffAssignment,
  OwnerWallet,
  WithdrawalRequest,
  RefundRequest,
  CancellationPolicy,
  Review,
  Dispute,
  AppNotification,
  PlatformSettings,
  SmtpConfig,
  PaymentGatewayConfig,
  OpenMatch,
  MatchParticipant,
  OpenMatchSkillLevel,
  Tournament,
  TournamentTeam,
  TournamentMatch,
  TournamentMatchStatus,
  TournamentPlayerSearchResult,
  FeaturedRequest,
  OwnerBillingModel,
} from '../types';
import { apiFetch, restoreSession, setAccessToken } from '../utils/apiClient';
import { showAppAlert } from '../components/common/AppDialog';

const sumPaidWithdrawals = (rows: unknown): number => Array.isArray(rows)
  ? rows.reduce((sum: number, value) => {
      const row = value as Record<string, unknown>;
      return ['paid', 'completed'].includes(String(row.status || '').toLowerCase()) ? sum + Number(row.amount || 0) : sum;
    }, 0)
  : 0;

interface AppContextType {
  // Current active impersonated user & role
  currentUser: User;
  isAuthenticated: boolean;
  isSignInModalOpen: boolean;
  setIsSignInModalOpen: (open: boolean) => void;
  isGetStartedModalOpen: boolean;
  setIsGetStartedModalOpen: (open: boolean) => void;
  signInRolePreset?: UserRole;
  openSignInModal: (role?: UserRole) => void;
  openGetStartedModal: (role?: 'player' | 'turf_owner') => void;
  loginWithCredentials: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  logoutUser: () => void;
  playerActiveTab: 'explore' | 'my_bookings' | 'favorites' | 'squads' | 'tournaments';
  setPlayerActiveTab: (tab: 'explore' | 'my_bookings' | 'favorites' | 'squads' | 'tournaments') => void;
  ownerActiveTab: 'bookings' | 'turfs' | 'slots' | 'staff' | 'wallet' | 'tournaments';
  setOwnerActiveTab: (tab: 'bookings' | 'turfs' | 'slots' | 'staff' | 'wallet' | 'tournaments') => void;
  adminActiveTab: 'approvals' | 'users' | 'withdrawals' | 'policy_engine' | 'settings' | 'reports' | 'bookings' | 'disputes' | 'tournaments';
  setAdminActiveTab: (tab: 'approvals' | 'users' | 'withdrawals' | 'policy_engine' | 'settings' | 'reports' | 'bookings' | 'disputes' | 'tournaments') => void;
  openOwnerManualBookingModal: boolean;
  setOpenOwnerManualBookingModal: (open: boolean) => void;
  openStaffManualBookingModal: boolean;
  setOpenStaffManualBookingModal: (open: boolean) => void;
  registerNewUser: (params: {
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    businessName?: string;
    nidOrTradeLicense?: string;
    businessVerificationDocuments?: Array<{ fileName: string; mimeType: string; dataUrl: string; documentType: 'trade_license' | 'supporting_business_document' }>;
    payoutMethod?: 'bkash' | 'nagad' | 'rocket' | 'bank_account';
    accountNumber?: string;
    billingModel?: OwnerBillingModel;
    password?: string;
  }) => Promise<User>;
  verifyActivationCode: (code: string) => Promise<{ success: boolean; message: string }>;
  updateUnverifiedEmail: (email: string) => Promise<{ success: boolean; message: string; emailUpdated?: boolean }>;
  resendActivationCode: () => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  switchRoleDirectly: (role: UserRole) => void;

  // Data
  users: User[];
  ownerProfiles: TurfOwnerProfile[];
  turfs: Turf[];
  slots: Slot[];
  bookings: Booking[];
  staffAssignments: StaffAssignment[];
  wallets: Record<string, OwnerWallet>;
  withdrawals: WithdrawalRequest[];
  pendingRefunds: RefundRequest[];
  refreshPendingRefunds: () => Promise<void>;
  refreshTurfs: () => Promise<void>;
  cancellationPolicies: CancellationPolicy[];
  reviews: Review[];
  disputes: Dispute[];
  notifications: AppNotification[];
  settings: PlatformSettings;
  favorites: string[];

  // Section 49: Squads & Open Matches Data
  openMatches: OpenMatch[];
  matchParticipants: MatchParticipant[];

  // Section 50: Tournaments Data
  tournaments: Tournament[];
  tournamentTeams: TournamentTeam[];
  tournamentMatches: TournamentMatch[];

  // Actions: Booking & Slots
  unlockSlots: (slotIds: string[]) => void;
  createManualBooking: (params: {
    turfId: string;
    slotId: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    paymentAmount?: number;
    paymentReference?: string;
    notes?: string;
  }) => Promise<{ booking: Booking | null; error?: string }>;
  cancelBooking: (bookingId: string, reason: string, isOwnerInitiated?: boolean) => Promise<{ success: boolean; refundAmount: number; message: string }>;
  decideCancellationRequest: (bookingId: string, decision: 'approve' | 'reject', reason: string) => Promise<{ success: boolean; message: string }>;
  checkInBooking: (bookingId: string) => Promise<boolean>;
  completeBooking: (bookingId: string) => Promise<boolean>;
  toggleSlotBlock: (slotId: string) => Promise<boolean>;
  loadAvailability: (turfId: string, date: string) => Promise<void>;

  // Actions: Turf Management
  createTurf: (turfData: Omit<Turf, 'id' | 'createdAt' | 'rating' | 'reviewCount'>) => Promise<Turf | null>;
  updateTurf: (turfId: string, updates: Partial<Turf>) => Promise<Turf | null>;
  uploadTurfPhotos: (turfId: string, files: File[]) => Promise<{ success: boolean; message: string }>;
  updateProfileImage: (file: File) => Promise<{ success: boolean; message: string }>;
  deleteTurf: (turfId: string) => Promise<{ success: boolean; message: string }>;
  approveTurf: (turfId: string) => void;
  rejectTurf: (turfId: string) => void;

  // Actions: User & Staff Management
  approveOwner: (userId: string) => void;
  rejectOwner: (userId: string) => void;
  requestOwnerCorrections: (userId: string, message: string) => Promise<{ success: boolean; message: string }>;
  updatePendingOwnerVerification: (tradeLicenseNumber: string, tradeLicenseFile: File, supportingFiles: File[]) => Promise<{ success: boolean; message: string }>;
  updateOwnerPayoutDetails: (updates: {
    payoutMethod: 'bkash' | 'nagad' | 'rocket' | 'bank_account';
    accountNumber: string;
    bankName?: string;
    branchName?: string;
    accountHolderName?: string;
  }) => Promise<{ success: boolean; message: string }>;
  toggleUserSuspension: (userId: string) => void;
  createStaff: (name: string, email: string, phone: string, turfIds: string[], permissions: string[]) => Promise<boolean>;
  updateStaffPermissions: (staffId: string, permissions: string[], turfIds: string[]) => void;

  // Actions: Financials & Withdrawals
  requestWithdrawal: (amount: number, payoutMethod: string, payoutDetails: string) => Promise<{ success: boolean; message: string }>;
  approveWithdrawal: (withdrawalId: string, reference: string) => void;
  rejectWithdrawal: (withdrawalId: string, reason: string) => void;
  processRefundWithGateway: (refundId: string, provider: 'sslcommerz' | 'uddoktapay') => Promise<{ success: boolean; message: string }>;
  markRefundProcessed: (refundId: string, reference: string) => Promise<{ success: boolean; message: string }>;
  updatePlatformSettings: (updates: Partial<PlatformSettings>) => void;
  scheduleOwnerBillingModelChange: (billingModel: OwnerBillingModel | null) => Promise<{ success: boolean; message: string }>;

  // Actions: Policy & Disputes & Reviews
  addCancellationPolicy: (policy: Omit<CancellationPolicy, 'id'>) => Promise<void>;
  updateCancellationPolicy: (policyId: string, updates: Partial<CancellationPolicy>) => Promise<void>;
  deleteCancellationPolicy: (policyId: string) => Promise<void>;
  calculateRefund: (booking: Booking, isOwnerCancel?: boolean) => { refundPercentage: number; playerRefund: number; adminKeep: number; gatewayFeeDeducted: number };
  addReview: (bookingId: string, rating: number, comment: string) => Promise<{ success: boolean; message?: string }>;
  raiseDispute: (bookingId: string, category: Dispute['category'], description: string) => Promise<boolean>;
  resolveDispute: (disputeId: string, resolution: string) => void;
  toggleFavorite: (turfId: string) => Promise<void>;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;

  // Section 49: Squads & Open Matches Actions
  createOpenMatch: (params: {
    bookingId: string;
    skillLevel: OpenMatchSkillLevel;
    maxPlayers: number;
    notes?: string;
  }) => Promise<{ success: boolean; message: string; match?: OpenMatch }>;
  updateOpenMatch: (matchId: string, updates: Partial<OpenMatch>) => Promise<void>;
  cancelOpenMatch: (matchId: string) => Promise<{ success: boolean; message: string }>;
  joinOpenMatch: (matchId: string) => Promise<{ success: boolean; message: string }>;
  leaveOpenMatch: (matchId: string) => Promise<{ success: boolean; message: string }>;
  removeMatchParticipant: (matchId: string, playerId: string) => Promise<{ success: boolean; message: string }>;

  // Section 50: Tournaments Actions
  createTournament: (params: {
    turfId: string;
    name: string;
    sportType: string;
    format: string;
    startDate: string;
    endDate: string;
    maxTeams: number;
    teamSize: number;
    entryFeeAmount?: number;
    prizePoolNote?: string;
    description: string;
  }) => Promise<Tournament>;
  updateTournament: (id: string, updates: Partial<Tournament>) => Promise<Tournament | null>;
  resubmitTournament: (id: string) => Promise<Tournament>;
  decideTournamentReview: (id: string, decision: 'approve' | 'request_changes', message?: string) => Promise<void>;
  cancelTournament: (id: string) => Promise<void>;
  registerTournamentTeam: (tournamentId: string, teamName: string, rosterNotes?: string, rosterMembers?: Array<{ memberName?: string; playerId?: string }>) => Promise<{ success: boolean; message: string; team?: TournamentTeam }>;
  searchTournamentPlayers: (tournamentId: string, query: string) => Promise<TournamentPlayerSearchResult[]>;
  respondTournamentInvitation: (tournamentId: string, memberId: string, decision: 'accept' | 'decline') => Promise<void>;
  withdrawTournamentTeam: (tournamentId: string, teamId: string) => Promise<{ success: boolean; message: string }>;
  addOrUpdateTournamentMatch: (tournamentId: string, matchData: {
    id?: string;
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
    status?: TournamentMatchStatus;
  }) => Promise<TournamentMatch>;

  // Section 52: Featured Turf Listing
  featuredRequests: FeaturedRequest[];
  requestFeaturedListing: (params: {
    turfId: string;
    packageId: string;
    applyCredits?: boolean;
  }) => Promise<{ success: boolean; message: string; request?: FeaturedRequest; checkoutUrl?: string | null }>;
  cancelFeaturedListing: (listingId: string, reason: string) => Promise<{ success: boolean; message: string; creditIssued?: number }>;
  adminCancelFeaturedListing: (listingId: string, reason: string, ownerFault: boolean) => Promise<{ success: boolean; message: string }>;
  approveFeaturedRequest: (requestId: string) => Promise<{ success: boolean; message: string }>;
  rejectFeaturedRequest: (requestId: string, reason: string, ownerFault: boolean) => Promise<{ success: boolean; message: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const GUEST_USER: User = {
  id: 'guest',
  name: 'Guest',
  email: '',
  phone: '',
  role: 'player',
  status: 'active',
  createdAt: '',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('guest');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [playerActiveTab, setPlayerActiveTab] = useState<'explore' | 'my_bookings' | 'favorites' | 'squads' | 'tournaments'>('explore');
  const [ownerActiveTab, setOwnerActiveTab] = useState<'bookings' | 'turfs' | 'slots' | 'staff' | 'wallet' | 'tournaments'>('bookings');
  const [adminActiveTab, setAdminActiveTab] = useState<'approvals' | 'users' | 'withdrawals' | 'policy_engine' | 'settings' | 'reports' | 'bookings' | 'disputes' | 'tournaments'>('approvals');
  const [openOwnerManualBookingModal, setOpenOwnerManualBookingModal] = useState<boolean>(false);
  const [openStaffManualBookingModal, setOpenStaffManualBookingModal] = useState<boolean>(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState<boolean>(false);
  const [isGetStartedModalOpen, setIsGetStartedModalOpen] = useState<boolean>(false);
  const [signInRolePreset, setSignInRolePreset] = useState<UserRole | undefined>(undefined);
  const [ownerProfiles, setOwnerProfiles] = useState<TurfOwnerProfile[]>([]);
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
  const [wallets, setWallets] = useState<Record<string, OwnerWallet>>({});
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [pendingRefunds, setPendingRefunds] = useState<RefundRequest[]>([]);
  const [cancellationPolicies, setCancellationPolicies] = useState<CancellationPolicy[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>({
    globalCommissionRate: 0,
    platformFeeRate: 0,
    gatewayFeeRate: 0,
    monthlySubscriptionAmount: 0,
    ownerBillingSwitchEnabled: false,
    platformFeeEnabled: false,
    gatewayFeeEnabled: false,
    showFeeBreakdown: false,
    minWithdrawalAmount: 0,
    defaultCancellationWindowHours: 0,
    supportedSports: [],
    enableOpenMatches: false,
    enableTournaments: false,
    featureFlags: {
      addons_enabled: false,
      squad_enabled: false,
      tournament_enabled: false,
      featured_turf_enabled: false,
      featured_addon_enabled: false,
      whatsapp_enabled: false,
      trending_enabled: false,
      near_you_enabled: false,
    },
    featuredPackages: [],
    featuredPaymentInfo: undefined,
  });
  const [favorites, setFavorites] = useState<string[]>([]);

  // Section 49 & 50 State
  const [openMatches, setOpenMatches] = useState<OpenMatch[]>([]);
  const [matchParticipants, setMatchParticipants] = useState<MatchParticipant[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatch[]>([]);
  const [featuredRequests, setFeaturedRequests] = useState<FeaturedRequest[]>([]);
  const withdrawalIdempotencyKey = useRef<string | null>(null);
  const currentUser = users.find((u) => u.id === currentUserId) || GUEST_USER;
  const marketplaceRequest = async <T,>(url: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
    const response = await apiFetch(url, {
      method,
      ...(body ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      } : {}),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const body = await response.text();
      const hint = response.status === 404
        ? 'This API endpoint is unavailable. Restart the backend so it loads the current routes, then try again.'
        : `The server returned an unexpected response (${response.status}).`;
      throw new Error(body.trimStart().startsWith('<') ? hint : `Unable to complete ${method} ${url}.`);
    }
    const result = await response.json();
    if (!response.ok || result?.success !== true) throw new Error(result?.message || `Unable to complete ${method} ${url}.`);
    return result.data as T;
  };

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((session) => {
      if (!session || cancelled) return;
      const row = session.user;
      const user: User = { id: row.id, name: row.name, email: row.email, phone: row.phone || '', role: row.role, status: row.status, avatar: row.avatar, emailVerified: Boolean(row.emailVerified), createdAt: row.createdAt || new Date().toISOString() };
      setUsers((current) => [...current.filter((entry) => entry.id !== user.id), user]);
      setCurrentUserId(user.id);
      setIsAuthenticated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFavorites([]);
    if (!isAuthenticated || currentUser.role !== 'player') return () => { cancelled = true; };
    const loadFavorites = async () => {
      try {
        const response = await apiFetch('/api/player/favorites');
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.message || 'Unable to load saved turfs.');
        }
        setFavorites(result.data.filter((id: unknown): id is string => typeof id === 'string'));
      } catch (error) {
        if (!cancelled) showAppAlert(error instanceof Error ? error.message : 'Unable to load saved turfs.');
      }
    };
    void loadFavorites();
    return () => { cancelled = true; };
  }, [isAuthenticated, currentUser.id, currentUser.role]);

  useEffect(() => {
    let cancelled = false;
    const loadPublicSettings = async () => {
      try {
        const response = await apiFetch('/api/public/billing-options');
        const result = await response.json();
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.message || 'Unable to load public platform settings.');
        }
        if (cancelled) return;
        const data = result.data as Record<string, unknown>;
        setSettings((previous) => ({
          ...previous,
          monthlySubscriptionAmount: Number(data.monthlySubscriptionAmount ?? previous.monthlySubscriptionAmount ?? 0),
          ownerBillingSwitchEnabled: data.ownerBillingSwitchEnabled === true,
          platformFeeRate: Number(data.platformFeeRate ?? previous.platformFeeRate),
          gatewayFeeRate: Number(data.gatewayFeeRate ?? previous.gatewayFeeRate),
          platformFeeEnabled: data.platformFeeEnabled !== false,
          gatewayFeeEnabled: data.gatewayFeeEnabled !== false,
          showFeeBreakdown: data.showFeeBreakdown !== false,
          featureFlags: (data.featureFlags || previous.featureFlags) as PlatformSettings['featureFlags'],
        }));
      } catch (error: unknown) {
        if (!cancelled) console.error('Unable to load database-backed public platform settings:', error);
      }
    };
    const reloadOnFocus = () => { if (document.visibilityState === 'visible') void loadPublicSettings(); };
    void loadPublicSettings();
    const interval = window.setInterval(() => void loadPublicSettings(), 30_000);
    window.addEventListener('focus', reloadOnFocus);
    document.addEventListener('visibilitychange', reloadOnFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', reloadOnFocus);
      document.removeEventListener('visibilitychange', reloadOnFocus);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !['player', 'turf_owner', 'admin'].includes(currentUser.role)) return;
    let cancelled = false;
    const loadNotifications = async () => {
      try {
        const response = await apiFetch('/api/player/notifications');
        const result = await response.json();
        if (!response.ok || !result?.success || !Array.isArray(result.data) || cancelled) return;
        const rows = result.data as Array<Record<string, unknown>>;
        const saved: AppNotification[] = rows.map((row) => ({
          id: String(row.id), userId: currentUser.id, role: currentUser.role,
          type: String(row.type) as AppNotification['type'], title: String(row.title || ''),
          message: String(row.message || ''), data: (row.data || {}) as Record<string, unknown>,
          read: Boolean(row.read), createdAt: String(row.createdAt || ''),
        }));
        setNotifications((previous) => [...saved, ...previous.filter((notification) => notification.userId !== currentUser.id)]);
      } catch { /* in-app notifications will retry on the next refresh */ }
    };
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isAuthenticated, currentUser.id, currentUser.role]);

  useEffect(() => {
    let cancelled = false;
    const enabled = settings.featureFlags.tournament_enabled;
    const loadTournaments = async () => {
      if (!enabled) {
        setTournaments([]);
        setTournamentTeams([]);
        setTournamentMatches([]);
        return;
      }
      try {
        const response = await apiFetch(isAuthenticated ? '/api/tournaments/catalog' : '/api/tournaments');
        const result = await response.json();
        if (!response.ok || !result?.success || cancelled) return;
        if (isAuthenticated) {
          setTournaments(Array.isArray(result.data?.tournaments) ? result.data.tournaments : []);
          setTournamentTeams(Array.isArray(result.data?.teams) ? result.data.teams : []);
          setTournamentMatches(Array.isArray(result.data?.matches) ? result.data.matches : []);
        } else {
          setTournaments(Array.isArray(result.data) ? result.data : []);
          setTournamentTeams([]);
          setTournamentMatches([]);
        }
      } catch (error) {
        if (!cancelled) console.error('Unable to refresh tournament listings:', error);
      }
    };
    void loadTournaments();
    const interval = window.setInterval(() => void loadTournaments(), 30_000);
    const reloadOnFocus = () => { if (document.visibilityState === 'visible') void loadTournaments(); };
    window.addEventListener('focus', reloadOnFocus);
    document.addEventListener('visibilitychange', reloadOnFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', reloadOnFocus);
      document.removeEventListener('visibilitychange', reloadOnFocus);
    };
  }, [isAuthenticated, currentUser.id, currentUser.role, settings.featureFlags.tournament_enabled]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOpenMatches([]);
      setMatchParticipants([]);
      setTournamentTeams([]);
      setTournamentMatches([]);
      setFeaturedRequests([]);
      setTournaments([]);
      return;
    }
    let cancelled = false;
    const getData = async (url: string) => {
      const response = await apiFetch(url);
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || `Unable to load ${url}.`);
      return result.data;
    };
    const loadMarketplaceData = async () => {
      const tasks: Promise<void>[] = [];
      if (settings.featureFlags.squad_enabled) {
        tasks.push(Promise.all([getData('/api/open-matches'), getData('/api/open-match-participants')]).then(([matches, participants]) => {
          if (!cancelled) {
            setOpenMatches(Array.isArray(matches) ? matches : []);
            setMatchParticipants(Array.isArray(participants) ? participants : []);
          }
        }));
      } else {
        setOpenMatches([]);
        setMatchParticipants([]);
      }
      if (settings.featureFlags.featured_turf_enabled && currentUser.role === 'admin') {
        tasks.push(getData('/api/admin/featured-listings').then((rows) => {
          if (!cancelled) setFeaturedRequests(Array.isArray(rows) ? rows : []);
        }));
      } else if (settings.featureFlags.featured_turf_enabled && currentUser.role === 'turf_owner') {
        tasks.push(Promise.all([getData('/api/owner/featured-listings'), getData('/api/owner/featured-packages')]).then(([rows, packages]) => {
          if (!cancelled) {
            setFeaturedRequests(Array.isArray(rows) ? rows : []);
            setSettings((previous) => ({ ...previous, featuredPackages: Array.isArray(packages) ? packages : [] }));
          }
        }));
      } else if (!settings.featureFlags.featured_turf_enabled) {
        setFeaturedRequests([]);
      }
      const results = await Promise.allSettled(tasks);
      for (const result of results) {
        if (result.status === 'rejected' && !cancelled) console.error('Unable to load persistent marketplace data:', result.reason);
      }
    };
    void loadMarketplaceData();
    return () => { cancelled = true; };
  }, [isAuthenticated, currentUser.id, currentUser.role, settings.featureFlags]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'admin') return;
    let cancelled = false;
    const getData = async (url: string) => {
      const response = await apiFetch(url);
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || `Unable to load ${url}.`);
      return result.data;
    };
    const loadAdminData = async () => {
      try {
        const [userRows, ownerRows, pendingTurfRows, publicTurfRows, withdrawalRows, refundRows, disputeRows, policyRows, platformSettings, platformFlags, smtpConfigs] = await Promise.all([
          getData('/api/admin/users'), getData('/api/admin/owners/pending'), getData('/api/admin/turfs/pending'),
          getData('/api/turfs'), getData('/api/admin/withdrawals/pending'), getData('/api/admin/refunds/pending'), getData('/api/admin/disputes'),
          getData('/api/admin/cancellation-policies'), getData('/api/admin/settings'), getData('/api/admin/feature-flags'), getData('/api/admin/smtp-configs'),
        ]);
        if (cancelled) return;
        setUsers(userRows.map((row: Record<string, unknown>) => ({
          id: String(row.id), name: String(row.name || ''), email: String(row.email || ''), phone: String(row.phone || ''),
          role: String(row.role || 'player') as UserRole, status: String(row.status || 'active') as User['status'],
          avatar: typeof row.avatar === 'string' ? row.avatar : undefined,
          emailVerified: Boolean(row.email_verified_at ?? row.emailVerified), createdAt: String(row.created_at || row.createdAt || ''),
        })));
        const owners = ownerRows.map((row: Record<string, unknown>) => {
          const documents = ((row.documents || []) as Array<Record<string, unknown>>).map((doc) => ({
            id: String(doc.id || ''), url: String(doc.url || ''), fileName: String(doc.fileName || 'Business document'),
            mimeType: String(doc.mimeType || ''), dataUrl: '',
            documentType: String(doc.type || '') === 'trade_license' ? 'trade_license' as const : 'supporting_business_document' as const,
          }));
          const payout = (row.payoutDetails || {}) as Record<string, unknown>;
          return {
            id: String(row.profile_id || row.id), userId: String(row.id), businessName: String(row.businessName || ''),
            nidOrTradeLicense: String(row.tradeLicenseNumber || ''), businessVerificationDocuments: documents,
            payoutMethod: String(row.payoutMethod || 'bkash') as TurfOwnerProfile['payoutMethod'],
            payoutDetails: { accountNumber: String(payout.accountNumber || ''), bankName: String(payout.bankName || ''), branchName: String(payout.branchName || ''), accountHolderName: String(payout.accountHolderName || '') },
            approvalStatus: String(row.approvalStatus || 'pending_approval') as TurfOwnerProfile['approvalStatus'],
            reviewMessage: String(row.reviewMessage || ''),
          } as TurfOwnerProfile;
        });
        setOwnerProfiles(owners);
        const combinedTurfs = [...pendingTurfRows, ...publicTurfRows];
        setTurfs(combinedTurfs.map((row: Record<string, unknown>) => ({
          id: String(row.id), ownerId: String(row.ownerId ?? row.owner_id ?? ''), ownerName: String(row.ownerName ?? row.owner_name ?? ''),
          name: String(row.name || ''), description: String(row.description || ''), address: String(row.address || ''), area: String(row.area || ''), city: String(row.city || ''),
          latitude: Number(row.latitude || 0), longitude: Number(row.longitude || 0), sportTypes: (row.sportTypes ?? row.sport_types ?? []) as string[], amenities: (row.amenities || []) as string[],
          basePricePerHour: Number(row.basePricePerHour ?? row.base_price_per_hour ?? 0), pricingRules: (row.pricingRules ?? row.pricing_rules ?? []) as Turf['pricingRules'],
          effectiveCancellationPolicy: (row.effectiveCancellationPolicy || row.effective_cancellation_policy) as Turf['effectiveCancellationPolicy'],
          operatingHours: (row.operatingHours ?? row.operating_hours ?? { openTime: '07:00', closeTime: '23:00' }) as Turf['operatingHours'],
          photos: (row.photos || []) as string[], status: String(row.status || 'active') as Turf['status'], rating: Number(row.rating || 0), reviewCount: Number(row.reviewCount ?? row.review_count ?? 0), createdAt: String(row.createdAt ?? row.created_at ?? ''),
        })));
        setWithdrawals(withdrawalRows.map((row: Record<string, unknown>) => ({
          id: String(row.id), ownerId: String(row.owner_id), ownerName: String(row.name || ''), businessName: String(row.business_name || ''),
          amount: Number(row.amount || 0), payoutMethod: String(row.method || ''), payoutDetails: JSON.stringify(row.payout_details || {}),
          status: String(row.status || 'pending') as WithdrawalRequest['status'], reference: String(row.reference || ''), createdAt: String(row.created_at || ''),
        })));
        setPendingRefunds(refundRows.map((row: Record<string, unknown>) => ({
          id: String(row.id), bookingId: String(row.booking_id), bookingNumber: String(row.booking_number || ''), playerName: String(row.player_name || ''),
          turfName: String(row.turf_name || ''), amount: Number(row.amount || 0), bookingSource: String(row.booking_source || 'online') as RefundRequest['bookingSource'],
          status: String(row.status || 'pending') as RefundRequest['status'], gatewaySupported: Boolean(row.gateway_supported),
          paymentGateway: String(row.payment_gateway || ''),
          gatewayRefundReference: String(row.gateway_refund_ref || ''), gatewayRequestId: String(row.gateway_request_id || ''),
          gatewayError: String(row.gateway_error || ''), createdAt: String(row.created_at || ''),
        })));
        setDisputes(disputeRows.map((row: Record<string, unknown>) => ({
          id: String(row.id), bookingId: String(row.booking_id), bookingNumber: String(row.booking_number || ''), raisedByUserId: String(row.raised_by || ''),
          raisedByName: String(row.raised_by_name || ''), role: 'player', category: String(row.reason || 'other') as Dispute['category'], description: String(row.description || ''),
          status: String(row.status || 'open') === 'open' ? 'pending' : String(row.status || 'open') as Dispute['status'],
          resolutionNotes: String(row.resolution || ''), createdAt: String(row.created_at || ''),
        })));
        setCancellationPolicies(policyRows.map((row: Record<string, unknown>) => ({
          id: String(row.id), name: String(row.name || ''), isDefault: Boolean(row.is_default), description: String(row.description || ''),
          tiers: ((row.tiers || []) as Array<Record<string, unknown>>).map((tier) => ({ id: String(tier.id), minHoursBefore: Number(tier.hours_before_start_min ?? tier.min), maxHoursBefore: tier.hours_before_start_max == null && tier.max == null ? undefined : Number(tier.hours_before_start_max ?? tier.max), refundPercentage: Number(tier.refund_percentage ?? tier.refundPercentage), description: '' })),
        })));
        setSettings((previous) => ({
          ...previous,
          globalCommissionRate: Number(platformSettings.global_commission_rate ?? previous.globalCommissionRate),
          platformFeeRate: Number(platformSettings.platform_fee_rate ?? previous.platformFeeRate),
          gatewayFeeRate: Number(platformSettings.gateway_fee_rate ?? previous.gatewayFeeRate),
          minWithdrawalAmount: Number(platformSettings.minimum_withdrawal_amount?.amount ?? platformSettings.minimum_withdrawal_amount ?? previous.minWithdrawalAmount),
          defaultCancellationWindowHours: Number(platformSettings.cancellation_window_hours ?? previous.defaultCancellationWindowHours),
          supportedSports: (platformSettings.supported_sports || previous.supportedSports) as string[],
          featuredPackages: (platformSettings.featured_packages || previous.featuredPackages) as PlatformSettings['featuredPackages'],
          paymentGateways: (platformSettings.payment_gateways || previous.paymentGateways) as PlatformSettings['paymentGateways'],
          featureFlags: platformFlags as PlatformSettings['featureFlags'],
          smtpConfigs: smtpConfigs as SmtpConfig[],
        }));
      } catch (error) { if (!cancelled) console.error('Unable to load database-backed admin dashboard:', error); }
    };
    void loadAdminData();
    return () => { cancelled = true; };
  }, [currentUser.id, currentUser.role, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'staff') return;
    let cancelled = false;
    apiFetch('/api/staff/assignments').then((response) => response.json()).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.data)) setStaffAssignments(result.data.map((row: Record<string, unknown>) => ({
        id: String(row.id || row.ownerId), staffUserId: currentUser.id, staffName: currentUser.name, staffEmail: currentUser.email, staffPhone: currentUser.phone,
        ownerId: String(row.ownerId), turfIds: (row.turfIds || []) as string[], permissions: (row.permissions || []) as string[], status: 'active', invitedAt: String(row.invitedAt || ''),
      })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [currentUser.email, currentUser.id, currentUser.name, currentUser.phone, currentUser.role, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'turf_owner') return;
    let cancelled = false;
    const loadOwnerData = async () => {
      try {
        const verificationResponse = await apiFetch('/api/owner/verification');
        const verificationResult = await verificationResponse.json();
        if (!verificationResponse.ok || !verificationResult.success) throw new Error(verificationResult.message || 'Unable to load owner verification.');
        const profile = verificationResult.data as Record<string, unknown>;
        const payout = (profile.payoutDetails || {}) as Record<string, unknown>;
        const ownerDocuments = ((profile.documents || []) as Array<Record<string, unknown>>).map((document) => ({
          id: String(document.id || ''), url: String(document.url || ''), fileName: String(document.fileName || 'Business document'),
          mimeType: String(document.mimeType || ''), dataUrl: '',
          documentType: String(document.type) === 'trade_license' ? 'trade_license' as const : 'supporting_business_document' as const,
        }));
        if (cancelled) return;
        setOwnerProfiles((previous) => [...previous.filter((item) => item.userId !== currentUser.id), {
          id: currentUser.id, userId: currentUser.id, businessName: String(profile.businessName || ''), nidOrTradeLicense: String(profile.tradeLicenseNumber || ''),
          businessVerificationDocuments: ownerDocuments, reviewMessage: String(profile.reviewMessage || ''), payoutMethod: String(profile.payoutMethod || 'bkash') as TurfOwnerProfile['payoutMethod'],
          payoutDetails: { accountNumber: String(payout.accountNumber || ''), bankName: String(payout.bankName || ''), branchName: String(payout.branchName || ''), accountHolderName: String(payout.accountHolderName || '') },
          approvalStatus: String(profile.approvalStatus || 'pending_approval') as TurfOwnerProfile['approvalStatus'],
        }]);
        if (profile.approvalStatus !== 'active') return;
        const [turfResponse, walletResponse, staffResponse] = await Promise.all([apiFetch('/api/owner/turfs'), apiFetch('/api/owner/wallet'), apiFetch('/api/owner/staff')]);
        const [turfResult, walletResult, staffResult] = await Promise.all([turfResponse.json(), walletResponse.json(), staffResponse.json()]);
        if (cancelled) return;
        if (turfResponse.ok && turfResult.success && Array.isArray(turfResult.data)) setTurfs((previous) => {
          const own = turfResult.data.map((row: Record<string, unknown>) => normalizeTurfRow(row));
          return [...previous.filter((item) => item.ownerId !== currentUser.id), ...own];
        });
        if (staffResponse.ok && staffResult.success && Array.isArray(staffResult.data)) {
          const grouped = new Map<string, StaffAssignment>();
          for (const row of staffResult.data as Array<Record<string, unknown>>) {
            const staffId = String(row.id || '');
            if (!grouped.has(staffId)) grouped.set(staffId, { id: staffId, staffUserId: staffId, staffName: String(row.name || ''), staffEmail: String(row.email || ''), staffPhone: String(row.phone || ''), ownerId: currentUser.id, turfIds: [], permissions: [], status: 'active', invitedAt: String(row.invited_at || ''), createdAt: String(row.invited_at || '') });
            const assignment = grouped.get(staffId)!;
            assignment.turfIds.push(String(row.turf_id));
            assignment.permissions = [...new Set([...assignment.permissions, ...((row.permissions || []) as string[])])];
          }
          setStaffAssignments((previous) => [...previous.filter((item) => item.ownerId !== currentUser.id), ...grouped.values()]);
          setUsers((previous) => {
            const staff = [...grouped.values()].map((item) => ({ id: item.staffUserId, name: item.staffName, email: item.staffEmail, phone: item.staffPhone, role: 'staff' as const, status: 'active' as const, createdAt: item.invitedAt }));
            return [...previous.filter((user) => !staff.some((item) => item.id === user.id)), ...staff];
          });
        }
        if (walletResponse.ok && walletResult.success) {
          const walletData = walletResult.data as Record<string, unknown>;
          const wallet = (walletData.wallet || {}) as Record<string, unknown>;
          const totalWithdrawn = Math.max(Number(wallet.total_withdrawn || 0), sumPaidWithdrawals(walletData.withdrawals));
          setWallets((previous) => ({ ...previous, [currentUser.id]: { ownerId: currentUser.id, availableBalance: Number(wallet.available_balance || 0), heldBalance: Number(wallet.held_balance || 0), totalEarnings: Number(wallet.total_earnings || 0), totalWithdrawn } }));
          if (Array.isArray(walletData.withdrawals)) setWithdrawals((previous) => {
            const own = (walletData.withdrawals as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), ownerId: currentUser.id, ownerName: currentUser.name, businessName: String(profile.businessName || ''), amount: Number(row.amount || 0), payoutMethod: String(row.method || ''), payoutDetails: '', status: String(row.status || 'pending') as WithdrawalRequest['status'], reference: String(row.reference || ''), createdAt: String(row.created_at || '') }));
            return [...previous.filter((item) => item.ownerId !== currentUser.id), ...own];
          });
        }
      } catch (error) { if (!cancelled) console.error('Unable to load owner dashboard data:', error); }
    };
    void loadOwnerData();
    return () => { cancelled = true; };
  }, [currentUser.id, currentUser.name, currentUser.role, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const route = currentUser.role === 'player' ? '/api/bookings'
      : currentUser.role === 'turf_owner' ? '/api/owner/bookings'
        : currentUser.role === 'staff' ? '/api/staff/bookings'
          : currentUser.role === 'admin' ? '/api/admin/bookings' : '';
    if (!route) return;
    let cancelled = false;
    const loadBookings = async () => {
      try {
        const response = await apiFetch(route);
        const payload = await response.json();
        if (!response.ok || !payload?.success || !Array.isArray(payload.data) || cancelled) return;
        const rows: Booking[] = payload.data.map((row: Record<string, unknown>) => {
          const dateValue = row.date ?? row.booking_date ?? '';
          const time = (value: unknown) => String(value || '').slice(0, 5);
          return {
            id: String(row.id), bookingNumber: String(row.bookingNumber ?? row.booking_number ?? ''),
            playerId: row.playerId ? String(row.playerId) : row.player_id ? String(row.player_id) : undefined,
            customerName: String(row.customerName ?? row.customer_name ?? row.player_name ?? ''),
            customerPhone: String(row.customerPhone ?? row.customer_phone ?? row.player_phone ?? ''),
            customerEmail: String(row.customerEmail ?? row.player_email ?? ''),
            turfId: String(row.turfId ?? row.turf_id ?? ''), turfName: String(row.turfName ?? row.turf_name ?? ''),
            date: dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue).slice(0, 10),
            startTime: time(row.startTime ?? row.start_time), endTime: time(row.endTime ?? row.end_time),
            totalHours: Number(row.totalHours ?? row.total_hours ?? 1),
            bookingSource: String(row.bookingSource ?? row.booking_source ?? 'online') as BookingSource,
            status: String(row.status || 'pending_payment') as Booking['status'],
            baseAmount: Number(row.baseAmount ?? row.base_amount ?? 0), commissionAmount: Number(row.commissionAmount ?? row.commission_amount ?? 0),
            platformFeeAmount: Number(row.platformFeeAmount ?? row.platform_fee_amount ?? 0),
            hasGatewayFee: Boolean(row.hasGatewayFee ?? row.has_gateway_fee ?? Number(row.gateway_fee_amount) > 0),
            gatewayFeeAmount: Number(row.gatewayFeeAmount ?? row.gateway_fee_amount ?? 0),
            totalPaid: Number(row.totalPaid ?? row.total_payable ?? 0), netOwnerAmount: Number(row.netOwnerAmount ?? row.net_owner_amount ?? 0),
            paymentMethod: String(row.paymentMethod ?? row.payment_gateway ?? row.payment_method ?? (row.booking_source === 'online' ? 'sslcommerz' : 'cash')) as PaymentMethod,
            paymentStatus: String(row.paymentStatus ?? row.payment_status ?? 'pending') as PaymentStatus,
            paymentReference: String(row.paymentReference ?? row.payment_reference ?? ''), notes: String(row.notes || ''),
            cancellationReason: String(row.cancellationReason ?? row.cancellation_reason ?? ''),
            cancellationRequestStatus: String(row.cancellationRequestStatus ?? row.cancellation_request_status ?? '') as Booking['cancellationRequestStatus'],
            cancellationRequestReason: String(row.cancellationRequestReason ?? row.cancellation_request_reason ?? ''),
            cancellationRequestedAt: String(row.cancellationRequestedAt ?? row.cancellation_requested_at ?? ''),
            cancellationRequestRefundPercentage: Number(row.cancellationRequestRefundPercentage ?? row.cancellation_request_refund_percentage ?? 0),
            cancellationDecisionReason: String(row.cancellationDecisionReason ?? row.cancellation_decision_reason ?? ''),
            cancellationDecidedAt: String(row.cancellationDecidedAt ?? row.cancellation_decided_at ?? ''),
            qrCode: String(row.qrCode ?? row.booking_number ?? ''), createdAt: String(row.createdAt ?? row.created_at ?? ''), updatedAt: String(row.updatedAt ?? row.updated_at ?? ''),
          };
        });
        if (!cancelled) setBookings(rows);
      } catch (error) { if (!cancelled) console.error('Unable to load account bookings:', error); }
    };
    void loadBookings();
    const refreshAccountBookings = () => { if (['turf_owner', 'player', 'admin'].includes(currentUser.role)) void loadBookings(); };
    const accountBookingsInterval = ['turf_owner', 'player', 'admin'].includes(currentUser.role) ? window.setInterval(refreshAccountBookings, 15_000) : undefined;
    if (['turf_owner', 'player', 'admin'].includes(currentUser.role)) window.addEventListener('focus', refreshAccountBookings);
    return () => {
      cancelled = true;
      if (accountBookingsInterval !== undefined) window.clearInterval(accountBookingsInterval);
      if (['turf_owner', 'player', 'admin'].includes(currentUser.role)) window.removeEventListener('focus', refreshAccountBookings);
    };
  }, [currentUser.id, currentUser.role, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'turf_owner') return;
    let cancelled = false;
    const refreshOwnerWallet = async () => {
      try {
        const response = await apiFetch('/api/owner/wallet');
        const payload = await response.json();
        if (cancelled || !response.ok || !payload?.success) return;
        const data = payload.data as Record<string, unknown>;
        const wallet = (data.wallet || {}) as Record<string, unknown>;
        const totalWithdrawn = Math.max(Number(wallet.total_withdrawn || 0), sumPaidWithdrawals(data.withdrawals));
        setWallets((previous) => ({ ...previous, [currentUser.id]: {
          ownerId: currentUser.id,
          availableBalance: Number(wallet.available_balance || 0),
          heldBalance: Number(wallet.held_balance || 0),
          totalEarnings: Number(wallet.total_earnings || 0),
          totalWithdrawn,
        } }));
        if (Array.isArray(data.withdrawals)) setWithdrawals((previous) => {
          const owner = ownerProfiles.find((item) => item.userId === currentUser.id);
          const rows = (data.withdrawals as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id), ownerId: currentUser.id, ownerName: currentUser.name,
            businessName: owner?.businessName || '', amount: Number(row.amount || 0),
            payoutMethod: String(row.method || ''), payoutDetails: '',
            status: String(row.status || 'pending') as WithdrawalRequest['status'],
            reference: String(row.reference || ''), createdAt: String(row.created_at || ''),
          }));
          return [...previous.filter((item) => item.ownerId !== currentUser.id), ...rows];
        });
      } catch { /* retry at the next refresh */ }
    };
    void refreshOwnerWallet();
    const interval = window.setInterval(() => void refreshOwnerWallet(), 15_000);
    window.addEventListener('focus', refreshOwnerWallet);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', refreshOwnerWallet); };
  }, [currentUser.id, currentUser.name, currentUser.role, isAuthenticated, ownerProfiles]);

  useEffect(() => {
    if (!isAuthenticated || currentUser.role !== 'turf_owner') return;
    let cancelled = false;
    const refreshVerificationMessage = async () => {
      try {
        const response = await apiFetch('/api/owner/verification');
        const result = await response.json();
        if (cancelled || !response.ok || !result?.success) return;
        const profile = result.data as Record<string, unknown>;
        setOwnerProfiles((previous) => previous.map((item) => item.userId === currentUser.id ? { ...item, reviewMessage: String(profile.reviewMessage || ''), approvalStatus: String(profile.approvalStatus || item.approvalStatus) as TurfOwnerProfile['approvalStatus'] } : item));
      } catch { /* retry on the next interval */ }
    };
    const interval = window.setInterval(() => void refreshVerificationMessage(), 15_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [isAuthenticated, currentUser.id, currentUser.role]);

  const loadAvailability = useCallback(async (turfId: string, date: string) => {
    try {
      const response = await apiFetch(`/api/turfs/${encodeURIComponent(turfId)}/availability?date=${encodeURIComponent(date)}`);
      const result = await response.json();
      if (!response.ok || !result?.success || !Array.isArray(result.data)) return;
      const turf = turfs.find((item) => item.id === turfId);
      const rows: Slot[] = result.data.map((row: Record<string, unknown>) => {
        const startTime = String(row.start_time ?? row.startTime ?? '').slice(0, 5);
        const dateString = String(row.date ?? date).slice(0, 10);
        const weekday = new Date(`${dateString}T12:00:00Z`).getUTCDay();
        const matchesTime = (item: NonNullable<Turf['pricingRules']>[number]) => item.startTime <= startTime && item.endTime > startTime;
        const rule = turf?.pricingRules?.find((item) => item.date?.slice(0, 10) === dateString && matchesTime(item)) ||
          turf?.pricingRules?.find((item) => !item.date && item.dayOfWeek === weekday && matchesTime(item));
        return {
          id: String(row.id), turfId: String(row.turf_id ?? row.turfId ?? turfId), date: dateString,
          startTime, endTime: String(row.end_time ?? row.endTime ?? '').slice(0, 5),
          price: Number(rule?.pricePerHour ?? turf?.basePricePerHour ?? 0),
          pricingLabel: rule?.label,
          status: String(row.status || 'available') as Slot['status'],
          lockedUntil: row.locked_until ? String(row.locked_until) : undefined,
          lockedByUserId: row.locked_by_user_id ? String(row.locked_by_user_id) : undefined,
        };
      });
      setSlots((previous) => {
        const localLocks = new Map(previous
          .filter((slot) => slot.turfId === turfId && slot.date === date && slot.status === 'locked' && slot.lockedByUserId === currentUser.id && slot.lockedUntil && new Date(slot.lockedUntil).getTime() > Date.now())
          .map((slot) => [slot.id, slot]));
        const refreshedRows = rows.map((row) => {
          const localLock = localLocks.get(row.id);
          return row.status === 'available' && localLock ? localLock : row;
        });
        return [...previous.filter((slot) => slot.turfId !== turfId || slot.date !== date), ...refreshedRows];
      });
    } catch (error) {
      console.error('Unable to load database availability:', error);
    }
  }, [turfs, currentUser.id]);

  useEffect(() => {
    let cancelled = false;

    const loadTurfsFromApi = async () => {
      const retryDelays = [500, 1000, 2000, 3000, 3000, 3000, 3000];
      let lastError: unknown;
      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        if (cancelled) return;
        try {
          const response = await apiFetch('/api/turfs');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          if (!result?.success || !Array.isArray(result.data)) throw new Error('The turf API returned an invalid response.');
          if (!cancelled) setTurfs(result.data);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < retryDelays.length) {
            await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
          }
        }
      }
      if (!cancelled) console.error('Unable to load turfs from the backend after retrying; no turf data is available.', lastError);
    };

    void loadTurfsFromApi();

    return () => {
      cancelled = true;
    };
  }, []);

  const switchRoleDirectly = (role: UserRole) => {
    setSignInRolePreset(role);
    setIsGetStartedModalOpen(false);
    setIsSignInModalOpen(true);
  };

  const openSignInModal = (role?: UserRole) => {
    setSignInRolePreset(role);
    setIsGetStartedModalOpen(false);
    setIsSignInModalOpen(true);
  };

  const openGetStartedModal = (role?: 'player' | 'turf_owner') => {
    setIsSignInModalOpen(false);
    setIsGetStartedModalOpen(true);
  };

  const loginWithCredentials = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      return { success: false, message: 'Please enter both email and password.' };
    }

    try {
      const response = await apiFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: trimmedEmail, password }) });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to sign in.' };
      setAccessToken(result.data.accessToken);
      const row = result.data.user;
      const user: User = { id: row.id, name: row.name, email: row.email, phone: row.phone || '', role: row.role, status: row.status, avatar: row.avatar, emailVerified: Boolean(row.emailVerified), createdAt: row.createdAt || new Date().toISOString() };
      setUsers((current) => [...current.filter((entry) => entry.id !== user.id), user]);
      setCurrentUserId(user.id);
      setIsAuthenticated(true);
      setIsSignInModalOpen(false);
      setIsGetStartedModalOpen(false);
      if (user.role === 'player') setPlayerActiveTab('my_bookings');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { success: true, message: `Welcome back, ${user.name}.` };
    } catch { return { success: false, message: 'Could not reach the login service.' }; }
  };

  const logoutUser = () => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken('');
    setIsAuthenticated(false);
    const defaultPlayer = GUEST_USER;
    setCurrentUserId(defaultPlayer.id);
    setIsSignInModalOpen(false);
    setIsGetStartedModalOpen(false);
    setPlayerActiveTab('explore');
    setFavorites([]);
    setNotifications([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const registerNewUser = async (params: {
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    businessName?: string;
    nidOrTradeLicense?: string;
    businessVerificationDocuments?: Array<{ fileName: string; mimeType: string; dataUrl: string; documentType: 'trade_license' | 'supporting_business_document' }>;
    payoutMethod?: 'bkash' | 'nagad' | 'rocket' | 'bank_account';
    accountNumber?: string;
    billingModel?: OwnerBillingModel;
    password?: string;
  }): Promise<User> => {
    if (!['player', 'turf_owner'].includes(params.role)) throw new Error('This account role cannot use public registration.');
    let response: Response;
    if (params.role === 'player') {
      response = await apiFetch('/api/auth/register/player', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: params.name, email: params.email, phone: params.phone, password: params.password }),
      });
    } else {
      const documents = params.businessVerificationDocuments || [];
      const tradeLicense = documents.find((document) => document.documentType === 'trade_license');
      if (!tradeLicense) throw new Error('A trade license document is required.');
      const form = new FormData();
      form.append('name', params.name);
      form.append('email', params.email);
      form.append('phone', params.phone);
      form.append('password', params.password || '');
      form.append('businessName', params.businessName || '');
      form.append('tradeLicenseNumber', params.nidOrTradeLicense || '');
      form.append('payoutMethod', params.payoutMethod || 'bkash');
      form.append('accountNumber', params.accountNumber || params.phone);
      form.append('billingModel', params.billingModel || '');
      for (const document of documents) {
        const blob = await fetch(document.dataUrl).then((result) => result.blob());
        const file = new File([blob], document.fileName, { type: document.mimeType });
        form.append(document.documentType === 'trade_license' ? 'tradeLicense' : 'supportingDocuments', file);
      }
      response = await apiFetch('/api/auth/register/turf-owner', { method: 'POST', body: form });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`The registration service returned a web page instead of JSON (HTTP ${response.status}). Please check the document sizes and try again.`);
    }
    const result = await response.json();
    if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to create this account.');
    setAccessToken(result.data.accessToken);
    const row = result.data.user;
    const newUser: User = { id: row.id, name: row.name, email: row.email, phone: row.phone || '', role: row.role, status: row.status, emailVerified: Boolean(row.emailVerified), createdAt: row.createdAt || new Date().toISOString() };
    setUsers((current) => [...current.filter((entry) => entry.id !== newUser.id), newUser]);
    setCurrentUserId(newUser.id);
    setIsAuthenticated(true);
    setIsGetStartedModalOpen(false);
    setIsSignInModalOpen(false);
    return newUser;
  };

  const updateUnverifiedEmail = async (email: string): Promise<{ success: boolean; message: string; emailUpdated?: boolean }> => {
    try {
      const response = await apiFetch('/api/auth/player/email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const result = await response.json();
      const emailUpdated = Boolean(result.emailUpdated);
      const row = result.data?.user as Record<string, unknown> | undefined;
      if (emailUpdated && row) setUsers((previous) => previous.map((user) => user.id === currentUser.id ? { ...user, email: String(row.email || email), emailVerified: false } : user));
      return { success: response.ok && Boolean(result.success), message: result.message || 'Could not update the email address.', emailUpdated };
    } catch { return { success: false, message: 'Could not reach the email verification service.' }; }
  };

  const verifyActivationCode = async (code: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/auth/email/verification/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: result.message || 'Could not verify your email.' };
      setUsers((previous) => previous.map((user) => user.id === currentUser.id ? { ...user, emailVerified: true } : user));
      return { success: true, message: result.message };
    } catch { return { success: false, message: 'Could not reach the verification service.' }; }
  };

  const resendActivationCode = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/auth/email/verification/request', { method: 'POST' });
      const result = await response.json();
      return { success: response.ok && Boolean(result.success), message: result.message || 'Could not send a verification code.' };
    } catch { return { success: false, message: 'Could not reach the email service.' }; }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const result = await response.json();
      return { success: response.ok && Boolean(result.success), message: result.message || 'Could not process the reset request.' };
    } catch { return { success: false, message: 'Could not reach the password reset service.' }; }
  };

  const resetPasswordWithCode = async (email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/auth/password-reset/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), password: newPassword }) });
      const result = await response.json();
      return { success: response.ok && Boolean(result.success), message: result.message || 'Could not reset password.' };
    } catch { return { success: false, message: 'Could not reach the password reset service.' }; }
  };


  const unlockSlots = (slotIds: string[]) => {
    if (slotIds.length === 0) return;

    setSlots((prev) =>
      prev.map((s) =>
        slotIds.includes(s.id) && s.status === 'locked' && s.lockedByUserId === currentUser.id
          ? { ...s, status: 'available', lockedUntil: undefined, lockedByUserId: undefined }
          : s
      )
    );
  };

  // Resolve Cancellation Policy for a given turf
  const resolvePolicyForTurf = (turfId: string): CancellationPolicy => {
    const turf = turfs.find((t) => t.id === turfId);
    if (turf?.cancellationPolicyId) {
      const p = cancellationPolicies.find((cp) => cp.id === turf.cancellationPolicyId);
      if (p) return p;
    }
    const defaultP = cancellationPolicies.find((cp) => cp.isDefault);
    return defaultP || cancellationPolicies[0];
  };

  // Calculate Refund Matrix (Section 10.3 & Section 47)
  const calculateRefund = (booking: Booking, isOwnerCancel = false) => {
    if (isOwnerCancel) {
      // Owner-initiated cancellation: ALWAYS 100% refund of base amount + platform fee.
      // Online payment gateway fees are kept by the payment provider and never refundable.
      const playerRefund = booking.baseAmount + (booking.bookingSource === 'online' ? booking.platformFeeAmount : 0);
      return {
        refundPercentage: 100,
        playerRefund,
        adminKeep: 0,
        gatewayFeeDeducted: booking.gatewayFeeAmount,
      };
    }

    // Player cancellation tiers use elapsed time since this booking was created.
    const policy = turfs.find((turf) => turf.id === booking.turfId)?.effectiveCancellationPolicy || resolvePolicyForTurf(booking.turfId);
    const bookingCreatedAt = Date.parse(booking.createdAt);
    const hoursSinceBooking = Number.isFinite(bookingCreatedAt)
      ? Math.max(0, (Date.now() - bookingCreatedAt) / (1000 * 60 * 60))
      : 0;

    let matchedTier = policy.tiers.find((tier) => {
      const min = tier.minHoursBefore;
      const max = tier.maxHoursBefore ?? 99999;
      return hoursSinceBooking >= min && (hoursSinceBooking < max || (hoursSinceBooking === 24 && min === 6 && max === 24));
    });

    if (!matchedTier && hoursSinceBooking >= 24) {
      matchedTier = policy.tiers.find((t) => t.minHoursBefore >= 24) || policy.tiers[policy.tiers.length - 1];
    } else if (!matchedTier) {
      matchedTier = policy.tiers[policy.tiers.length - 1];
    }

    const refundPercentage = matchedTier?.refundPercentage ?? 0;
    const baseRefund = (booking.baseAmount * refundPercentage) / 100;

    let playerRefund = 0;
    let adminKeep = booking.platformFeeAmount;

    if (booking.bookingSource === 'online') {
      // Online booking: Gateway fee non-refundable, platform fee kept by admin
      playerRefund = baseRefund;
    } else {
      // Manual booking: No gateway fee exists. Platform fee is non-refundable on player cancellation
      playerRefund = Math.max(0, baseRefund - booking.platformFeeAmount);
    }

    return {
      refundPercentage,
      playerRefund,
      adminKeep,
      gatewayFeeDeducted: booking.gatewayFeeAmount,
    };
  };

  // Create Manual / Offline Booking (Section 7.4 & 47.13)
  const createManualBooking = async ({
    turfId,
    slotId,
    customerName,
    customerPhone,
    paymentMethod,
    paymentStatus,
    paymentAmount,
    paymentReference,
    notes,
  }: {
    turfId: string;
    slotId: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    paymentAmount?: number;
    paymentReference?: string;
    notes?: string;
  }): Promise<{ booking: Booking | null; error?: string }> => {
    const slot = slots.find((item) => item.id === slotId);
    const turf = turfs.find((item) => item.id === turfId);
    if (!slot || !turf) return { booking: null, error: 'The selected turf or slot is no longer available. Refresh availability and try again.' };
    try {
      const endpoint = currentUser.role === 'staff' ? '/api/staff/bookings/manual' : '/api/owner/bookings/manual';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ turfId, date: slot.date, startTime: slot.startTime, durationHours: 1, customerName, customerPhone, paymentMethod, paymentStatus, paymentAmount, paymentReference: paymentReference || '', notes: notes || '' }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) return { booking: null, error: result?.message || (response.status === 401 ? 'Your session has expired. Please sign in again and retry.' : 'The booking could not be saved. Refresh availability and try again.') };
      const row = result.data;
      const booking: Booking = {
        id: String(row.id), bookingNumber: String(row.booking_number), turfId, turfName: turf.name,
        playerId: undefined, customerName, customerPhone, slotId, slotIds: [slotId], date: slot.date,
        startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5), totalHours: 1,
        bookingSource: row.booking_source, status: row.status, baseAmount: Number(row.base_amount),
        commissionAmount: Number(row.commission_amount), platformFeeAmount: Number(row.platform_fee_amount),
        hasGatewayFee: false, gatewayFeeAmount: 0, totalPaid: Number(row.total_payable),
        netOwnerAmount: Number(row.net_owner_amount), paymentMethod, paymentStatus, paymentReference, notes,
        qrCode: '', createdAt: row.created_at || new Date().toISOString(), updatedAt: row.updated_at || new Date().toISOString(),
      };
      setBookings((previous) => [booking, ...previous.filter((item) => item.id !== booking.id)]);
      await loadAvailability(turfId, slot.date);
      return { booking };
    } catch { return { booking: null, error: 'Could not reach the booking service. Check your connection and retry.' }; }
  };

  // Cancel Booking with Refund Logic
  const cancelBooking = async (bookingId: string, reason: string, _isOwnerInitiated = false): Promise<{ success: boolean; refundAmount: number; message: string }> => {
    const endpoint = currentUser.role === 'admin'
      ? `/api/admin/bookings/${encodeURIComponent(bookingId)}/force-refund`
      : `/api/bookings/${encodeURIComponent(bookingId)}/cancel`;
    try {
      const response = await apiFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, refundAmount: 0, message: result?.message || 'Unable to cancel this booking.' };
      const refundAmount = Number(result.data?.refundAmount || 0);
      if (result.data?.status === 'pending') {
        setBookings((previous) => previous.map((item) => item.id === bookingId
          ? { ...item, cancellationRequestStatus: 'pending', cancellationRequestReason: reason, cancellationRequestedAt: String(result.data.requestedAt || new Date().toISOString()), cancellationRequestRefundPercentage: Number(result.data.refundPercentage || 0) }
          : item));
        return { success: true, refundAmount: 0, message: 'Cancellation request sent. Your booking remains active until the owner responds or the 24-hour review period ends.' };
      }
      const booking = bookings.find((item) => item.id === bookingId);
      setBookings((previous) => previous.map((item) => item.id === bookingId
        ? { ...item, status: 'cancelled', cancellationReason: reason, cancelledBy: currentUser.id, refundAmount, updatedAt: new Date().toISOString() }
        : item));
      const slotIds = booking?.slotIds || (booking?.slotId ? [booking.slotId] : []);
      setSlots((previous) => previous.map((slot) => slotIds.includes(slot.id)
        ? { ...slot, status: 'available', lockedUntil: undefined, lockedByUserId: undefined }
        : slot));
      setOpenMatches((previous) => previous.map((match) => match.bookingId === bookingId && match.status !== 'cancelled'
        ? { ...match, status: 'cancelled', updatedAt: new Date().toISOString() }
        : match));
      return { success: true, refundAmount, message: `Booking cancelled. A refund of ?${refundAmount.toLocaleString()} is queued for processing.` };
    } catch { return { success: false, refundAmount: 0, message: 'Could not reach the booking service.' }; }
  };

  const decideCancellationRequest = async (bookingId: string, decision: 'approve' | 'reject', reason: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch(`/api/owner/bookings/${encodeURIComponent(bookingId)}/cancellation-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to resolve this cancellation request.' };
      const resolvedBooking = bookings.find((booking) => booking.id === bookingId);
      setBookings((previous) => previous.map((booking) => booking.id === bookingId ? {
        ...booking, cancellationRequestStatus: decision === 'approve' ? 'approved' : 'rejected', cancellationDecisionReason: reason,
        cancellationDecidedAt: new Date().toISOString(), ...(decision === 'approve' ? { status: 'cancelled' as const, refundAmount: Number(result.data?.refundAmount || 0) } : {}),
      } : booking));
      if (decision === 'approve' && resolvedBooking) {
        void loadAvailability(resolvedBooking.turfId, resolvedBooking.date);
        setOpenMatches((previous) => previous.map((match) => match.bookingId === bookingId && match.status !== 'cancelled'
          ? { ...match, status: 'cancelled', updatedAt: new Date().toISOString() } : match));
      }
      return { success: true, message: decision === 'approve' ? 'Request approved and refund queued.' : 'Request rejected. The booking remains active.' };
    } catch { return { success: false, message: 'Could not reach the booking service.' }; }
  };

  // Check In & Complete
  const updateBookingOperation = async (bookingId: string, operation: 'check-in' | 'complete'): Promise<boolean> => {
    const rolePath = currentUser.role === 'staff' ? 'staff' : 'owner';
    try {
      const response = await apiFetch(`/api/${rolePath}/bookings/${encodeURIComponent(bookingId)}/${operation}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) return false;
      const status = operation === 'check-in' ? 'checked_in' : 'completed';
      setBookings((previous) => previous.map((booking) => booking.id === bookingId ? { ...booking, status, updatedAt: new Date().toISOString() } : booking));
      return true;
    } catch { return false; }
  };

  const checkInBooking = (bookingId: string) => updateBookingOperation(bookingId, 'check-in');
  const completeBooking = (bookingId: string) => updateBookingOperation(bookingId, 'complete');

  // Slot Management
  const toggleSlotBlock = async (slotId: string): Promise<boolean> => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot || !['available', 'blocked'].includes(slot.status)) return false;
    const blocking = slot.status === 'available';
    const rolePath = currentUser.role === 'staff' ? 'staff' : 'owner';
    try {
      const response = await apiFetch(`/api/${rolePath}/turfs/${encodeURIComponent(slot.turfId)}/slots/${blocking ? 'block' : 'unblock'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) return false;
      setSlots((previous) => previous.map((item) => item.id === slotId ? { ...item, status: blocking ? 'blocked' : 'available' } : item));
      return true;
    } catch { return false; }
  };

  // Turf Management
  const normalizeTurfRow = (row: Record<string, unknown>): Turf => ({
    id: String(row.id), ownerId: String(row.ownerId ?? row.owner_id ?? currentUser.id), ownerName: String(row.ownerName ?? row.owner_name ?? currentUser.name),
    name: String(row.name || ''), description: String(row.description || ''), address: String(row.address || ''), area: String(row.area || ''), city: String(row.city || ''),
    latitude: Number(row.latitude || 0), longitude: Number(row.longitude || 0), sportTypes: (row.sportTypes ?? row.sport_types ?? []) as string[], amenities: (row.amenities || []) as string[],
    basePricePerHour: Number(row.basePricePerHour ?? row.base_price_per_hour ?? 0), pricingRules: (row.pricingRules ?? row.pricing_rules ?? []) as Turf['pricingRules'],
    operatingHours: (row.operatingHours ?? row.operating_hours ?? { openTime: '07:00', closeTime: '23:00' }) as Turf['operatingHours'], photos: (row.photos || []) as string[],
    status: String(row.status || 'pending_review') as Turf['status'], correctionMessage: String(row.correctionMessage ?? row.correction_message ?? ''),
    rating: Number(row.rating || 0), reviewCount: Number(row.reviewCount ?? row.review_count ?? 0), createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  });

  const createTurf = async (turfData: Omit<Turf, 'id' | 'createdAt' | 'rating' | 'reviewCount'>): Promise<Turf | null> => {
    if (currentUser.role !== 'turf_owner' || currentUser.status !== 'active' || !ownerProfiles.some((p) => p.userId === currentUser.id && p.approvalStatus === 'active')) return null;
    try {
      const response = await apiFetch('/api/owner/turfs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turfData) });
      const result = await response.json();
      if (!response.ok || !result.success) return null;
      const turf = normalizeTurfRow(result.data);
      setTurfs((previous) => [turf, ...previous.filter((item) => item.id !== turf.id)]);
      return turf;
    } catch { return null; }
  };

  const updateTurf = async (turfId: string, updates: Partial<Turf>): Promise<Turf | null> => {
    const prior = turfs.find((turf) => turf.id === turfId);
    if (!prior || currentUser.role !== 'turf_owner' || prior.ownerId !== currentUser.id) return null;
    try {
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(turfId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...prior, ...updates }) });
      const result = await response.json();
      if (!response.ok || !result.success) return null;
      const turf = normalizeTurfRow(result.data);
      setTurfs((previous) => previous.map((item) => item.id === turfId ? turf : item));
      return turf;
    } catch { return null; }
  };

  const uploadTurfPhotos = async (turfId: string, files: File[]): Promise<{ success: boolean; message: string }> => {
    const turf = turfs.find((item) => item.id === turfId);
    if (!isAuthenticated || currentUser.role !== 'turf_owner' || (turf && turf.ownerId !== currentUser.id)) {
      return { success: false, message: 'You can only upload photos for your own turf.' };
    }
    if (!files.length || files.length > 5) return { success: false, message: 'Choose between one and five turf photos.' };
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('photos', file));
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(turfId)}/photos`, { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to upload turf photos.' };
      const savedTurf = normalizeTurfRow(result.data);
      setTurfs((previous) => previous.some((item) => item.id === turfId)
        ? previous.map((item) => item.id === turfId ? savedTurf : item)
        : [savedTurf, ...previous]);
      return { success: true, message: 'Turf photos updated.' };
    } catch { return { success: false, message: 'Could not reach the image upload service.' }; }
  };

  const updateProfileImage = async (file: File): Promise<{ success: boolean; message: string }> => {
    if (!isAuthenticated) return { success: false, message: 'Sign in to update your profile image.' };
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await apiFetch('/api/users/me/avatar', { method: 'PUT', body: formData });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to update profile image.' };
      const avatar = String(result.data?.user?.avatar || '');
      setUsers((previous) => previous.map((user) => user.id === currentUser.id ? { ...user, avatar } : user));
      return { success: true, message: 'Profile image updated.' };
    } catch { return { success: false, message: 'Could not reach the image upload service.' }; }
  };

  const deleteTurf = async (turfId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(turfId)}/removal-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Owner requested permanent turf removal.' }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to request turf removal.' };
      setTurfs((previous) => previous.map((turf) => turf.id === turfId ? { ...turf, status: 'inactive' } : turf));
      return { success: true, message: result.message || 'Turf is hidden while admin reviews your removal request.' };
    } catch {
      return { success: false, message: 'Could not reach the turf removal service.' };
    }
  };

  const approveTurf = async (turfId: string) => {
    const response = await apiFetch(`/api/admin/turfs/${encodeURIComponent(turfId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
    if (!response.ok) return;
    setTurfs((prev) => prev.map((t) => (t.id === turfId ? { ...t, status: 'active' } : t)));
  };

  const rejectTurf = async (turfId: string) => {
    const response = await apiFetch(`/api/admin/turfs/${encodeURIComponent(turfId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'reject' }) });
    if (!response.ok) return;
    setTurfs((prev) => prev.map((t) => (t.id === turfId ? { ...t, status: 'inactive' } : t)));
  };

  // Owner & User Management
  const approveOwner = async (userId: string) => {
    const profile = ownerProfiles.find((p) => p.userId === userId);
    if (!profile?.businessVerificationDocuments?.some((document) => document.documentType === 'trade_license') || !profile.nidOrTradeLicense.trim()) return;
    const response = await apiFetch(`/api/admin/owners/${encodeURIComponent(userId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
    if (!response.ok) return;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u)));
    setOwnerProfiles((prev) =>
      prev.map((p) =>
        p.userId === userId
          ? { ...p, approvalStatus: 'active', approvedBy: currentUser.id, approvedAt: new Date().toISOString() }
          : p
      )
    );
  };

  const rejectOwner = async (userId: string) => {
    const response = await apiFetch(`/api/admin/owners/${encodeURIComponent(userId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'reject', reason: 'Business verification was not approved.' }) });
    if (!response.ok) return;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'suspended' } : u)));
    setOwnerProfiles((prev) => prev.map((p) => (p.userId === userId ? { ...p, approvalStatus: 'rejected' } : p)));
  };

  const requestOwnerCorrections = async (userId: string, message: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiFetch(`/api/admin/owners/${encodeURIComponent(userId)}/request-corrections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    const result = await response.json();
    if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to request corrections.' };
    setOwnerProfiles((previous) => previous.map((profile) => profile.userId === userId ? { ...profile, reviewMessage: message } : profile));
    return { success: true, message: 'Correction request sent to the owner.' };
  };

  const updatePendingOwnerVerification = async (tradeLicenseNumber: string, tradeLicenseFile: File, supportingFiles: File[]): Promise<{ success: boolean; message: string }> => {
    const form = new FormData();
    form.append('tradeLicenseNumber', tradeLicenseNumber.trim());
    form.append('tradeLicense', tradeLicenseFile);
    supportingFiles.forEach((file) => form.append('supportingDocuments', file));
    const response = await apiFetch('/api/owner/verification', { method: 'PUT', body: form });
    const result = await response.json();
    if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to update verification documents.' };
    const newDocuments = [tradeLicenseFile, ...supportingFiles].map((file, index) => ({ fileName: file.name, mimeType: file.type, dataUrl: URL.createObjectURL(file), documentType: index === 0 ? 'trade_license' as const : 'supporting_business_document' as const }));
    setOwnerProfiles((previous) => previous.map((profile) => profile.userId === currentUser.id ? { ...profile, nidOrTradeLicense: tradeLicenseNumber.trim(), businessVerificationDocuments: newDocuments, reviewMessage: '' } : profile));
    return { success: true, message: result.message || 'Verification documents updated.' };
  };

  // Owner updates their own payout method (bank account / bKash / Nagad / Rocket)
  const updateOwnerPayoutDetails = async (updates: {
    payoutMethod: 'bkash' | 'nagad' | 'rocket' | 'bank_account';
    accountNumber: string;
    bankName?: string;
    branchName?: string;
    accountHolderName?: string;
  }): Promise<{ success: boolean; message: string }> => {
    const profile = ownerProfiles.find((p) => p.userId === currentUser.id);
    if (!profile) return { success: false, message: 'Owner profile not found.' };
    if (!updates.accountNumber.trim()) {
      return { success: false, message: 'Please enter a valid account / wallet number.' };
    }

    try {
      const response = await apiFetch('/api/owner/payout-method', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: result.message || 'Unable to update payout details.' };
    } catch { return { success: false, message: 'Could not reach the payout service.' }; }

    setOwnerProfiles((prev) =>
      prev.map((p) =>
        p.userId === currentUser.id
          ? {
              ...p,
              payoutMethod: updates.payoutMethod,
              payoutDetails: {
                accountNumber: updates.accountNumber.trim(),
                bankName: updates.payoutMethod === 'bank_account' ? updates.bankName : undefined,
                branchName: updates.payoutMethod === 'bank_account' ? updates.branchName : undefined,
                accountHolderName: updates.accountHolderName || p.payoutDetails.accountHolderName,
              },
            }
          : p
      )
    );

    return { success: true, message: 'Payout details updated successfully.' };
  };

  const toggleUserSuspension = async (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    const status = user.status === 'suspended' ? 'active' : 'suspended';
    const response = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status } : u))
    );
  };

  // Staff Management
  const createStaff = async (name: string, email: string, phone: string, turfIds: string[], permissions: string[]): Promise<boolean> => {
    if (currentUser.role !== 'turf_owner' || currentUser.status !== 'active' || !ownerProfiles.some((p) => p.userId === currentUser.id && p.approvalStatus === 'active')) return false;
    try {
      const response = await apiFetch('/api/owner/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, turfIds, permissions }) });
      const result = await response.json();
      if (!response.ok || !result.success) return false;
      const staff = result.data.staff as Record<string, unknown>;
      const staffId = String(staff.id);
      setUsers((previous) => [...previous.filter((user) => user.id !== staffId), { id: staffId, name: String(staff.name || name), email: String(staff.email || email), phone: String(staff.phone || phone), role: 'staff', status: 'active', createdAt: String(staff.created_at || new Date().toISOString()) }]);
      setStaffAssignments((previous) => {
        const existing = previous.find((assignment) => assignment.staffUserId === staffId && assignment.ownerId === currentUser.id);
        const assignment: StaffAssignment = { id: existing?.id || staffId, staffUserId: staffId, staffName: name, staffEmail: email, staffPhone: phone, ownerId: currentUser.id, turfIds, permissions, status: 'active', invitedAt: existing?.invitedAt || new Date().toISOString(), createdAt: existing?.createdAt || new Date().toISOString() };
        return [...previous.filter((item) => item.staffUserId !== staffId || item.ownerId !== currentUser.id), assignment];
      });
      return true;
    } catch { return false; }
  };

  const updateStaffPermissions = (staffId: string, permissions: string[], turfIds: string[]) => {
    const staff = users.find((user) => user.id === staffId);
    if (!staff) return;
    void createStaff(staff.name, staff.email, staff.phone, turfIds, permissions);
  };

  // Withdrawals
  const requestWithdrawal = async (amount: number, payoutMethod: string, payoutDetails: string): Promise<{ success: boolean; message: string }> => {
    if (currentUser.role !== 'admin' && (currentUser.role !== 'turf_owner' || currentUser.status !== 'active' || !ownerProfiles.some((p) => p.userId === currentUser.id && p.approvalStatus === 'active'))) {
      return { success: false, message: 'Your owner account must be approved before requesting a withdrawal.' };
    }
    const wallet = wallets[currentUser.id];
    if (!wallet) return { success: false, message: 'Wallet not found' };
    if (amount < settings.minWithdrawalAmount) {
      return { success: false, message: `Minimum withdrawal amount is ৳${settings.minWithdrawalAmount}` };
    }
    if (amount > wallet.availableBalance) {
      return { success: false, message: `Requested amount exceeds available balance of ৳${wallet.availableBalance}` };
    }

    try {
      withdrawalIdempotencyKey.current ||= crypto.randomUUID();
      const response = await apiFetch('/api/owner/withdrawals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': withdrawalIdempotencyKey.current }, body: JSON.stringify({ amount }) });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: result.message || 'Withdrawal request was rejected.' };
      withdrawalIdempotencyKey.current = null;
      const row = result.data as Record<string, unknown>;
      const newRequest: WithdrawalRequest = { id: String(row.id), ownerId: currentUser.id, ownerName: currentUser.name, businessName: ownerProfiles.find((p) => p.userId === currentUser.id)?.businessName || 'Owner', amount: Number(row.amount || amount), payoutMethod: String(row.method || payoutMethod), payoutDetails, status: String(row.status || 'pending') as WithdrawalRequest['status'], createdAt: String(row.created_at || new Date().toISOString()) };
      setWallets((previous) => ({ ...previous, [currentUser.id]: { ...wallet, availableBalance: Number(row.available_balance ?? wallet.availableBalance - amount) } }));
      setWithdrawals((previous) => [newRequest, ...previous]);
    } catch { return { success: false, message: 'Could not reach the withdrawal service.' }; }
    return { success: true, message: `Withdrawal request for ৳${amount.toLocaleString()} submitted for admin review.` };
  };

  const approveWithdrawal = async (withdrawalId: string, reference: string) => {
    const approval = await apiFetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approve', reference }) });
    if (!approval.ok) return;
    const approvalResult = await approval.json();
    if (!approvalResult.success) return;
    setWithdrawals((previous) => previous.map((item) => item.id === withdrawalId ? { ...item, status: 'approved' } : item));
    const paid = await apiFetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'paid', reference }) });
    if (!paid.ok) return;
    const paidResult = await paid.json();
    if (!paidResult.success) return;
    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === withdrawalId
          ? {
              ...w,
              status: 'paid',
              reference,
              reviewedBy: currentUser.id,
              reviewedAt: new Date().toISOString(),
            }
          : w
      )
    );

    const wd = withdrawals.find((w) => w.id === withdrawalId);
    if (wd) {
      setWallets((prev) => {
        const ownerW = prev[wd.ownerId];
        if (!ownerW) return prev;
        return {
          ...prev,
          [wd.ownerId]: {
            ...ownerW,
            totalWithdrawn: ownerW.totalWithdrawn + wd.amount,
          },
        };
      });
    }
  };

  const rejectWithdrawal = async (withdrawalId: string, reason: string) => {
    const wd = withdrawals.find((w) => w.id === withdrawalId);
    if (!wd) return;
    const response = await apiFetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'reject', reason }) });
    if (!response.ok) return;

    setWithdrawals((prev) =>
      prev.map((w) =>
        w.id === withdrawalId
          ? {
              ...w,
              status: 'rejected',
              rejectionReason: reason,
              reviewedBy: currentUser.id,
              reviewedAt: new Date().toISOString(),
            }
          : w
      )
    );

    // Return funds back to available balance
    setWallets((prev) => {
      const ownerW = prev[wd.ownerId];
      if (!ownerW) return prev;
      return {
        ...prev,
        [wd.ownerId]: {
          ...ownerW,
          availableBalance: ownerW.availableBalance + wd.amount,
        },
      };
    });

  };

  const refreshPendingRefunds = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch('/api/admin/refunds/pending');
      const result = await response.json();
      if (!response.ok || !result?.success || !Array.isArray(result.data)) return;
      setPendingRefunds(result.data.map((row: Record<string, unknown>) => ({
        id: String(row.id), bookingId: String(row.booking_id), bookingNumber: String(row.booking_number || ''), playerName: String(row.player_name || ''),
        turfName: String(row.turf_name || ''), amount: Number(row.amount || 0), bookingSource: String(row.booking_source || 'online') as RefundRequest['bookingSource'],
        status: String(row.status || 'pending') as RefundRequest['status'], gatewaySupported: Boolean(row.gateway_supported),
        paymentGateway: String(row.payment_gateway || ''),
        gatewayRefundReference: String(row.gateway_refund_ref || ''), gatewayRequestId: String(row.gateway_request_id || ''),
        gatewayError: String(row.gateway_error || ''), createdAt: String(row.created_at || ''),
      })));
    } catch { /* retain the last loaded queue if the refresh fails */ }
  }, []);

  const refreshTurfs = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch('/api/turfs');
      const result = await response.json();
      if (response.ok && result?.success && Array.isArray(result.data)) setTurfs(result.data);
    } catch { /* keep the last loaded turf data if policy refresh fails */ }
  }, []);

  const processRefundWithGateway = async (refundId: string, provider: 'sslcommerz' | 'uddoktapay'): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch(`/api/admin/refunds/${encodeURIComponent(refundId)}/${provider}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: result.message || 'Gateway refund action failed.' };
      if (result.gatewayStatus === 'refunded') setPendingRefunds((previous) => previous.filter((refund) => refund.id !== refundId));
      else setPendingRefunds((previous) => previous.map((refund) => refund.id === refundId ? { ...refund, status: 'processing', gatewayRefundReference: String(result.data?.gateway_refund_ref || refund.gatewayRefundReference || '') } : refund));
      return { success: true, message: result.gatewayStatus === 'refunded' ? `${provider} confirms the refund is complete.` : `Refund request is with ${provider}. Check its status again later.` };
    } catch { return { success: false, message: 'Could not reach the refund service.' }; }
  };

  const markRefundProcessed = async (refundId: string, reference: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch(`/api/admin/refunds/${encodeURIComponent(refundId)}/processed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }) });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: result.message || 'Unable to record the manual refund.' };
      setPendingRefunds((previous) => previous.filter((refund) => refund.id !== refundId));
      return { success: true, message: 'Manual refund recorded.' };
    } catch { return { success: false, message: 'Could not reach the refund service.' }; }
  };

  const updatePlatformSettings = async (updates: Partial<PlatformSettings>) => {
    if (currentUser.role !== 'admin') return;
    let savedSmtpConfigs: SmtpConfig[] | undefined;
    let savedPaymentGateways: PlatformSettings['paymentGateways'] | undefined;
    if ('paymentGateways' in updates) {
      const sslcommerz = updates.paymentGateways?.find((gateway) => gateway.provider === 'sslcommerz');
      if (sslcommerz) {
        const response = await apiFetch('/api/admin/sslcommerz-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: sslcommerz }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save SSLCommerz settings.');
        const saved = result.data as PaymentGatewayConfig;
        savedPaymentGateways = (updates.paymentGateways || []).map((gateway) => gateway.provider === 'sslcommerz' ? saved : gateway);
      } else savedPaymentGateways = updates.paymentGateways;
    }
    if ('smtpConfigs' in updates) {
      const response = await apiFetch('/api/admin/smtp-configs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configs: updates.smtpConfigs || [] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save SMTP settings.');
      savedSmtpConfigs = result.data as SmtpConfig[];
    }
    const keys: Array<[keyof PlatformSettings, string]> = [
      ['globalCommissionRate', 'global_commission_rate'], ['platformFeeRate', 'platform_fee_rate'],
      ['gatewayFeeRate', 'gateway_fee_rate'], ['minWithdrawalAmount', 'minimum_withdrawal_amount'],
      ['defaultCancellationWindowHours', 'cancellation_window_hours'], ['supportedSports', 'supported_sports'],
    ];
    const persisted: Partial<PlatformSettings> = {};
    for (const [field, key] of keys) {
      if (!(field in updates)) continue;
      const response = await apiFetch(`/api/admin/settings/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: updates[field] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || `Unable to save ${key}.`);
      Object.assign(persisted, { [field]: updates[field] });
    }
    if ('featuredPackages' in updates) {
      const response = await apiFetch('/api/admin/settings/featured_packages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: updates.featuredPackages || [] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save featured packages.');
      persisted.featuredPackages = result.data.value as PlatformSettings['featuredPackages'];
    }
    setSettings((previous) => ({ ...previous, ...persisted, ...(savedSmtpConfigs ? { smtpConfigs: savedSmtpConfigs } : {}), ...(savedPaymentGateways ? { paymentGateways: savedPaymentGateways } : {}), ...Object.fromEntries(Object.keys(updates).filter((key) => !keys.some(([field]) => field === key) && key !== 'smtpConfigs' && key !== 'paymentGateways').map((key) => [key, updates[key as keyof PlatformSettings]])) }));
  };

  const scheduleOwnerBillingModelChange = async (billingModel: OwnerBillingModel | null): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiFetch('/api/owner/billing-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingModel }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) return { success: false, message: result?.message || 'Unable to schedule the billing-model change.' };
      const data = result.data as Record<string, unknown>;
      setOwnerProfiles((previous) => previous.map((profile) => profile.userId === currentUser.id ? {
        ...profile,
        pendingBillingModel: data.pendingBillingModel == null ? undefined : String(data.pendingBillingModel) as OwnerBillingModel,
        billingModelChangeEffectiveDate: data.billingModelChangeEffectiveDate == null ? undefined : String(data.billingModelChangeEffectiveDate),
      } : profile));
      return { success: true, message: String(result.message || 'Billing-model change updated.') };
    } catch {
      return { success: false, message: 'Could not reach the billing settings service.' };
    }
  };

  // Policy Management (Section 47)
  const savePolicyToApi = async (policy: Omit<CancellationPolicy, 'id'>, id?: string) => {
    const tiers = policy.tiers.map((tier) => ({ min: tier.minHoursBefore, max: tier.maxHoursBefore ?? null, refundPercentage: tier.refundPercentage }));
    const response = await apiFetch(id ? `/api/admin/cancellation-policies/${encodeURIComponent(id)}` : '/api/admin/cancellation-policies', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: policy.name, description: policy.description, isDefault: policy.isDefault, tiers }) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save cancellation policy.');
    const row = result.data as Record<string, unknown>;
    const saved: CancellationPolicy = { ...policy, id: String(row.id), isDefault: Boolean(row.is_default ?? row.isDefault), tiers: policy.tiers };
    setCancellationPolicies((previous) => id ? previous.map((item) => item.id === id ? saved : saved.isDefault ? { ...item, isDefault: false } : item) : [...previous, saved]);
  };
  const addCancellationPolicy = (policy: Omit<CancellationPolicy, 'id'>) => savePolicyToApi(policy);

  const updateCancellationPolicy = async (policyId: string, updates: Partial<CancellationPolicy>) => {
    const prior = cancellationPolicies.find((policy) => policy.id === policyId);
    if (!prior) throw new Error('Cancellation policy was not found.');
    await savePolicyToApi({ ...prior, ...updates }, policyId);
  };

  const deleteCancellationPolicy = async (policyId: string) => {
    const response = await apiFetch(`/api/admin/cancellation-policies/${encodeURIComponent(policyId)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete cancellation policy.');
    setCancellationPolicies((previous) => previous.filter((policy) => policy.id !== policyId));
  };

  // Review & Disputes
  const addReview = async (bookingId: string, rating: number, comment: string): Promise<{ success: boolean; message?: string }> => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking || currentUser.role !== 'player') return { success: false, message: 'Only the player who made this booking can review it.' };
    try {
      const response = await apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment }) });
      const result = await response.json();
      if (!response.ok || !result.success) return { success: false, message: String(result.message || 'Unable to save your review.') };
      const row = result.data as Record<string, unknown>;
      const newRev: Review = { id: String(row.id), bookingId, playerId: currentUser.id, playerName: currentUser.name, turfId: booking.turfId, rating: Number(row.rating), comment: String(row.comment || ''), createdAt: String(row.created_at || new Date().toISOString()) };
    setReviews((prev) => [newRev, ...prev]);
      setTurfs((previous) => previous.map((turf) => turf.id === booking.turfId ? { ...turf, rating: Number(row.turf_rating ?? turf.rating), reviewCount: Number(row.review_count ?? turf.reviewCount + 1) } : turf));
      return { success: true };
    } catch { return { success: false, message: 'Could not reach the review service. Please try again.' }; }
  };

  const raiseDispute = async (bookingId: string, category: Dispute['category'], description: string): Promise<boolean> => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking || !['player', 'turf_owner'].includes(currentUser.role)) return false;
    try {
      const response = await apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/disputes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: category, description }) });
      const result = await response.json();
      if (!response.ok || !result.success) return false;
      const row = result.data as Record<string, unknown>;
      setDisputes((previous) => [{ id: String(row.id), bookingId, bookingNumber: booking.bookingNumber, raisedByUserId: currentUser.id, raisedByName: currentUser.name, role: currentUser.role, category, description, status: 'pending', createdAt: String(row.created_at || new Date().toISOString()) }, ...previous]);
      return true;
    } catch { return false; }
  };

  const resolveDispute = async (disputeId: string, resolution: string) => {
    const response = await apiFetch(`/api/admin/disputes/${encodeURIComponent(disputeId)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved', resolution }) });
    if (!response.ok) return;
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === disputeId
          ? {
              ...d,
              status: 'resolved',
              resolutionNotes: resolution,
              resolvedBy: currentUser.name,
              resolvedAt: new Date().toISOString(),
            }
          : d
      )
    );
  };

  const toggleFavorite = async (turfId: string) => {
    if (!isAuthenticated || currentUser.role !== 'player') {
      openSignInModal('player');
      return;
    }
    const isFavorite = favorites.includes(turfId);
    try {
      const response = await apiFetch(`/api/player/favorites/${encodeURIComponent(turfId)}`, { method: isFavorite ? 'DELETE' : 'POST' });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to update saved turfs.');
      setFavorites((previous) => isFavorite ? previous.filter((id) => id !== turfId) : [...previous, turfId]);
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to update saved turfs.');
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!isAuthenticated || !['player', 'turf_owner', 'admin'].includes(currentUser.role)) return;
    try {
      const response = await apiFetch(`/api/player/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to mark notification as read.');
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to mark notification as read.');
    }
  };

  const clearAllNotifications = async () => {
    if (!isAuthenticated || !['player', 'turf_owner', 'admin'].includes(currentUser.role)) return;
    const unread = notifications.filter((item) => item.userId === currentUser.id && !item.read);
    const outcomes = await Promise.all(unread.map(async (item) => {
      try {
        const response = await apiFetch(`/api/player/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH' });
        const result = await response.json();
        return response.ok && result?.success ? item.id : null;
      } catch { return null; }
    }));
    const updatedIds = new Set(outcomes.filter((id): id is string => id !== null));
    setNotifications((prev) => prev.map((item) => updatedIds.has(item.id) ? { ...item, read: true } : item));
    if (updatedIds.size !== unread.length) showAppAlert('Some notifications could not be marked as read. Try again.');
  };

  const reloadMarketplaceCatalog = async () => {
    const [squadData, catalog] = await Promise.all([
      settings.featureFlags.squad_enabled
        ? Promise.all([
            marketplaceRequest<OpenMatch[]>('/api/open-matches'),
            marketplaceRequest<MatchParticipant[]>('/api/open-match-participants'),
          ])
        : Promise.resolve([[], []] as [OpenMatch[], MatchParticipant[]]),
      marketplaceRequest<{ tournaments: Tournament[]; teams: TournamentTeam[]; matches: TournamentMatch[] }>('/api/tournaments/catalog'),
    ]);
    const [matches, participants] = squadData;
    setOpenMatches(matches);
    setMatchParticipants(participants);
    setTournaments(catalog.tournaments);
    setTournamentTeams(catalog.teams);
    setTournamentMatches(catalog.matches);
  };

  const createOpenMatch = async (params: { bookingId: string; skillLevel: OpenMatchSkillLevel; maxPlayers: number; notes?: string }) => {
    try {
      const match = await marketplaceRequest<OpenMatch>(`/api/player/bookings/${encodeURIComponent(params.bookingId)}/open-match`, 'POST', params);
      setOpenMatches((previous) => [match, ...previous.filter((item) => item.id !== match.id)]);
      setMatchParticipants((previous) => [...previous, { id: `captain-${match.id}`, matchId: match.id, playerId: match.captainId, playerName: `${match.captainName} (Captain)`, playerPhone: match.captainPhone, joinedAt: match.createdAt, status: 'joined' }]);
      return { success: true, message: 'Open Match posted successfully.', match };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unable to post Open Match.' };
    }
  };

  const updateOpenMatch = async (matchId: string, updates: Partial<OpenMatch>) => {
    const body: Record<string, unknown> = {};
    if (updates.skillLevel !== undefined) body.skillLevel = updates.skillLevel;
    if (updates.maxPlayers !== undefined) body.maxPlayers = updates.maxPlayers;
    if (updates.notes !== undefined) body.notes = updates.notes;
    const updated = await marketplaceRequest<OpenMatch>(`/api/open-matches/${encodeURIComponent(matchId)}`, 'PATCH', body);
    setOpenMatches((previous) => previous.map((match) => match.id === matchId ? updated : match));
  };

  const cancelOpenMatch = async (matchId: string) => {
    try {
      await marketplaceRequest(`/api/open-matches/${encodeURIComponent(matchId)}`, 'DELETE');
      setOpenMatches((previous) => previous.map((match) => match.id === matchId ? { ...match, status: 'cancelled' } : match));
      return { success: true, message: 'Open Match cancelled.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to cancel Open Match.' }; }
  };

  const joinOpenMatch = async (matchId: string) => {
    try {
      await marketplaceRequest(`/api/open-matches/${encodeURIComponent(matchId)}/join`, 'POST');
      await Promise.all([
        marketplaceRequest<OpenMatch[]>('/api/open-matches').then(setOpenMatches),
        marketplaceRequest<MatchParticipant[]>('/api/open-match-participants').then(setMatchParticipants),
      ]);
      return { success: true, message: 'You joined the Open Match.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to join Open Match.' }; }
  };

  const leaveOpenMatch = async (matchId: string) => {
    try {
      await marketplaceRequest(`/api/open-matches/${encodeURIComponent(matchId)}/leave`, 'POST');
      await Promise.all([
        marketplaceRequest<OpenMatch[]>('/api/open-matches').then(setOpenMatches),
        marketplaceRequest<MatchParticipant[]>('/api/open-match-participants').then(setMatchParticipants),
      ]);
      return { success: true, message: 'You have left the Open Match.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to leave Open Match.' }; }
  };

  const removeMatchParticipant = async (matchId: string, playerId: string) => {
    try {
      await marketplaceRequest(`/api/open-matches/${encodeURIComponent(matchId)}/participants/${encodeURIComponent(playerId)}`, 'DELETE');
      await Promise.all([
        marketplaceRequest<OpenMatch[]>('/api/open-matches').then(setOpenMatches),
        marketplaceRequest<MatchParticipant[]>('/api/open-match-participants').then(setMatchParticipants),
      ]);
      return { success: true, message: 'Participant removed from squad.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to remove participant.' }; }
  };

  const createTournament = async (params: {
    turfId: string; name: string; sportType: string; format: string; startDate: string;
    endDate: string; maxTeams: number; entryFeeAmount?: number; prizePoolNote?: string; description: string;
  }) => {
    const tournament = await marketplaceRequest<Tournament>('/api/owner/tournaments', 'POST', params);
    setTournaments((previous) => [tournament, ...previous]);
    return tournament;
  };

  const updateTournament = async (id: string, updates: Partial<Tournament>) => {
    const updated = await marketplaceRequest<Tournament>(`/api/owner/tournaments/${encodeURIComponent(id)}`, 'PATCH', updates as Record<string, unknown>);
    setTournaments((previous) => previous.map((tournament) => tournament.id === id ? updated : tournament));
    return updated;
  };

  const resubmitTournament = async (id: string) => {
    const tournament = await marketplaceRequest<Tournament>(`/api/owner/tournaments/${encodeURIComponent(id)}/resubmit`, 'POST');
    setTournaments((previous) => previous.map((item) => item.id === id ? tournament : item));
    return tournament;
  };

  const decideTournamentReview = async (id: string, decision: 'approve' | 'request_changes', message = '') => {
    const tournament = await marketplaceRequest<Tournament>(`/api/admin/tournaments/${encodeURIComponent(id)}/decision`, 'POST', { decision, message });
    setTournaments((previous) => previous.map((item) => item.id === id ? tournament : item));
  };

  const cancelTournament = async (id: string) => {
    await marketplaceRequest(`/api/owner/tournaments/${encodeURIComponent(id)}/cancel`, 'POST');
    await reloadMarketplaceCatalog();
  };

  const registerTournamentTeam = async (tournamentId: string, teamName: string, rosterNotes?: string, rosterMembers?: Array<{ memberName?: string; playerId?: string }>) => {
    try {
      const team = await marketplaceRequest<TournamentTeam>(`/api/tournaments/${encodeURIComponent(tournamentId)}/register`, 'POST', { teamName, rosterNotes, rosterMembers });
      await reloadMarketplaceCatalog();
      return { success: true, message: team.status === 'pending_roster' ? `Team "${team.teamName}" was created. Invited players must accept before the roster is confirmed.` : `Team "${team.teamName}" registered successfully.`, team };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to register team.' }; }
  };

  const searchTournamentPlayers = async (tournamentId: string, query: string) => {
    if (query.trim().length < 2) return [];
    return marketplaceRequest<TournamentPlayerSearchResult[]>(`/api/tournaments/${encodeURIComponent(tournamentId)}/player-search?q=${encodeURIComponent(query.trim())}`);
  };

  const respondTournamentInvitation = async (tournamentId: string, memberId: string, decision: 'accept' | 'decline') => {
    await marketplaceRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/invitations/${encodeURIComponent(memberId)}/respond`, 'POST', { decision });
    await reloadMarketplaceCatalog();
  };

  const withdrawTournamentTeam = async (tournamentId: string, teamId: string) => {
    try {
      await marketplaceRequest(`/api/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}`, 'DELETE');
      await reloadMarketplaceCatalog();
      return { success: true, message: 'Team registration withdrawn.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to withdraw team.' }; }
  };

  const addOrUpdateTournamentMatch = async (tournamentId: string, matchData: {
    id?: string; roundName: string; teamAId?: string; teamBId?: string; teamAName?: string; teamBName?: string;
    scheduledDate: string; scheduledStartTime: string; scheduledEndTime: string; slotId?: string;
    scoreA?: number; scoreB?: number; winnerTeamId?: string; status?: TournamentMatchStatus;
  }) => {
    const match = await marketplaceRequest<TournamentMatch>(`/api/owner/tournaments/${encodeURIComponent(tournamentId)}/matches`, 'POST', matchData as unknown as Record<string, unknown>);
    await reloadMarketplaceCatalog();
    return match;
  };

  const requestFeaturedListing = async (params: { turfId: string; packageId: string; applyCredits?: boolean }) => {
    try {
      const result = await marketplaceRequest<{ listing: FeaturedRequest; gatewayPageURL: string | null }>('/api/owner/featured-listings', 'POST', params);
      const request = result.listing;
      setFeaturedRequests((previous) => [request, ...previous]);
      return { success: true, message: result.gatewayPageURL ? 'Opening SSLCommerz checkout…' : 'Credits covered the package. Your listing is awaiting admin approval.', request, checkoutUrl: result.gatewayPageURL };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to purchase featured listing.' }; }
  };

  const cancelFeaturedListing = async (listingId: string, reason: string) => {
    try {
      const result = await marketplaceRequest<{ listingId: string; creditIssued: number }>(`/api/owner/featured-listings/${encodeURIComponent(listingId)}/cancel`, 'POST', { reason });
      setFeaturedRequests((previous) => previous.map((item) => item.id === listingId ? { ...item, status: 'cancelled' } : item));
      return { success: true, creditIssued: Number(result.creditIssued), message: `Listing cancelled. ৳${Number(result.creditIssued).toFixed(2)} platform credit issued.` };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to cancel featured listing.' }; }
  };

  const adminCancelFeaturedListing = async (listingId: string, reason: string, ownerFault: boolean) => {
    try {
      const result = await marketplaceRequest<{ listingId: string; creditIssued: number }>(`/api/admin/featured-listings/${encodeURIComponent(listingId)}/cancel`, 'PATCH', { reason, ownerFault });
      setFeaturedRequests((previous) => previous.map((item) => item.id === listingId ? { ...item, status: 'cancelled' } : item));
      return { success: true, message: `Listing cancelled. ৳${Number(result.creditIssued).toFixed(2)} platform credit issued.` };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to cancel featured listing.' }; }
  };

  const approveFeaturedRequest = async (requestId: string) => {
    try {
      const request = await marketplaceRequest<FeaturedRequest>(`/api/admin/featured-listings/${encodeURIComponent(requestId)}/approve`, 'PATCH');
      setFeaturedRequests((previous) => previous.map((item) => item.id === requestId ? request : item));
      return { success: true, message: 'Featured listing approved.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to approve listing.' }; }
  };

  const rejectFeaturedRequest = async (requestId: string, reason: string, ownerFault: boolean) => {
    try {
      const request = await marketplaceRequest<FeaturedRequest>(`/api/admin/featured-listings/${encodeURIComponent(requestId)}/reject`, 'PATCH', { reason, ownerFault });
      setFeaturedRequests((previous) => previous.map((item) => item.id === requestId ? request : item));
      return { success: true, message: 'Featured listing rejected.' };
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Unable to reject listing.' }; }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        isSignInModalOpen,
        setIsSignInModalOpen,
        isGetStartedModalOpen,
        setIsGetStartedModalOpen,
        signInRolePreset,
        openSignInModal,
        openGetStartedModal,
        loginWithCredentials,
        logoutUser,
        playerActiveTab,
        setPlayerActiveTab,
        ownerActiveTab,
        setOwnerActiveTab,
        adminActiveTab,
        setAdminActiveTab,
        openOwnerManualBookingModal,
        setOpenOwnerManualBookingModal,
        openStaffManualBookingModal,
        setOpenStaffManualBookingModal,
        registerNewUser,
        verifyActivationCode,
        updateUnverifiedEmail,
        resendActivationCode,
        requestPasswordReset,
        resetPasswordWithCode,
        switchRoleDirectly,
        users,
        ownerProfiles,
        turfs,
        slots,
        bookings,
        staffAssignments,
        wallets,
        withdrawals,
        pendingRefunds,
        refreshPendingRefunds,
        refreshTurfs,
        cancellationPolicies,
        reviews,
        disputes,
        notifications,
        settings,
        favorites,
        openMatches,
        matchParticipants,
        tournaments,
        tournamentTeams,
        tournamentMatches,
        unlockSlots,
        createManualBooking,
        cancelBooking,
        decideCancellationRequest,
        checkInBooking,
        completeBooking,
        toggleSlotBlock,
        loadAvailability,
        createTurf,
        updateTurf,
        uploadTurfPhotos,
        updateProfileImage,
        deleteTurf,
        approveTurf,
        rejectTurf,
        approveOwner,
        rejectOwner,
        requestOwnerCorrections,
        updatePendingOwnerVerification,
        updateOwnerPayoutDetails,
        toggleUserSuspension,
        createStaff,
        updateStaffPermissions,
        requestWithdrawal,
        approveWithdrawal,
        rejectWithdrawal,
        processRefundWithGateway,
        markRefundProcessed,
        updatePlatformSettings,
        scheduleOwnerBillingModelChange,
        addCancellationPolicy,
        updateCancellationPolicy,
        deleteCancellationPolicy,
        calculateRefund,
        addReview,
        raiseDispute,
        resolveDispute,
        toggleFavorite,
        markNotificationRead,
        clearAllNotifications,
        createOpenMatch,
        updateOpenMatch,
        cancelOpenMatch,
        joinOpenMatch,
        leaveOpenMatch,
        removeMatchParticipant,
        createTournament,
        updateTournament,
        resubmitTournament,
        decideTournamentReview,
        cancelTournament,
        registerTournamentTeam,
        searchTournamentPlayers,
        respondTournamentInvitation,
        withdrawTournamentTeam,
        addOrUpdateTournamentMatch,
        featuredRequests,
        requestFeaturedListing,
        cancelFeaturedListing,
        adminCancelFeaturedListing,
        approveFeaturedRequest,
        rejectFeaturedRequest,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
