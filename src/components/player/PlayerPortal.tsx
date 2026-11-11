import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useApp } from '../../context/AppContext';
import { Turf, Slot, Booking } from '../../types';
import { formatBDDate, formatBDTimeRange, getBDDateString, getBDNow } from '../../utils/datetime';
import {
  Search,
  MapPin,
  Star,
  Clock,
  Shield,
  CreditCard,
  QrCode,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  Heart,
  HelpCircle,
  Sparkles,
  Users,
  ArrowRight,
  ArrowLeft,
  Trophy,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Share2,
  Award,
  Zap,
  Flame,
  UserPlus,
  Building2,
  TrendingUp,
  DollarSign,
  Check,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCw,
  Headset,
  PlayCircle,
  Ticket,
  CircleCheck,
  LogIn,
} from 'lucide-react';
import { TurfySlotHome } from './TurfySlotHome';
import { SquadsView } from '../squads/SquadsView';
import { TournamentsView } from '../tournaments/TournamentsView';
import { TurfMap } from '../common/LazyTurfMap';
import { ClickableDatePicker } from '../common/CustomSelect';
import { apiFetch } from '../../utils/apiClient';
import { calculateDisplayedTurfPrice } from '../../../database/pricing.js';

import heroPlayerCleanImg from '../../assets/images/hero_player_clean_1788976334634.jpg';
import cityTurfMapImg from '../../assets/images/city_turf_map_1788975628489.jpg';
import completeTeamActionImg from '../../assets/images/complete_team_action_1788975639446.jpg';
import mobileAppMockupImg from '../../assets/images/mobile_app_mockup_1788975653380.jpg';
import turfStadiumNightImg from '../../assets/images/turf_stadium_night_1788976698343.jpg';

interface SquadMatch {
  id: string;
  turfName: string;
  area: string;
  sport: string;
  date: string;
  time: string;
  hostName: string;
  playersNeeded: number;
  skillLevel: string;
}

const formatSlotRange = formatBDTimeRange;
const BOOKING_HISTORY_PAGE_SIZE = 8;
const parseApiResponse = async (response: Response, service: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${service} returned a web page instead of JSON (HTTP ${response.status}). Please try again later.`);
  }
  return response.json();
};

const hasMatchEnded = (booking: Booking): boolean => {
  const date = String(booking.date || '').slice(0, 10);
  const endTime = String(booking.endTime || '').slice(0, 8);
  const timeMatch = endTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !timeMatch) return false;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  if (hour > 24 || minute > 59 || second > 59 || (hour === 24 && (minute !== 0 || second !== 0))) return false;
  let endDate = date;
  const normalizedHour = hour === 24 ? '00' : String(hour).padStart(2, '0');
  if (hour === 24) {
    const [year, month, day] = date.split('-').map(Number);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    endDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
  }
  const normalizedTime = `${normalizedHour}:${timeMatch[2]}:${String(second).padStart(2, '0')}`;
  const end = new Date(`${endDate}T${normalizedTime}+06:00`).getTime();
  return Number.isFinite(end) && end <= Date.now();
};

export const PlayerPortal: React.FC = () => {
  const {
    turfs,
    slots,
    loadAvailability,
    bookings,
    currentUser,
    isAuthenticated,
    openSignInModal,
    openGetStartedModal,
    switchRoleDirectly,
    unlockSlots,
    upsertBooking,
    cancelBooking,
    addReview,
    raiseDispute,
    favorites,
    toggleFavorite,
    calculateRefund,
    refreshTurfs,
    openMatches,
    matchParticipants,
    joinOpenMatch,
    playerActiveTab,
    setPlayerActiveTab,
    settings,
  } = useApp();

  const activeTab = playerActiveTab === 'squads' && !settings.featureFlags?.squad_enabled
    ? 'explore'
    : playerActiveTab === 'tournaments' && !settings.featureFlags?.tournament_enabled
      ? 'explore'
      : playerActiveTab;
  const setActiveTab = (tab: typeof playerActiveTab) => {
    if ((tab === 'squads' && !settings.featureFlags?.squad_enabled)
      || (tab === 'tournaments' && !settings.featureFlags?.tournament_enabled)) {
      setPlayerActiveTab('explore');
      return;
    }
    setPlayerActiveTab(tab);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<string>('all');

  // Hero Slider Images from User Design
  const heroSlides = [
    'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1518600506278-4e8fe0e9e4b1?auto=format&fit=crop&w=2000&q=85',
  ];
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Turf Owner Calculator State
  const [calcRate, setCalcRate] = useState<number>(1600);
  const [calcHours, setCalcHours] = useState<number>(4);

  // Booking Flow State
  const [selectedTurf, setSelectedTurf] = useState<Turf | null>(null);
  const [turfAddons, setTurfAddons] = useState<Turf['addons']>([]);
  const [addonLoadError, setAddonLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(getBDDateString());
  const dateScrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedTurf?.id) void loadAvailability(selectedTurf.id, selectedDate);
  }, [selectedTurf?.id, selectedDate, loadAvailability]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedBookingSlots, setSelectedBookingSlots] = useState<Slot[]>([]);
  const [bookingDurationHours, setBookingDurationHours] = useState<number>(1);
  const [lockExpiryAt, setLockExpiryAt] = useState<string | null>(null);
  const [reservedBookingId, setReservedBookingId] = useState<string | null>(null);
  const [isCreatingHold, setIsCreatingHold] = useState(false);
  const bookingHoldRequestRef = useRef(false);
  const [bookingHoldError, setBookingHoldError] = useState('');
  const bookingHoldSeconds = (settings.bookingHoldMinutes ?? 10) * 60;
  const [lockTimerSeconds, setLockTimerSeconds] = useState<number>(bookingHoldSeconds);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [slotToReplaceSelection, setSlotToReplaceSelection] = useState<Slot | null>(null);
  const [showSSLGateway, setShowSSLGateway] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
  const [availableGateways, setAvailableGateways] = useState<Array<{ id: string; provider: string; label: string; isSandbox: boolean; isActive: boolean }>>([]);
  const [gatewayOptionsLoading, setGatewayOptionsLoading] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [gatewaySessionUrl, setGatewaySessionUrl] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState('');
  const [paymentReturnMessage, setPaymentReturnMessage] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  useEffect(() => {
    if (!selectedTurf?.id || reservedBookingId || showCheckoutModal || showSSLGateway) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void loadAvailability(selectedTurf.id, selectedDate);
    };
    const timer = window.setInterval(refreshIfVisible, 5000);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [selectedTurf?.id, selectedDate, reservedBookingId, showCheckoutModal, showSSLGateway, loadAvailability]);

  useEffect(() => {
    if (!selectedBookingSlots.length || reservedBookingId) return;
    const lostSlot = selectedBookingSlots.find((selected) => {
      const latest = slots.find((slot) => slot.id === selected.id);
      return latest && latest.status !== 'available' && latest.lockedByUserId !== currentUser.id;
    });
    if (!lostSlot) return;
    setSelectedBookingSlots([]);
    setSelectedSlot(null);
    setBookingDurationHours(1);
    setLockExpiryAt(null);
    setBookingHoldError('That time was just reserved by another player. Choose an available time.');
  }, [slots, selectedBookingSlots, reservedBookingId, currentUser.id]);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [selectedAddonQuantities, setSelectedAddonQuantities] = useState<Record<string, number>>({});
  const [serverBookingQuote, setServerBookingQuote] = useState<{
    addonTotal: number;
    platformFeeAmount: number;
    gatewayFeeAmount: number;
    totalPayable: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTurfAddons([]);
    setSelectedAddonQuantities({});
    setServerBookingQuote(null);
    setAddonLoadError('');
    if (!selectedTurf?.id || !settings.featureFlags?.addons_enabled) return () => { cancelled = true; };
    apiFetch(`/api/turfs/${encodeURIComponent(selectedTurf.id)}/addons`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.message || 'Unable to load turf add-ons.');
        }
        if (cancelled) return;
        setTurfAddons(result.data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          turfId: String(row.turfId),
          name: String(row.name),
          description: String(row.description || ''),
          category: String(row.category) as NonNullable<Turf['addons']>[number]['category'],
          price: Number(row.price),
          stockQuantity: row.availableStock == null ? null : Number(row.availableStock),
          isActive: Boolean(row.isActive),
          displayOrder: Number(row.displayOrder || 0),
        })));
      })
      .catch((error: unknown) => {
        if (!cancelled) setAddonLoadError(error instanceof Error ? error.message : 'Unable to load turf add-ons.');
      });
    return () => { cancelled = true; };
  }, [selectedTurf?.id, settings.featureFlags?.addons_enabled]);

  useEffect(() => {
    let cancelled = false;
    const loadGateways = async () => {
      const retryDelays = [500, 1000, 2000, 3000, 3000, 3000, 3000];
      for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
        if (cancelled) return;
        try {
          const response = await apiFetch('/api/payments/gateways');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          if (!result?.success || !Array.isArray(result.data)) throw new Error('The payment options API returned an invalid response.');
          if (!cancelled) setAvailableGateways(result.data);
          if (!cancelled) setGatewayOptionsLoading(false);
          return;
        } catch {
          if (attempt < retryDelays.length) await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
        }
      }
      if (!cancelled) setAvailableGateways([]);
      if (!cancelled) setGatewayOptionsLoading(false);
    };
    void loadGateways();
    return () => { cancelled = true; };
  }, []);
  const activeGateways = availableGateways;
  const selectedGateway = activeGateways.find((g) => g.id === selectedGatewayId) || activeGateways[0];

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const bookingId = params.get('booking_id');
    if (!payment) return;
    let cancelled = false;
    const clearPaymentQuery = () => window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
    if (payment !== 'success' || !bookingId) {
      setPaymentReturnMessage(payment === 'refund_pending' ? 'Payment was validated after the booking hold expired; the payment is queued for refund review.' : 'Payment is not confirmed yet. Check your booking history before trying again.');
      clearPaymentQuery();
      return;
    }
    apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}`).then((response) => response.json()).then((result) => {
      if (cancelled) return;
      const row = result?.data as Record<string, unknown> | undefined;
      if (!result?.success || !row || row.status !== 'confirmed') {
        setPaymentReturnMessage('The gateway return arrived, but the server has not confirmed this payment. Check your booking history shortly.');
        return;
      }
      const booking: Booking = {
        id: String(row.id), bookingNumber: String(row.booking_number || row.bookingNumber || ''), playerId: String(row.player_id || currentUser.id),
        customerName: currentUser.name, customerPhone: currentUser.phone, customerEmail: currentUser.email,
        turfId: String(row.turf_id || ''), turfName: String(row.turf_name || ''), slotId: '', date: String(row.booking_date || row.date || '').slice(0, 10),
        startTime: String(row.start_time || '').slice(0, 5), endTime: String(row.end_time || '').slice(0, 5), totalHours: Number(row.total_hours || 1),
        bookingSource: 'online', status: 'confirmed', baseAmount: Number(row.base_amount || 0), commissionAmount: Number(row.commission_amount || 0),
        platformFeeAmount: Number(row.platform_fee_amount || 0), hasGatewayFee: Number(row.gateway_fee_amount || 0) > 0, gatewayFeeAmount: Number(row.gateway_fee_amount || 0),
        totalPaid: Number(row.total_payable || 0), netOwnerAmount: Number(row.net_owner_amount || 0), paymentMethod: String(row.payment_gateway || 'sslcommerz') as Booking['paymentMethod'],
        paymentStatus: String(row.payment_status || 'paid') as Booking['paymentStatus'], paymentReference: String(row.payment_reference || ''), qrCode: String(row.qr_code || ''),
        createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
      };
      setConfirmedBooking(booking);
      upsertBooking(booking);
      clearPaymentQuery();
    }).catch(() => { if (!cancelled) setPaymentReturnMessage('Unable to verify the returned booking right now. Check your booking history shortly.'); });
    return () => { cancelled = true; };
  }, [currentUser.email, currentUser.id, currentUser.name, currentUser.phone, isAuthenticated]);


  // Cancellation & Review Modal State
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [bookingForReview, setBookingForReview] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [selectedBookingForQR, setSelectedBookingForQR] = useState<Booking | null>(null);
  const [bookingMapId, setBookingMapId] = useState<string | null>(null);
  const [bookingHistoryPage, setBookingHistoryPage] = useState(1);
  const [disputeBooking, setDisputeBooking] = useState<Booking | null>(null);
  const [disputeDesc, setDisputeDesc] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [disputeCategory, setDisputeCategory] = useState<'facility_unavailable' | 'refund_issue' | 'payment_mismatch' | 'other'>('facility_unavailable');

  // Squad Finder Modal State
  const [showSquadModal, setShowSquadModal] = useState(false);
  const [squadJoinMessage, setSquadJoinMessage] = useState('');
  const joinedSquadIds = useMemo(
    () => matchParticipants
      .filter((participant) => participant.playerId === currentUser.id && participant.status === 'joined')
      .map((participant) => participant.matchId),
    [currentUser.id, matchParticipants],
  );
  const squadMatches = useMemo<SquadMatch[]>(
    () => openMatches
      .filter((match) => match.status === 'open')
      .map((match) => ({
        id: match.id,
        turfName: match.turfName,
        area: match.area,
        sport: match.sportType,
        date: formatBDDate(match.date),
        time: formatBDTimeRange(match.startTime, match.endTime),
        hostName: match.captainName,
        playersNeeded: Math.max(0, match.maxPlayers - match.joinedCount),
        skillLevel: match.skillLevel,
      })),
    [openMatches],
  );

  // Filter Active Public Turfs
  const publicTurfs = turfs.filter((t) => t.status === 'active');
  const sportsList = ['All', 'Football', 'Cricket', 'Futsal', 'Badminton'];
  const uniqueAreas = Array.from(new Set(publicTurfs.map((t) => t.area)));
  const areasList = ['All', ...uniqueAreas];

  const filteredTurfs = publicTurfs.filter((turf) => {
    const matchesSearch =
      turf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      turf.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
      turf.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSport = selectedSport === 'All' || turf.sportTypes.includes(selectedSport);
    const matchesArea =
      selectedArea === 'All' ||
      turf.area.toLowerCase() === selectedArea.toLowerCase() ||
      turf.city.toLowerCase() === selectedArea.toLowerCase();
    return matchesSearch && matchesSport && matchesArea;
  });

  const myBookings = bookings.filter((b) => (b.playerId === currentUser.id || b.customerPhone === currentUser.phone) && b.status !== 'expired');
  const bookingHistoryPageCount = Math.max(1, Math.ceil(myBookings.length / BOOKING_HISTORY_PAGE_SIZE));
  const currentBookingHistoryPage = Math.min(bookingHistoryPage, bookingHistoryPageCount);
  const visibleMyBookings = myBookings.slice(
    (currentBookingHistoryPage - 1) * BOOKING_HISTORY_PAGE_SIZE,
    currentBookingHistoryPage * BOOKING_HISTORY_PAGE_SIZE,
  );
  const favoriteTurfs = turfs.filter((turf) => favorites.includes(turf.id));

  // Keep the selected date inside the quick strip, even when it is months ahead.
  const todayDate = new Date(`${getBDDateString()}T00:00:00Z`);
  const selectedDateOffset = Math.max(0, Math.round((new Date(`${selectedDate}T00:00:00Z`).getTime() - todayDate.getTime()) / 86_400_000));
  const dateListStartOffset = selectedDateOffset > 13 ? Math.max(0, selectedDateOffset - 6) : 0;
  const dateOptions = Array.from({ length: 14 }, (_, index) => {
    const offset = dateListStartOffset + index;
    const dateStr = getBDDateString(offset);
    const label =
      offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : new Date(`${dateStr}T12:00:00+06:00`).toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', weekday: 'short', month: 'short', day: 'numeric' });
    return { dateStr, label };
  });

  const turfSlotsForSelectedDate = selectedTurf
    ? slots.filter((s) => s.turfId === selectedTurf.id && s.date === selectedDate)
    : [];

  const slotsByTurf = React.useMemo(() => {
    const acc: Record<string, Slot[]> = {};
    for (const turf of turfs) {
      acc[turf.id] = slots.filter((s) => s.turfId === turf.id && s.date === selectedDate);
    }
    return acc;
  }, [turfs, slots, selectedDate]);

  const parseTimeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const isSlotExpired = (slot: Slot) => {
    const today = getBDDateString();
    if (slot.date < today) return true;
    if (slot.date > today) return false;
    const now = getBDNow();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return parseTimeToMinutes(slot.startTime) <= currentMinutes;
  };

  const formatLockTimer = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const releaseCurrentHold = async (bookingId = reservedBookingId) => {
    unlockSlots(selectedBookingSlots.map((item) => item.id));
    setReservedBookingId(null);
    setLockExpiryAt(null);
    setLockTimerSeconds(bookingHoldSeconds);
    setSelectedSlot(null);
    setSelectedBookingSlots([]);
    setBookingDurationHours(1);
    setShowCheckoutModal(false);
    if (bookingId) {
      try {
        await apiFetch(`/api/bookings/${encodeURIComponent(bookingId)}/release-hold`, { method: 'POST' });
      } catch { /* the server expiry remains the fallback release */ }
    }
    if (selectedTurf?.id) void loadAvailability(selectedTurf.id, selectedDate);
  };

  const resetLockedSelection = () => {
    if (reservedBookingId) void releaseCurrentHold(reservedBookingId);
    if (selectedBookingSlots.length > 0) {
      unlockSlots(selectedBookingSlots.map((item) => item.id));
    }
    setSelectedSlot(null);
    setSelectedBookingSlots([]);
    setBookingDurationHours(1);
    setLockExpiryAt(null);
    setLockTimerSeconds(bookingHoldSeconds);
  };

  const handleSelectSlot = (slot: Slot) => {
    if (isSlotExpired(slot)) return;
    if (!isAuthenticated) {
      openSignInModal('player');
      return;
    }

    const isOwnedLockedSlot = slot.status === 'locked' && slot.lockedByUserId === currentUser.id;

    if (slot.status !== 'available' && !isOwnedLockedSlot) return;

    const currentSelection = [...selectedBookingSlots];
    const isCurrentlySelected = currentSelection.some((item) => item.id === slot.id);

    if (reservedBookingId) {
      if (isCurrentlySelected) void releaseCurrentHold(reservedBookingId);
      return;
    }

    if (isCurrentlySelected) {
      const selectedIndex = currentSelection.findIndex((item) => item.id === slot.id);
      // Keep the remaining selection contiguous: removing the first slot
      // trims the front; removing any later slot trims it and everything after.
      const nextSelection = selectedIndex === 0
        ? currentSelection.slice(1)
        : currentSelection.slice(0, selectedIndex);
      const releasedSlots = selectedIndex === 0
        ? currentSelection.slice(0, 1)
        : currentSelection.slice(selectedIndex);
      unlockSlots(releasedSlots.map((item) => item.id));
      setSelectedSlot(nextSelection[0] || null);
      setSelectedBookingSlots(nextSelection);
      setBookingDurationHours(Math.max(1, nextSelection.length));
      if (nextSelection.length === 0) {
        setLockExpiryAt(null);
        setLockTimerSeconds(bookingHoldSeconds);
      }
      return;
    }

    if (currentSelection.length === 0) {
      const nextSelection = [slot];
      setSelectedSlot(slot);
      setSelectedBookingSlots(nextSelection);
      setBookingDurationHours(1);
      return;
    }

    const currentFirst = currentSelection[0];
    const currentLast = currentSelection[currentSelection.length - 1];
    const slotStartMinutes = parseTimeToMinutes(slot.startTime);
    const slotEndMinutes = parseTimeToMinutes(slot.endTime);
    const firstStartMinutes = parseTimeToMinutes(currentFirst.startTime);
    const lastEndMinutes = parseTimeToMinutes(currentLast.endTime);

    const isAdjacentBefore = slotEndMinutes === firstStartMinutes;
    const isAdjacentAfter = slotStartMinutes === lastEndMinutes;

    if (!isAdjacentBefore && !isAdjacentAfter) {
      setSlotToReplaceSelection(slot);
      return;
    }

    const nextSelection = isAdjacentBefore ? [slot, ...currentSelection] : [...currentSelection, slot];
    setSelectedBookingSlots(nextSelection);
    setSelectedSlot(nextSelection[0]);
    setBookingDurationHours(nextSelection.length);
  };

  const handleContinueBooking = async () => {
    if (reservedBookingId) {
      setShowCheckoutModal(true);
      return;
    }
    const effectiveBookingSlots = selectedBookingSlots;

    if (effectiveBookingSlots.length === 0 || bookingHoldRequestRef.current) return;

    const firstSelectedSlot = effectiveBookingSlots[0];
    const matchedTurf = turfs.find((turf) => turf.id === firstSelectedSlot.turfId) || selectedTurf;

    if (matchedTurf) {
      setSelectedTurf(matchedTurf);
    }

    setBookingHoldError('');
    bookingHoldRequestRef.current = true;
    setIsCreatingHold(true);
    try {
      const response = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          turfId: firstSelectedSlot.turfId,
          date: firstSelectedSlot.date,
          startTime: firstSelectedSlot.startTime,
          durationHours: effectiveBookingSlots.length,
          addons: Object.entries(selectedAddonQuantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([addonId, quantity]) => ({ addonId, quantity })),
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`The booking service returned a web page instead of JSON (HTTP ${response.status}). Refresh the page and try again.`);
      }
      const result = await response.json();
      if (!response.ok || !result?.success) {
        unlockSlots(effectiveBookingSlots.map((slot) => slot.id));
        setSelectedSlot(null);
        setSelectedBookingSlots([]);
        setBookingDurationHours(1);
        setLockExpiryAt(null);
        setReservedBookingId(null);
        setServerBookingQuote(null);
        setShowCheckoutModal(false);
        await loadAvailability(firstSelectedSlot.turfId, firstSelectedSlot.date);
        setBookingHoldError(response.status === 409
          ? 'Someone else just reserved that time. Availability has been refreshed; please choose another slot.'
          : result?.message || 'Unable to hold this slot. Please try again.');
        return;
      }

      const expiresAt = String(result.data.expiresAt || new Date(Date.now() + bookingHoldSeconds * 1000).toISOString());
      const heldSlots = effectiveBookingSlots.map((slot) => ({ ...slot, status: 'locked' as const, lockedByUserId: currentUser.id, lockedUntil: expiresAt }));
      setServerBookingQuote({
        addonTotal: Number(result.data.addonTotal || 0),
        platformFeeAmount: Number(result.data.platformFeeAmount || 0),
        gatewayFeeAmount: Number(result.data.gatewayFeeAmount || 0),
        totalPayable: Number(result.data.totalPayable || 0),
      });
      setReservedBookingId(String(result.data.id));
      setSelectedBookingSlots(heldSlots);
      setSelectedSlot(heldSlots[0]);
      setBookingDurationHours(heldSlots.length);
      setLockExpiryAt(expiresAt);
      upsertBooking({
        id: String(result.data.id),
        bookingNumber: String(result.data.bookingNumber || ''),
        playerId: currentUser.id,
        customerName: currentUser.name,
        customerPhone: currentUser.phone,
        customerEmail: currentUser.email,
        turfId: firstSelectedSlot.turfId,
        turfName: matchedTurf?.name || '',
        slotId: firstSelectedSlot.id,
        slotIds: heldSlots.map((slot) => slot.id),
        date: String(result.data.date || firstSelectedSlot.date).slice(0, 10),
        startTime: String(result.data.startTime || firstSelectedSlot.startTime).slice(0, 5),
        endTime: String(result.data.endTime || heldSlots[heldSlots.length - 1].endTime).slice(0, 5),
        totalHours: Number(result.data.totalHours || heldSlots.length),
        bookingSource: 'online',
        status: 'pending_payment',
        baseAmount: Number(result.data.baseAmount || 0),
        commissionAmount: 0,
        platformFeeAmount: Number(result.data.platformFeeAmount || 0),
        hasGatewayFee: Number(result.data.gatewayFeeAmount || 0) > 0,
        gatewayFeeAmount: Number(result.data.gatewayFeeAmount || 0),
        totalPaid: Number(result.data.totalPayable || 0),
        netOwnerAmount: 0,
        paymentMethod: selectedGateway?.provider === 'surjopay' ? 'surjopay' : selectedGateway?.provider === 'uddoktapay' ? 'uddoktapay' : 'sslcommerz',
        paymentStatus: 'pending',
        expiresAt,
        qrCode: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setLockTimerSeconds(bookingHoldSeconds);
      await loadAvailability(firstSelectedSlot.turfId, firstSelectedSlot.date);
      setShowCheckoutModal(true);
    } catch (error) {
      setBookingHoldError(error instanceof Error && error.message.startsWith('The booking service returned a web page')
        ? error.message
        : 'Could not reach the booking service. Please refresh and try again.');
    } finally {
      bookingHoldRequestRef.current = false;
      setIsCreatingHold(false);
    }
  };

  const handleProceedToPayment = () => {
    setShowCheckoutModal(false);
    setGatewayError('');
    setGatewaySessionUrl(null);
    if (!selectedGatewayId && activeGateways[0]) {
      setSelectedGatewayId(activeGateways[0].id);
    }
    setShowSSLGateway(true);
  };

  const activeTurfAddons = turfAddons?.filter((addon) => addon.isActive) || [];
  const selectedBookingWindow = selectedBookingSlots;
  const bookingBaseAmount = selectedBookingWindow.reduce((sum, slot) => sum + slot.price, 0);
  const estimatedAddonSubtotal = activeTurfAddons.reduce((sum, addon) => {
    const quantity = selectedAddonQuantities[addon.id] || 0;
    return sum + addon.price * quantity;
  }, 0);
  const addonSubtotal = serverBookingQuote?.addonTotal ?? estimatedAddonSubtotal;
  const checkoutSubtotal = bookingBaseAmount + addonSubtotal;
  const bookingPlatformFeeAmount = selectedTurf?.ownerBillingModel === 'monthly_subscription' || settings.platformFeeEnabled === false
    ? 0 : serverBookingQuote?.platformFeeAmount ?? Math.round(checkoutSubtotal * settings.platformFeeRate / 100);
  const bookingGatewayFeeAmount = settings.gatewayFeeEnabled === false
    ? 0 : serverBookingQuote?.gatewayFeeAmount ?? Math.round(checkoutSubtotal * settings.gatewayFeeRate / 100);
  const totalPayable = serverBookingQuote?.totalPayable ?? checkoutSubtotal + bookingPlatformFeeAmount + bookingGatewayFeeAmount;
  const displayedSlotPrice = (slot: Slot) => calculateDisplayedTurfPrice({
    baseAmount: slot.price,
    platformRate: selectedTurf?.ownerBillingModel === 'monthly_subscription' || settings.platformFeeEnabled === false
      ? 0 : settings.platformFeeRate,
    gatewayRate: settings.gatewayFeeEnabled === false ? 0 : settings.gatewayFeeRate,
    showFeeBreakdown: settings.showFeeBreakdown !== false,
  });
  const displayedSelectedBookingPrice = selectedBookingSlots.reduce((sum, slot) => sum + displayedSlotPrice(slot), 0);

  // Keep the authenticated Turfyslot panel open while the hosted gateway checkout runs separately.
  const handleStartGatewayCheckout = async () => {
    if (!selectedGateway || selectedBookingWindow.length === 0 || !reservedBookingId) {
      setGatewayError('Your slot hold is not active. Select the time again to continue.');
      return;
    }
    const checkoutWindow = window.open('', '_blank');
    if (!checkoutWindow) {
      setGatewayError('Allow pop-up windows to open secure checkout without closing your booking panel.');
      return;
    }
    setGatewayError('');
    setIsProcessingPayment(true);
    try {
      const endpoint = selectedGateway.provider === 'sslcommerz'
        ? '/api/payments/sslcommerz/init'
        : `/api/payments/${selectedGateway.provider}/init`;
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: reservedBookingId }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`The payment service returned a web page instead of JSON (HTTP ${response.status}). Check the API route and try again.`);
      }
      const data = await response.json();
      if (!data.success) {
        checkoutWindow.close();
        setGatewayError(data.message || `Unable to start ${selectedGateway.label} checkout.`);
        setIsProcessingPayment(false);
        return;
      }
      setGatewaySessionUrl(data.gatewayPageURL);
      checkoutWindow.opener = null;
      checkoutWindow.location.assign(data.gatewayPageURL);
    } catch (error) {
      checkoutWindow.close();
      setGatewayError(error instanceof Error && error.message.startsWith('The payment service returned a web page')
        ? error.message
        : 'Could not reach the payment server. Please refresh and try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleVerifyGatewayPayment = async () => {
    if (!reservedBookingId) return;
    setIsCheckingPayment(true);
    setPaymentReturnMessage('');
    try {
      if (selectedGateway && selectedGateway.provider !== 'sslcommerz') {
        const verificationResponse = await apiFetch(`/api/payments/${selectedGateway.provider}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: reservedBookingId }),
        });
        if (!verificationResponse.ok && verificationResponse.status !== 409) {
          const verificationResult = await parseApiResponse(verificationResponse, 'Payment verification service');
          throw new Error(verificationResult?.message || 'Unable to verify this payment yet.');
        }
      }
      const response = await apiFetch(`/api/bookings/${encodeURIComponent(reservedBookingId)}`);
      const result = await parseApiResponse(response, 'Booking service');
      const row = result?.data as Record<string, unknown> | undefined;
      if (!response.ok || !result?.success || !row) throw new Error(result?.message || 'Unable to check this booking yet.');
      if (row.status === 'confirmed') {
        const booking: Booking = {
          id: String(row.id), bookingNumber: String(row.booking_number || ''), playerId: currentUser.id,
          customerName: currentUser.name, customerPhone: currentUser.phone, customerEmail: currentUser.email,
          turfId: String(row.turf_id || ''), turfName: String(row.turf_name || selectedTurf?.name || ''), slotId: '',
          date: String(row.booking_date || '').slice(0, 10), startTime: String(row.start_time || '').slice(0, 5), endTime: String(row.end_time || '').slice(0, 5),
          totalHours: Number(row.total_hours || 1), bookingSource: 'online', status: 'confirmed', baseAmount: Number(row.base_amount || 0),
          commissionAmount: Number(row.commission_amount || 0), platformFeeAmount: Number(row.platform_fee_amount || 0),
          hasGatewayFee: Number(row.gateway_fee_amount || 0) > 0, gatewayFeeAmount: Number(row.gateway_fee_amount || 0),
          totalPaid: Number(row.total_payable || 0), netOwnerAmount: Number(row.net_owner_amount || 0), paymentMethod: selectedGateway?.provider === 'surjopay' ? 'surjopay' : selectedGateway?.provider === 'uddoktapay' ? 'uddoktapay' : 'sslcommerz',
          paymentStatus: String(row.payment_status || 'paid') as Booking['paymentStatus'], paymentReference: String(row.booking_number || ''), qrCode: String(row.booking_number || ''),
          createdAt: String(row.created_at || new Date().toISOString()), updatedAt: String(row.updated_at || new Date().toISOString()),
        };
        setConfirmedBooking(booking);
        upsertBooking(booking);
        setShowSSLGateway(false);
        setReservedBookingId(null);
        setLockExpiryAt(null);
        setSelectedBookingSlots([]);
        setSelectedSlot(null);
      } else if (row.status === 'expired_refund_pending') {
        setPaymentReturnMessage('Payment arrived after the booking hold expired. A refund is pending review.');
      } else {
        setPaymentReturnMessage('Payment is not confirmed yet. Wait a moment and check again. Do not pay again while this booking is still pending.');
      }
    } catch (error) {
      setPaymentReturnMessage(error instanceof Error ? error.message : 'Unable to check payment status right now.');
    } finally { setIsCheckingPayment(false); }
  };

  useEffect(() => {
    if (!lockExpiryAt) {
      setLockTimerSeconds(bookingHoldSeconds);
      return;
    }

    const tick = () => {
      const remainingSeconds = Math.max(0, Math.ceil((new Date(lockExpiryAt).getTime() - Date.now()) / 1000));
      setLockTimerSeconds(remainingSeconds);

      if (remainingSeconds <= 0) {
        if (reservedBookingId) void releaseCurrentHold(reservedBookingId);
        unlockSlots(selectedBookingSlots.map((item) => item.id));
        setReservedBookingId(null);
        setSelectedSlot(null);
        setSelectedBookingSlots([]);
        setBookingDurationHours(1);
        setLockExpiryAt(null);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);

    return () => window.clearInterval(interval);
  }, [bookingHoldSeconds, lockExpiryAt, selectedBookingSlots, unlockSlots]);

  const scrollToTurfs = () => {
    const el = document.getElementById('turf-explorer-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleJoinSquad = async (squadId: string) => {
    const result = await joinOpenMatch(squadId);
    setSquadJoinMessage(result.message);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 selection:bg-[#C8FF5E] selection:text-[#0A1E14] font-sans">
      {paymentReturnMessage && <div role="status" className="mx-auto mt-4 max-w-4xl rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">{paymentReturnMessage}<button className="ml-3 underline" onClick={() => setPaymentReturnMessage('')}>Dismiss</button></div>}
      {/* ========================================================================= */}
      {/* 1. EXPLORE & HOME PAGE: BESPOKE MODERN SPORTS MARKETPLACE DESIGN          */}
      {/* ========================================================================= */}
      {/* 1. EXPLORE & HOME PAGE: HIGH-CONVERSION MODERN ARCHITECTURAL DESIGN      */}
      {/* ========================================================================= */}
      {activeTab === 'explore' && (
        <TurfySlotHome
          filteredTurfs={filteredTurfs}
          slotsByTurf={slotsByTurf}
          selectedTurf={selectedTurf}
          setSelectedTurf={setSelectedTurf}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedSport={selectedSport}
          setSelectedSport={setSelectedSport}
          selectedArea={selectedArea}
          setSelectedArea={setSelectedArea}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          handleSelectSlot={(turf, slot) => {
            setSelectedTurf(turf);
            handleSelectSlot(slot);
          }}
          selectedBookingSlots={selectedBookingSlots}
          onContinueBooking={handleContinueBooking}
          switchRoleDirectly={switchRoleDirectly}
          squadMatches={squadMatches}
          joinedSquadIds={joinedSquadIds}
          handleJoinSquad={handleJoinSquad}
          squadJoinMessage={squadJoinMessage}
          setShowSquadModal={setShowSquadModal}
          setActiveTab={setActiveTab}
        />
      )}

      {/* ========================================================================= */}
      {/* 2. MY BOOKINGS TAB (HISTORIC TICKETS, CANCELLATION, QR PASS, REVIEWS)     */}
      {/* ========================================================================= */}
      {activeTab === 'my_bookings' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Sub Navigation Bar for Player */}
          <div className="flex items-center gap-2 bg-[#0A1E14] border border-white/10 p-1.5 rounded-2xl w-fit flex-wrap">
            <button
              onClick={() => setActiveTab('explore')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Explore All Turfs</span>
            </button>
            <button
              onClick={() => setActiveTab('my_bookings')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>My Bookings & Passes ({myBookings.length})</span>
            </button>
            {settings.featureFlags?.squad_enabled && <button
              onClick={() => setActiveTab('squads')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Squad Finder</span>
            </button>}
            {settings.featureFlags?.tournament_enabled && <button
              onClick={() => setActiveTab('tournaments')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Tournaments</span>
            </button>}
            <button
              onClick={() => setActiveTab('favorites')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Saved Grounds ({favoriteTurfs.length})</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                  Player Dashboard
                </span>
                <span className="text-xs text-white/60">Welcome, {currentUser.name}</span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1">My Booking History & Match Passes</h2>
              <p className="text-xs text-white/60">View upcoming slots, access counter check-in QR codes, or manage cancellations.</p>
            </div>
            <span className="text-xs px-3.5 py-1.5 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-bold border border-[#C8FF5E]/30 w-fit">
              {myBookings.length} total reservations
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleMyBookings.map((b) => {
              const bookingTurf = turfs.find((turf) => turf.id === b.turfId);
              const isBookingMapOpen = bookingMapId === b.id;
              const isPaymentPending = b.status === 'pending_payment';
              const isCompleted = b.status === 'completed';
              const canReviewBooking = isCompleted && b.playerId === currentUser.id && hasMatchEnded(b);
              const isConfirmed = b.status === 'confirmed' || b.status === 'checked_in';
              const isCancelled = b.status === 'cancelled' || b.status === 'refunded';

              return (
                <div
                  key={b.id}
                  className="bg-[#0e271a] border border-white/10 hover:border-[#C8FF5E]/30 transition-all rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xl"
                >
                  {/* Status Ribbon */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <span className="text-[11px] font-mono text-[#C8FF5E] font-bold">{b.bookingNumber}</span>
                      <div className="text-xs text-white/60 font-medium capitalize">Channel: {b.bookingSource.replace('_', ' ')}</div>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        isPaymentPending
                          ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                          : isConfirmed
                          ? 'bg-[#C8FF5E]/15 text-[#C8FF5E] border-[#C8FF5E]/30'
                          : isCompleted
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="my-4 space-y-2">
                    <h4 className="font-bold text-white text-base">{b.turfName}</h4>
                    <div className="flex items-center gap-4 text-xs text-white/80">
                      <span className="flex items-center gap-1 text-white/60">
                        <Calendar className="w-3.5 h-3.5 text-[#C8FF5E]" /> {b.date}
                      </span>
                      <span className="flex items-center gap-1 text-white/60">
                        <Clock className="w-3.5 h-3.5 text-[#C8FF5E]" /> {formatSlotRange(b.startTime, b.endTime)}
                      </span>
                    </div>
                    <div className="text-xs text-white/60 flex items-center justify-between pt-1">
                      <span>{isPaymentPending ? 'Amount due:' : 'Total Paid:'}</span>
                      <span className="font-bold text-[#C8FF5E] text-base">৳{b.totalPaid.toLocaleString()}</span>
                    </div>
                    {isPaymentPending && (
                      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-[11px] text-amber-100">
                        <p className="font-bold">Payment is pending. This slot is temporarily held and is not confirmed yet.</p>
                        {b.expiresAt && <p className="mt-1">The hold expires at {new Date(b.expiresAt).toLocaleTimeString('en-BD', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' }).replace(' ', '')} Bangladesh time.</p>}
                      </div>
                    )}
                    {b.refundAmount && b.refundAmount > 0 && (
                      <div className="text-xs text-emerald-400 font-semibold flex items-center justify-between">
                        <span>Refund Pending Admin Processing:</span>
                        <span>৳{b.refundAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {b.cancellationRequestStatus && (
                      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-[11px] text-amber-100">
                        <p className="font-bold">Cancellation request: {b.cancellationRequestStatus}</p>
                        {b.cancellationRequestReason && <p className="mt-1">Your reason: {b.cancellationRequestReason}</p>}
                        {b.cancellationDecisionReason && <p className="mt-1">Owner response: {b.cancellationDecisionReason}</p>}
                      </div>
                    )}
                    {b.refundAmount && b.refundAmount > 0 && (
                      <p className="text-[11px] text-white/50">
                        {b.bookingSource === 'online'
                          ? 'The admin will process this through SSLCommerz when supported; otherwise it requires manual review. It is not a Turfyslot wallet credit.'
                          : 'The admin will process and record this manual refund.'}
                      </p>
                    )}
                  </div>

                  {isBookingMapOpen && bookingTurf && (
                    <div className="mb-4 rounded-xl border border-white/10 bg-black/15 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs text-white/70">
                        <MapPin className="h-3.5 w-3.5 text-[#C8FF5E]" /> {bookingTurf.address}, {bookingTurf.area}, {bookingTurf.city}
                      </p>
                      <TurfMap latitude={bookingTurf.latitude} longitude={bookingTurf.longitude} className="h-52" />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {!isPaymentPending && <button
                        onClick={() => setSelectedBookingForQR(b)}
                        className="px-3.5 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Show QR Pass</span>
                      </button>}

                      {bookingTurf && (
                        <button
                          type="button"
                          onClick={() => setBookingMapId((current) => current === b.id ? null : b.id)}
                          className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-[#C8FF5E] border border-[#C8FF5E]/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{isBookingMapOpen ? 'Hide Map' : 'Map'}</span>
                        </button>
                      )}

                      {settings.featureFlags?.squad_enabled && isConfirmed && b.cancellationRequestStatus !== 'pending' && (
                        <button
                          onClick={() => setActiveTab('squads')}
                          className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.14] text-[#C8FF5E] border border-[#C8FF5E]/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Recruit players for this match via Squad Finder"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Host Open Match</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isConfirmed && (
                        <button
                          onClick={async () => {
                            await refreshTurfs();
                            setBookingToCancel(b);
                            setCancelError('');
                          }}
                          className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      {canReviewBooking && (
                        <button
                          onClick={() => { setBookingForReview(b); setReviewRating(5); setReviewComment(''); setReviewError(''); }}
                          className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>Rate this turf</span>
                        </button>
                      )}
                      {isCompleted && b.playerId === currentUser.id && !canReviewBooking && <span className="text-[11px] text-white/45">Rating opens after your match ends.</span>}

                      {!isPaymentPending && <button
                        onClick={() => setDisputeBooking(b)}
                        className="p-1.5 text-white/50 hover:text-white rounded-lg"
                        title="Need help or file dispute"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>}
                    </div>
                  </div>
                </div>
              );
            })}

            {myBookings.length === 0 && (
              <div className="col-span-full text-center py-16 bg-[#0b121e] border border-slate-800 rounded-2xl">
                <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white">No Bookings Yet</h3>
                <p className="text-xs text-slate-400 mt-1">There are no active or completed bookings to show. Explore turfs to book a slot.</p>
                <button
                  onClick={() => setActiveTab('explore')}
                  className="mt-4 px-5 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Explore Turfs Now
                </button>
              </div>
            )}
          </div>
          {myBookings.length > 0 && (
            <nav aria-label="Booking history pages" className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-[#C8FF5E]/20 bg-[#0A1E14] px-4 py-3">
              <span className="text-xs text-white/65">
                Showing {(currentBookingHistoryPage - 1) * BOOKING_HISTORY_PAGE_SIZE + 1}–{Math.min(currentBookingHistoryPage * BOOKING_HISTORY_PAGE_SIZE, myBookings.length)} of {myBookings.length} bookings
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBookingHistoryPage(currentBookingHistoryPage - 1)}
                  disabled={currentBookingHistoryPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#C8FF5E]/30 bg-[#0e271a] px-3 py-2 text-xs font-semibold text-[#C8FF5E] enabled:hover:bg-[#C8FF5E]/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                  aria-label="Previous booking history page"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <span className="text-xs font-semibold text-[#C8FF5E]">Page {currentBookingHistoryPage} of {bookingHistoryPageCount}</span>
                <button
                  type="button"
                  onClick={() => setBookingHistoryPage(currentBookingHistoryPage + 1)}
                  disabled={currentBookingHistoryPage >= bookingHistoryPageCount}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#C8FF5E]/30 bg-[#0e271a] px-3 py-2 text-xs font-semibold text-[#C8FF5E] enabled:hover:bg-[#C8FF5E]/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                  aria-label="Next booking history page"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FAVORITES TAB                                                         */}
      {/* ========================================================================= */}
      {activeTab === 'favorites' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Sub Navigation Bar for Player */}
          <div className="flex items-center gap-2 bg-[#0A1E14] border border-white/10 p-1.5 rounded-2xl w-fit flex-wrap">
            <button
              onClick={() => setActiveTab('explore')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Explore All Turfs</span>
            </button>
            <button
              onClick={() => setActiveTab('my_bookings')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>My Bookings & Passes ({myBookings.length})</span>
            </button>
            {settings.featureFlags?.squad_enabled && <button
              onClick={() => setActiveTab('squads')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Squad Finder</span>
            </button>}
            {settings.featureFlags?.tournament_enabled && <button
              onClick={() => setActiveTab('tournaments')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Tournaments</span>
            </button>}
            <button
              onClick={() => setActiveTab('favorites')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Saved Grounds ({favoriteTurfs.length})</span>
            </button>
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h2 className="text-2xl font-black text-white">Saved Favorite Grounds</h2>
              <p className="text-xs text-white/60">Quick access to your preferred sports venues.</p>
            </div>
            <span className="text-xs px-3.5 py-1.5 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-bold border border-[#C8FF5E]/30">
              {favoriteTurfs.length} saved
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteTurfs.map((turf) => (
                <div key={turf.id} className="bg-[#0e271a] border border-white/10 hover:border-[#C8FF5E]/30 transition-all rounded-2xl p-5 flex flex-col justify-between shadow-xl">
                  <div>
                    <h3 className="font-bold text-white text-base">{turf.name}</h3>
                    <p className="text-xs text-white/60 mt-1">{turf.address}</p>
                    <div className="text-xs font-bold text-[#C8FF5E] mt-3">
                      Base ৳{turf.basePricePerHour.toLocaleString()} / hr
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                    <button
                      onClick={() => toggleFavorite(turf.id)}
                      className="text-xs text-rose-400 hover:underline cursor-pointer"
                    >
                      Remove Favorite
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTurf(turf);
                        setActiveTab('explore');
                      }}
                      className="px-4 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              ))}

            {favoriteTurfs.length === 0 && (
              <div className="col-span-full text-center py-16 bg-[#0A1E14] border border-white/10 rounded-3xl p-8">
                <Heart className="w-12 h-12 text-[#C8FF5E]/40 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">No Saved Favorites</h3>
                <p className="text-xs text-white/60 mt-1">Tap the heart icon on any turf card to save it for later.</p>
                <button
                  onClick={() => setActiveTab('explore')}
                  className="mt-4 px-6 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-full cursor-pointer"
                >
                  Explore Turfs
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SQUAD FINDER (SECTION 49: OPEN MATCHES & TEAM MATCHMAKING)             */}
      {/* ========================================================================= */}
      {activeTab === 'squads' && settings.featureFlags?.squad_enabled && (
        !isAuthenticated ? (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-8 sm:p-12 text-center shadow-2xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-72 bg-[#C8FF5E]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 rounded-2xl bg-[#C8FF5E]/15 border border-[#C8FF5E]/30 flex items-center justify-center mx-auto text-[#C8FF5E] shadow-lg shadow-[#C8FF5E]/10">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] text-xs font-bold border border-[#C8FF5E]/30">
                  <Users className="w-3.5 h-3.5" />
                  <span>Squad Matchmaking</span>
                </div>
                <h2 className="font-playfair text-2xl sm:text-3xl font-extrabold text-white">
                  Login Required to View Squads
                </h2>
                <p className="text-sm text-white/70 max-w-lg mx-auto leading-relaxed">
                  স্কোয়াড ফাইন্ডার এবং ওপেন ম্যাচ দেখতে অনুগ্রহ করে আপনার প্লেয়ার অ্যাকাউন্টে লগইন করুন। লগইন করার পর আপনি সরাসরি ওপেন ম্যাচে অংশ নিতে পারবেন এবং দলের সাথে যোগাযোগ করতে পারবেন।
                </p>
                <p className="text-xs text-white/50 max-w-md mx-auto">
                  Only registered and logged-in players can access open match rosters, view match details, and join team matchmaking.
                </p>
              </div>

              {/* Benefits list */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left max-w-xl mx-auto">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Join Open Matches</span>
                  </div>
                  <p className="text-[11px] text-white/60">Hop into unfilled casual or competitive slots anytime.</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Host Your Squad</span>
                  </div>
                  <p className="text-[11px] text-white/60">Recruit extra players for your confirmed turf bookings.</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Connect &amp; Play</span>
                  </div>
                  <p className="text-[11px] text-white/60">Direct phone contact with captains. Split costs in person.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openSignInModal('player')}
                  className="w-full sm:w-auto px-6 py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black text-xs sm:text-sm rounded-full transition-all shadow-lg shadow-[#C8FF5E]/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login / Sign In to Continue</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGetStartedModal('player')}
                  className="w-full sm:w-auto px-6 py-3 bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs sm:text-sm rounded-full transition-all border border-white/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-[#C8FF5E]" />
                  <span>Create Free Player Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  className="w-full sm:w-auto px-5 py-3 text-white/60 hover:text-white text-xs font-semibold rounded-full transition-all cursor-pointer"
                >
                  Back to Explore Turfs
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Sub Navigation Bar for Player */}
            <div className="flex items-center gap-2 bg-[#0A1E14] border border-white/10 p-1.5 rounded-2xl w-fit flex-wrap">
              <button
                onClick={() => setActiveTab('explore')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Explore All Turfs</span>
              </button>
              <button
                onClick={() => setActiveTab('my_bookings')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>My Bookings & Passes ({myBookings.length})</span>
              </button>
              {settings.featureFlags?.squad_enabled && <button
                onClick={() => setActiveTab('squads')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Squad Finder</span>
              </button>}
              {settings.featureFlags?.tournament_enabled && <button
                onClick={() => setActiveTab('tournaments')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Tournaments</span>
              </button>}
              <button
                onClick={() => setActiveTab('favorites')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Heart className="w-3.5 h-3.5" />
                <span>Saved Grounds ({favoriteTurfs.length})</span>
              </button>
            </div>

            <SquadsView onBackToExplore={() => setActiveTab('explore')} />
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* 5. TOURNAMENTS & BRACKETS (SECTION 50: CUPS & LEAGUE PLAY)               */}
      {/* ========================================================================= */}
      {activeTab === 'tournaments' && settings.featureFlags?.tournament_enabled && (
        !isAuthenticated ? (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-8 sm:p-12 text-center shadow-2xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-72 bg-[#C8FF5E]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 rounded-2xl bg-[#C8FF5E]/15 border border-[#C8FF5E]/30 flex items-center justify-center mx-auto text-[#C8FF5E] shadow-lg shadow-[#C8FF5E]/10">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] text-xs font-bold border border-[#C8FF5E]/30">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Tournaments &amp; Brackets</span>
                </div>
                <h2 className="font-playfair text-2xl sm:text-3xl font-extrabold text-white">
                  Login Required to View Tournaments
                </h2>
                <p className="text-sm text-white/70 max-w-lg mx-auto leading-relaxed">
                  টুর্নামেন্ট ফিক্সচার, ব্র্যাকেট এবং টিম রেজিস্ট্রেশন দেখতে অনুগ্রহ করে আপনার প্লেয়ার অ্যাকাউন্টে লগইন করুন। লগইন করার পর আপনি টুর্নামেন্টের সমস্ত তথ্য দেখতে পারবেন এবং টিম এন্ট্রি করতে পারবেন।
                </p>
                <p className="text-xs text-white/50 max-w-md mx-auto">
                  Only registered and logged-in players can explore tournament prize pools, inspect knockout brackets, and register competitive teams.
                </p>
              </div>

              {/* Benefits list */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left max-w-xl mx-auto">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Track Live Brackets</span>
                  </div>
                  <p className="text-[11px] text-white/60">Follow knockout rounds, quarters, semis &amp; finals in real time.</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Register Your Squad</span>
                  </div>
                  <p className="text-[11px] text-white/60">Enter your team into official weekend cups and leagues.</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <div className="text-[#C8FF5E] font-bold text-xs flex items-center gap-1.5 mb-1">
                    <CircleCheck className="w-3.5 h-3.5" />
                    <span>Verified Grounds</span>
                  </div>
                  <p className="text-[11px] text-white/60">Organized exclusively at verified, premium partner grounds.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openSignInModal('player')}
                  className="w-full sm:w-auto px-6 py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black text-xs sm:text-sm rounded-full transition-all shadow-lg shadow-[#C8FF5E]/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login / Sign In to Continue</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGetStartedModal('player')}
                  className="w-full sm:w-auto px-6 py-3 bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs sm:text-sm rounded-full transition-all border border-white/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-[#C8FF5E]" />
                  <span>Create Free Player Account</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  className="w-full sm:w-auto px-5 py-3 text-white/60 hover:text-white text-xs font-semibold rounded-full transition-all cursor-pointer"
                >
                  Back to Explore Turfs
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Sub Navigation Bar for Player */}
            <div className="flex items-center gap-2 bg-[#0A1E14] border border-white/10 p-1.5 rounded-2xl w-fit flex-wrap">
              <button
                onClick={() => setActiveTab('explore')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Explore All Turfs</span>
              </button>
              <button
                onClick={() => setActiveTab('my_bookings')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>My Bookings & Passes ({myBookings.length})</span>
              </button>
              {settings.featureFlags?.squad_enabled && <button
                onClick={() => setActiveTab('squads')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Squad Finder</span>
              </button>}
              {settings.featureFlags?.tournament_enabled && <button
                onClick={() => setActiveTab('tournaments')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Tournaments</span>
              </button>}
              <button
                onClick={() => setActiveTab('favorites')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex items-center gap-2"
              >
                <Heart className="w-3.5 h-3.5" />
                <span>Saved Grounds ({favoriteTurfs.length})</span>
              </button>
            </div>

            <TournamentsView onBackToExplore={() => setActiveTab('explore')} />
          </div>
        )
      )}

      {/* ========================================================================= */}
      {/* SQUAD FINDER / COMMUNITY MATCHMAKER MODAL                                 */}
      {/* ========================================================================= */}
      {showSquadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b121e] border border-emerald-500/40 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Complete Your Team • Open Matches</h3>
                  <p className="text-xs text-slate-400">Join players needing squad members for matches in Dhaka</p>
                </div>
              </div>
              <button onClick={() => setShowSquadModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
              {squadJoinMessage && <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">{squadJoinMessage}</p>}
              {squadMatches.map((m) => {
                const isJoined = joinedSquadIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-emerald-400">{m.sport}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                          {m.area}
                        </span>
                        <span className="text-[10px] text-slate-400">{m.skillLevel}</span>
                      </div>
                      <h4 className="font-bold text-white text-sm">{m.turfName}</h4>
                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        <span>📅 {m.date}</span>
                        <span>⏰ {m.time}</span>
                        <span>👤 Captain: {m.hostName}</span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                      <span className="text-[11px] font-bold text-amber-400">
                        Needs {m.playersNeeded} player{m.playersNeeded > 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => handleJoinSquad(m.id)}
                        disabled={isJoined || m.playersNeeded === 0}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isJoined
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                        }`}
                      >
                        {isJoined ? 'Joined Squad ✓' : 'Join Match'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Looking to host your own match? Book any turf slot and post an open challenge for free!</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: TURF DETAIL & SLOT PICKER                                        */}
      {/* ========================================================================= */}
      {selectedTurf && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-[#0b121e] border border-slate-800 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl my-8 max-h-[calc(100vh-2rem)] flex flex-col min-h-0">
            {/* Header with image */}
            <div className="relative h-56 bg-slate-900">
              <img
                src={selectedTurf.photos[0] || 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85'}
                alt={selectedTurf.name}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85';
                }}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => {
                  resetLockedSelection();
                  setSelectedTurf(null);
                }}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-950/70 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-4 bg-slate-950/85 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-800">
                <h3 className="text-lg font-black text-white">{selectedTurf.name}</h3>
                <p className="text-xs text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" /> {selectedTurf.address}
                </p>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Description & Amenities */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">About Turf</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedTurf.description}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedTurf.amenities.map((a) => (
                    <span
                      key={a}
                      className="px-2.5 py-1 rounded-md bg-slate-900 text-[11px] text-slate-300 border border-slate-800 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-400" /> {a}
                    </span>
                  ))}
                </div>
              </div>

              {/* Date Selector */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Select Date
                  </h4>
                  <ClickableDatePicker value={selectedDate} onChange={setSelectedDate} min={getBDDateString()} className="max-w-[175px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200" />
                </div>
                <div className="flex w-full min-w-0 items-center gap-2">
                  <button type="button" aria-label="Scroll to earlier dates" onClick={() => dateScrollerRef.current?.scrollBy({ left: -280, behavior: 'smooth' })} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-400 shadow-sm backdrop-blur transition-all hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-300 active:scale-95">
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                  <div ref={dateScrollerRef} className="flex min-w-0 flex-1 snap-x snap-mandatory touch-pan-x gap-2 overflow-x-auto overscroll-x-contain no-scrollbar pb-1">
                    {dateOptions.map(({ dateStr, label }) => (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`min-w-[138px] shrink-0 snap-start p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedDate === dateStr
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="text-xs">{label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{dateStr}</div>
                      </button>
                    ))}
                  </div>
                  <button type="button" aria-label="Scroll to later dates" onClick={() => dateScrollerRef.current?.scrollBy({ left: 280, behavior: 'smooth' })} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-slate-400 shadow-sm backdrop-blur transition-all hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-300 active:scale-95">
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Rates can be higher or lower depending on the date and shift. Each slot shows the price for the date you selected.</p>
              </div>

              {/* Slots Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" /> Available Time Slots
                  </h4>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span> Booked
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Blocked
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {turfSlotsForSelectedDate.map((slot) => {
                    const isExpired = isSlotExpired(slot);
                    const isAvailable = slot.status === 'available' && !isExpired;
                    const isLocked = slot.status === 'locked';
                    const isOwnedLockedSlot = isLocked && slot.lockedByUserId === currentUser.id;
                    const isSelected = selectedBookingSlots.some((selected) => selected.id === slot.id);
                    const isBooked = slot.status === 'booked';
                    const isBlocked = slot.status === 'blocked';
                    const isClickable = !isExpired && (isAvailable || isOwnedLockedSlot);

                    return (
                      <button
                        key={slot.id}
                        disabled={!isClickable}
                        onClick={() => handleSelectSlot(slot)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isExpired
                            ? 'bg-slate-900/30 border-slate-900 text-slate-500 cursor-not-allowed line-through'
                          : isSelected
                          ? 'bg-emerald-900/50 border-emerald-400 text-white ring-1 ring-emerald-400/40 cursor-pointer'
                          : isAvailable
                          ? 'bg-slate-900 border-slate-700 hover:border-emerald-500 hover:bg-emerald-950/20 text-white cursor-pointer'
                          : isOwnedLockedSlot
                          ? 'bg-amber-950/20 border-amber-800/40 text-amber-300 opacity-90 cursor-pointer'
                            : isLocked
                            ? 'bg-amber-950/20 border-amber-800/40 text-amber-300 opacity-80 cursor-not-allowed'
                            : isBlocked
                            ? 'bg-rose-950/20 border-rose-900/40 text-rose-400 opacity-60 cursor-not-allowed'
                            : 'bg-slate-900/30 border-slate-900 text-slate-500 cursor-not-allowed line-through'
                        }`}
                      >
                        <div className="text-xs font-bold">
                          {formatSlotRange(slot.startTime, slot.endTime)}
                        </div>
                        <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                          ৳{displayedSlotPrice(slot).toLocaleString()}
                        </div>
                        {slot.pricingLabel && <div className="text-[9px] font-semibold text-slate-400 mt-0.5">{slot.pricingLabel}</div>}
                        <div className="text-[9px] uppercase tracking-wider font-bold mt-1">
                          {isExpired ? 'Time passed' : isSelected ? 'Selected' : isAvailable ? 'Select' : isOwnedLockedSlot ? 'Click to Unlock' : slot.status}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {bookingHoldError && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{bookingHoldError}</p>}
                {turfSlotsForSelectedDate.length === 0 && (
                  <p className="text-xs text-slate-400 py-6 text-center bg-slate-900 rounded-xl">
                    No slots configured for this date yet. Check back or select another day.
                  </p>
                )}
              </div>

              {selectedBookingSlots.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-[0_12px_30px_rgba(16,185,129,0.12)]">
                  {bookingHoldError && <p role="alert" className="mb-3 rounded-lg border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{bookingHoldError}</p>}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300/80">Selected Booking</div>
                        <div className="mt-1 text-sm font-bold text-white">
                          {formatSlotRange(selectedBookingSlots[0].startTime, selectedBookingSlots[selectedBookingSlots.length - 1].endTime)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-300">
                          {selectedBookingSlots.length} hour{selectedBookingSlots.length > 1 ? 's' : ''}
                        </span>
                        <span className="rounded-full bg-slate-900 px-2 py-1 text-white">
                          ৳{displayedSelectedBookingPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isCreatingHold}
                      onClick={() => void handleContinueBooking()}
                      className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-950 shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isCreatingHold ? 'Reserving…' : reservedBookingId ? 'Continue to checkout' : 'Continue'}
                    </button>
                  </div>
                  {settings.featureFlags?.addons_enabled && (addonLoadError ? (
                    <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{addonLoadError}</p>
                  ) : activeTurfAddons.length > 0 ? (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                      <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-slate-300">Optional Add-ons</div>
                      {activeTurfAddons.map((addon) => {
                        const quantity = selectedAddonQuantities[addon.id] || 0;
                        const maxQuantity = addon.stockQuantity ?? 99;
                        const outOfStock = maxQuantity <= 0;
                        return (
                          <div key={addon.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white">{addon.name} <span className="text-emerald-300">৳{addon.price.toLocaleString()}</span></div>
                              {addon.description && <div className="mt-1 text-[11px] text-slate-400">{addon.description}</div>}
                              <div className="mt-1 text-[10px] text-slate-400">{outOfStock ? 'Out of stock' : addon.stockQuantity == null ? 'Unlimited stock' : `${maxQuantity} available`}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" aria-label={`Remove one ${addon.name}`} disabled={!quantity || outOfStock}
                                onClick={() => setSelectedAddonQuantities((previous) => ({ ...previous, [addon.id]: Math.max(0, (previous[addon.id] || 0) - 1) }))}
                                className="h-7 w-7 rounded-md bg-white/10 text-white disabled:opacity-40">−</button>
                              <span className="w-5 text-center text-xs font-bold text-white">{quantity}</span>
                              <button type="button" aria-label={`Add one ${addon.name}`} disabled={outOfStock || quantity >= maxQuantity}
                                onClick={() => setSelectedAddonQuantities((previous) => ({ ...previous, [addon.id]: Math.min((previous[addon.id] || 0) + 1, maxQuantity) }))}
                                className="h-7 w-7 rounded-md bg-emerald-500 text-slate-950 disabled:opacity-40">+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null)}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PAYMENT HOLD & TRANSPARENT PRICING CHECKOUT                      */}
      {/* ========================================================================= */}
      {showCheckoutModal && selectedSlot && selectedTurf && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[560px] max-h-[90vh] rounded-[24px] border border-white/10 bg-[#0d1512] shadow-[0_25px_80px_rgba(0,0,0,0.6)] overflow-hidden">
            <div className="relative z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#0d1512]/95 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Clock className="h-4 w-4" />
                </div>

                <div>
                  <h3 className="text-[18px] font-bold tracking-[-0.3px] text-white">Slot Held for You ({settings.bookingHoldMinutes ?? 10} Min)</h3>
                  <p className="mt-1 text-[12px] text-slate-300">
                    Lock expires in <span className="font-semibold text-emerald-400">{formatLockTimer(lockTimerSeconds)}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  void releaseCurrentHold();
                  unlockSlots(selectedBookingSlots.map((slot) => slot.id));
                  setSelectedBookingSlots([]);
                  setSelectedSlot(null);
                  setBookingDurationHours(1);
                  setShowCheckoutModal(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="modal-scroll relative z-0 flex max-h-[calc(90vh-156px)] min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden p-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2 text-[15px] font-bold text-white">
                  <span className="text-emerald-400">
                    <Building2 className="h-4 w-4" />
                  </span>
                  {selectedTurf.name}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Date:</span>
                    <span className="font-semibold text-emerald-400">{formatBDDate(selectedSlot.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Time:</span>
                    <span className="font-semibold text-emerald-400">
                      {formatSlotRange(selectedBookingWindow[0]?.startTime ?? selectedSlot.startTime, selectedBookingWindow[selectedBookingWindow.length - 1]?.endTime ?? selectedSlot.endTime)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#101b18] p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-slate-400">Booking Duration</div>
                    <div className="mt-1 text-[12px] text-slate-300">
                      {selectedBookingWindow.length} hour{selectedBookingWindow.length > 1 ? 's' : ''} selected
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0b1412] p-1">
                    {Array.from({ length: Math.max(1, selectedBookingSlots.length) }, (_, index) => index + 1).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setBookingDurationHours(option)}
                        className={`flex h-8 min-w-[52px] items-center justify-center rounded-lg px-2 text-[11px] font-extrabold tracking-[0.2px] transition-all ${
                          bookingDurationHours === option
                            ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-[0_4px_16px_rgba(200,255,94,0.32)]'
                            : 'bg-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white'
                        }`}
                      >
                        {option}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {settings.showFeeBreakdown !== false ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-slate-400">Transparent Fee Breakdown</div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                    <div className="space-y-2 text-[12px] text-slate-300">
                      <div className="flex items-center justify-between"><span>Turf Rental (Set by Owner)</span><span className="font-semibold text-white">৳{bookingBaseAmount.toLocaleString()}</span></div>
                      {addonSubtotal > 0 && <div className="flex items-center justify-between"><span>Add-ons</span><span className="font-semibold text-white">৳{addonSubtotal.toLocaleString()}</span></div>}
                      {bookingPlatformFeeAmount > 0 && <div className="flex items-center justify-between"><span>Platform Fee ({settings.platformFeeRate}%)</span><span className="font-semibold text-white">৳{bookingPlatformFeeAmount.toLocaleString()}</span></div>}
                      {bookingGatewayFeeAmount > 0 && <div className="flex items-center justify-between"><span>Payment Gateway Fee ({settings.gatewayFeeRate}%)</span><span className="font-semibold text-white">৳{bookingGatewayFeeAmount.toLocaleString()}</span></div>}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <span className="text-xs font-bold uppercase text-emerald-400">Total Payable Amount</span>
                <span className="text-xl font-extrabold text-emerald-400">৳{totalPayable.toLocaleString()}</span>
              </div>

              {bookingGatewayFeeAmount > 0 && <div className="flex items-start gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 text-[11px] text-slate-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>Payment processing fees are non-refundable upon cancellation. Any turf refund follows the platform cancellation policy.</p>
              </div>}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-[#0a0f0d] px-5 pb-[14px] pt-3">
              <div className="grid grid-cols-[1fr_1.5fr] gap-2.5">
                <button
                  onClick={() => {
                    void releaseCurrentHold();
                    unlockSlots(selectedBookingSlots.map((slot) => slot.id));
                    setSelectedBookingSlots([]);
                    setSelectedSlot(null);
                    setBookingDurationHours(1);
                    setShowCheckoutModal(false);
                  }}
                  className="h-[40px] rounded-[20px] border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold leading-none text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Unlock Slots
                </button>

                <button
                  onClick={handleProceedToPayment}
                  className="flex h-[40px] items-center justify-center gap-1.5 rounded-[20px] bg-gradient-to-r from-emerald-500 to-[#00b368] px-3 text-[11px] font-extrabold leading-none text-slate-950 shadow-[0_4px_16px_rgba(0,217,126,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,217,126,0.45)]"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Pay securely</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PAYMENT GATEWAY CHECKOUT */}
      {/* ========================================================================= */}
      {showSSLGateway && selectedSlot && selectedTurf && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border-2 border-emerald-500/40 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-white">
                  {selectedGateway?.provider === 'sslcommerz' ? 'Secure payment' : selectedGateway ? selectedGateway.label : 'Checkout'}
                </span>
                {selectedGateway && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      selectedGateway.isSandbox ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {selectedGateway.isSandbox ? 'Sandbox' : 'Live'}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setShowSSLGateway(false);
                  setGatewaySessionUrl(null);
                  setGatewayError('');
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="text-xs text-slate-400">Merchant: Turfyslot Platform</div>
              <div className="text-xl font-black text-emerald-400 mt-1">৳{totalPayable.toLocaleString()} BDT</div>
            </div>

            {activeGateways.length === 0 ? (
              <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/30 text-xs text-amber-200 space-y-2">
                <p>{gatewayOptionsLoading ? 'Checking available payment methods...' : 'Online payment is not available yet. The administrator must configure and enable a payment provider in Admin > Settings > Payment Gateways.'}</p>
                {!gatewayOptionsLoading && <button
                  type="button"
                  onClick={async () => {
                    setGatewayOptionsLoading(true);
                    try {
                      const response = await apiFetch('/api/payments/gateways');
                      const result = await response.json();
                      if (!response.ok || !result?.success || !Array.isArray(result.data)) throw new Error('Payment methods could not be loaded.');
                      setAvailableGateways(result.data);
                      setGatewayError('');
                    } catch { setGatewayError('Could not refresh payment methods. Please try again.'); }
                    finally { setGatewayOptionsLoading(false); }
                  }}
                  className="rounded-lg border border-amber-300/40 px-3 py-1.5 font-bold text-amber-100 hover:bg-amber-300/10"
                >Refresh payment methods</button>}
                {gatewayError && <p role="alert" className="text-rose-300">{gatewayError}</p>}
              </div>
            ) : (
              <>
                {/* Payment Gateway Selector (sourced from admin-configured gateways) */}
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-2 block">Select Payment Gateway:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {activeGateways.map((gateway) => (
                      <button
                        key={gateway.id}
                        type="button"
                        onClick={() => {
                          setSelectedGatewayId(gateway.id);
                          setGatewaySessionUrl(null);
                          setGatewayError('');
                        }}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedGateway?.id === gateway.id
                            ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-black text-sm">{gateway.label}</div>
                        <div className="text-[9px] opacity-80">{gateway.isSandbox ? 'Sandbox' : 'Live'}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl text-[11px] text-slate-400 space-y-1 border border-slate-800">
                  <div>Payer: {currentUser.name}</div>
                  <div>Phone: {currentUser.phone}</div>
                  {selectedGateway && <div className="text-emerald-400 font-medium">{selectedGateway.provider === 'sslcommerz' ? 'Secure online checkout' : `Secure ${selectedGateway.label} checkout`}{selectedGateway.isSandbox ? ' (sandbox)' : ''}</div>}
                </div>

                {gatewayError && (
                  <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-300">{gatewayError}</div>
                )}
                {paymentReturnMessage && <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/30 text-xs text-amber-200">{paymentReturnMessage}</div>}

                {selectedGateway && gatewaySessionUrl ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-300">
                      Complete your secure payment. Turfyslot confirms the booking only after the server validates the payment.
                    </div>
                    <button
                      onClick={() => void handleVerifyGatewayPayment()}
                      disabled={isCheckingPayment}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isCheckingPayment ? 'Checking payment…' : 'I’ve Completed Payment — Check Status'}</span>
                    </button>
                    <button
                      onClick={() => window.open(gatewaySessionUrl, '_blank', 'noopener,noreferrer')}
                      className="w-full py-2 text-emerald-400 hover:text-emerald-300 text-xs font-semibold cursor-pointer"
                    >
                      Reopen checkout tab
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={isProcessingPayment || !selectedGateway}
                    onClick={handleStartGatewayCheckout}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessingPayment ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Connecting to Gateway...</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>
                          {selectedGateway ? 'Continue to secure payment' : 'Online payment unavailable'}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: BOOKING CONFIRMED SUCCESS & QR CODE                              */}
      {/* ========================================================================= */}
      {confirmedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-emerald-500/50 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-white">Booking Confirmed!</h3>
            <p className="text-xs text-slate-300">
              Your slot at <span className="text-emerald-400 font-bold">{confirmedBooking.turfName}</span> has been confirmed.
            </p>

            <div className="bg-slate-900 p-4 rounded-xl text-left text-xs space-y-1.5 border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Booking Ref:</span>
                <span className="font-mono font-bold text-white">{confirmedBooking.bookingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date & Time:</span>
                <span className="font-semibold text-white">
                  {confirmedBooking.date} ({formatSlotRange(confirmedBooking.startTime, confirmedBooking.endTime)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid Amount:</span>
                <span className="font-bold text-emerald-400">৳{confirmedBooking.totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment reference:</span>
                <span className="font-mono text-slate-300">{confirmedBooking.paymentReference}</span>
              </div>
            </div>

            {/* Digital QR Pass simulation */}
            <div className="p-4 bg-white rounded-xl max-w-[180px] mx-auto flex flex-col items-center shadow-lg">
              <QRCodeSVG value={confirmedBooking.bookingNumber} size={112} level="M" includeMargin />
              <span className="text-[10px] font-mono text-slate-800 font-bold mt-1">
                {confirmedBooking.bookingNumber}
              </span>
            </div>

            <button
              onClick={() => {
                setConfirmedBooking(null);
                setSelectedTurf(null);
                setActiveTab('my_bookings');
              }}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl cursor-pointer"
            >
              View in My Bookings
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CANCEL BOOKING WITH POLICY PREVIEW                                */}
      {/* ========================================================================= */}
      {bookingToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400" /> Cancel Booking
            </h3>

            {(() => {
              const refundCalc = calculateRefund(bookingToCancel, false);
              return (
                <div className="space-y-3">
                  <div className="bg-slate-900 p-3.5 rounded-xl text-xs space-y-1.5 border border-slate-800">
                    <div className="flex justify-between text-slate-300">
                      <span>Booking:</span>
                      <span className="font-mono font-bold text-white">{bookingToCancel.bookingNumber}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Turf Base Price:</span>
                      <span>৳{bookingToCancel.baseAmount}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Policy refund if approved:</span>
                    <span className="font-bold text-emerald-400">{refundCalc.refundPercentage}%</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Non-refundable Gateway Fee:</span>
                      <span className="text-slate-400">৳{refundCalc.gatewayFeeDeducted}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm">
                      <span className="text-white">Estimated refund if approved:</span>
                      <span className="text-emerald-400">৳{refundCalc.playerRefund}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-amber-200/80">This request is sent to the turf owner even when the policy estimate is 0%. The owner reviews the request and your reason; your booking stays active until a decision. The owner has 24 hours to respond. If unanswered, it is automatically approved using the policy amount shown above.</p>

                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Reason for Cancellation:</label>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Explain why you are requesting a refund..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      rows={3}
                    />
                  </div>

                  {cancelError && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-300">
                      {cancelError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setBookingToCancel(null);
                        setCancelError('');
                      }}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl cursor-pointer"
                    >
                      Keep Booking
                    </button>
                    <button
                      onClick={async () => {
                        if (!cancelReason.trim()) {
                          setCancelError('Please explain why you are requesting cancellation.');
                          return;
                        }
                        const result = await cancelBooking(bookingToCancel.id, cancelReason.trim());
                        if (!result.success) {
                          setCancelError(result.message);
                          return;
                        }
                        setBookingToCancel(null);
                        setCancelReason('');
                        setCancelError('');
                      }}
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer"
                    >
                      Request Cancellation Review
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: QR CODE DIGITAL PASS                                             */}
      {/* ========================================================================= */}
      {selectedBookingForQR && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-slate-800 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Ground Check-In Pass</span>
              <button onClick={() => setSelectedBookingForQR(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl max-w-[200px] mx-auto shadow-inner">
              <QRCodeSVG value={selectedBookingForQR.bookingNumber} size={144} level="M" includeMargin />
              <div className="text-[11px] font-mono text-slate-900 font-black mt-2">
                {selectedBookingForQR.bookingNumber}
              </div>
            </div>

            <div className="text-left bg-slate-900 p-3.5 rounded-xl text-xs space-y-1 border border-slate-800">
              <div className="font-bold text-white text-sm">{selectedBookingForQR.turfName}</div>
              <div className="text-slate-300">
                Date: {selectedBookingForQR.date} ({formatSlotRange(selectedBookingForQR.startTime, selectedBookingForQR.endTime)})
              </div>
              <div className="text-slate-400">Player: {selectedBookingForQR.customerName}</div>
              <div className="text-slate-400">Phone: {selectedBookingForQR.customerPhone}</div>
            </div>

            <p className="text-[11px] text-slate-400">
              Present this code at the turf counter on arrival. Staff will scan it to check you in.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: LEAVE REVIEW                                                     */}
      {/* ========================================================================= */}
      {bookingForReview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" /> Rate & Review Turf
            </h3>
            <p className="text-xs text-slate-300">
              How was your match at <span className="font-semibold text-white">{bookingForReview.turfName}</span>?
            </p>

            <div role="radiogroup" aria-label="Rate this turf from one to five stars" className="flex flex-col items-center justify-center gap-2 py-3">
              <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={reviewRating === star}
                  aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                  onClick={() => setReviewRating(star)}
                  className="p-1 text-slate-500 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <Star
                    className={`w-8 h-8 ${
                      reviewRating >= star ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                    }`}
                  />
                </button>
              ))}
              </div>
              <span aria-live="polite" className="text-xs font-semibold text-amber-300">{reviewRating} out of 5 stars</span>
            </div>

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Write your feedback about turf grass condition, floodlights, amenities..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              rows={3}
            />
            {reviewError && <p role="alert" className="text-xs text-rose-300">{reviewError}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setBookingForReview(null)}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setReviewError('');
                  const result = await addReview(bookingForReview.id, reviewRating, reviewComment);
                  if (!result.success) { setReviewError(result.message || 'This review could not be saved.'); return; }
                  setBookingForReview(null);
                  setReviewComment('');
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg cursor-pointer"
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: DISPUTE                                                          */}
      {/* ========================================================================= */}
      {slotToReplaceSelection && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSlotToReplaceSelection(null); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="replace-slot-title" aria-describedby="replace-slot-description" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101a15] p-6 text-white shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><AlertCircle className="h-5 w-5" /></span>
              <div>
                <h3 id="replace-slot-title" className="text-base font-bold">Choose a different time?</h3>
                <p id="replace-slot-description" className="mt-2 text-sm leading-relaxed text-slate-300">This slot is not next to your current selection. Clear your selected slots and select this slot instead?</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setSlotToReplaceSelection(null)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/5">Keep current selection</button>
              <button type="button" onClick={() => {
                const nextSlot = slotToReplaceSelection;
                if (!nextSlot) return;
                unlockSlots(selectedBookingSlots.map((item) => item.id));
                setSelectedSlot(nextSlot);
                setSelectedBookingSlots([nextSlot]);
                setBookingDurationHours(1);
                setSlotToReplaceSelection(null);
              }} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300">Clear and select</button>
            </div>
          </div>
        </div>
      )}

      {disputeBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-400" /> Dispute or Assistance
            </h3>
            <p className="text-xs text-slate-300">
              Booking: <span className="font-mono text-emerald-400">{disputeBooking.bookingNumber}</span>
            </p>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Category:</label>
              <select
                value={disputeCategory}
                onChange={(e) => setDisputeCategory(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white cursor-pointer"
              >
                <option value="facility_unavailable">Facility / Turf Unavailable</option>
                <option value="refund_issue">Refund Calculation Dispute</option>
                <option value="payment_mismatch">Payment Discrepancy</option>
                <option value="other">Other Incident</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Details:</label>
              <textarea
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
                placeholder="Explain the issue clearly for admin arbitration..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                rows={3}
              />
              {disputeError && <p role="alert" className="mt-1 text-xs text-rose-300">{disputeError}</p>}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDisputeBooking(null)}
                className="flex-1 py-2 bg-slate-900 text-slate-300 text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  setDisputeError('');
                  const saved = await raiseDispute(disputeBooking.id, disputeCategory, disputeDesc);
                  if (!saved) { setDisputeError('Unable to submit the dispute. Check the details and try again.'); return; }
                  setDisputeBooking(null);
                  setDisputeDesc('');
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
