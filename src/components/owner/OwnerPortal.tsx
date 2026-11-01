import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Turf, Slot, Booking, PaymentMethod, PaymentStatus, StaffAssignment, TurfAddon, PricingRule } from '../../types';
import {
  Building2,
  Calendar,
  DollarSign,
  Users,
  Plus,
  Clock,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  Phone,
  ShieldCheck,
  Lock,
  Unlock,
  Trash2,
  ChevronDown,
  QrCode,
  Sparkles,
  Trophy,
  Search,
} from 'lucide-react';
import { TournamentsView } from '../tournaments/TournamentsView';
import { TurfMap } from '../common/LazyTurfMap';
import { showAppAlert, showAppPrompt } from '../common/AppDialog';
import { formatBDDate, formatBDTime, formatBDTimeRange, getBDDateString, getBDNow } from '../../utils/datetime';
import { apiFetch } from '../../utils/apiClient';

type ConfiguredSlotTime = { startTime: string; endTime: string };

const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const paymentGatewayLabel = (paymentMethod: PaymentMethod) => ({
  sslcommerz: 'SSLCommerz',
  surjopay: 'ShurjoPay',
  uddoktapay: 'UddoktaPay',
} as Partial<Record<PaymentMethod, string>>)[paymentMethod] || 'Payment gateway';
const weekdaySlotSchedule = (turf: Turf, weekday: string): ConfiguredSlotTime[] => {
  const day = turf.operatingHours.days?.[weekday];
  if (day?.closed) return [];
  if (Array.isArray(day?.slots)) return day.slots.map((slot) => ({ ...slot }));
  return [];
};
const turfHasWeeklySlots = (turf: Turf) => Object.values(turf.operatingHours.days || {}).some((day) => Array.isArray(day.slots) && day.slots.length > 0);

export const OwnerPortal: React.FC = () => {
  const {
    currentUser,
    ownerProfiles,
    turfs,
    slots,
    bookings,
    staffAssignments,
    wallets,
    withdrawals,
    settings,
    createTurf,
    updateTurf,
    uploadTurfPhotos,
    deleteTurf,
    toggleSlotBlock,
    loadAvailability,
    createManualBooking,
    cancelBooking,
    decideCancellationRequest,
    checkInBooking,
    completeBooking,
    createStaff,
    requestWithdrawal,
    updateOwnerPayoutDetails,
    scheduleOwnerBillingModelChange,
    ownerActiveTab,
    setOwnerActiveTab,
    openOwnerManualBookingModal,
    setOpenOwnerManualBookingModal,
    featuredRequests,
    requestFeaturedListing,
    cancelFeaturedListing,
    updatePendingOwnerVerification,
  } = useApp();

  const activeTab = ownerActiveTab;
  const setActiveTab = setOwnerActiveTab;
  const [, setSlotClockTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setSlotClockTick((tick) => tick + 1), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  // Owner profile & scoping
  const profile = ownerProfiles.find((p) => p.userId === currentUser.id);
  const isApproved = profile?.approvalStatus === 'active' && currentUser.status === 'active';
  const myTurfs = turfs.filter((t) => t.ownerId === currentUser.id);
  const myTurfIds = myTurfs.map((t) => t.id);
  // Expired payment holds never became bookings and should not inflate the owner's booking totals.
  const myBookings = bookings.filter((b) => myTurfIds.includes(b.turfId) && b.status !== 'expired');
  const myWallet = wallets[currentUser.id] || {
    ownerId: currentUser.id,
    availableBalance: 0,
    heldBalance: 0,
    totalEarnings: 0,
    totalWithdrawn: 0,
  };
  const myWithdrawals = withdrawals.filter((w) => w.ownerId === currentUser.id);
  const myStaff = staffAssignments.filter((sa) => sa.ownerId === currentUser.id);
  const featuredPackages = settings.featuredPackages || [];
  const [selectedFeaturedPackageId, setSelectedFeaturedPackageId] = useState<string>(featuredPackages[0]?.id || '');
  const selectedFeaturedPackage = featuredPackages.find((pkg) => pkg.id === selectedFeaturedPackageId) || featuredPackages[0];
  const [featuredTurfId, setFeaturedTurfId] = useState<string>('');
  const [featuredMsg, setFeaturedMsg] = useState('');
  const [availableFeaturedCredit, setAvailableFeaturedCredit] = useState(0);
  const [applyFeaturedCredits, setApplyFeaturedCredits] = useState(false);
  const myFeaturedRequests = featuredRequests.filter((r) => r.ownerId === currentUser.id);
  useEffect(() => {
    if (!settings.featureFlags?.featured_turf_enabled || currentUser.role !== 'turf_owner') {
      setAvailableFeaturedCredit(0);
      return;
    }
    let cancelled = false;
    apiFetch('/api/owner/credits')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error(result?.message || 'Unable to load platform credits.');
        const credits = Array.isArray(result.data) ? result.data : [];
        if (!cancelled) setAvailableFeaturedCredit(credits.reduce((sum: number, credit: { availableAmount?: number }) => sum + Number(credit.availableAmount || 0), 0));
      })
      .catch((error) => { if (!cancelled) setFeaturedMsg(error instanceof Error ? error.message : 'Unable to load platform credits.'); });
    return () => { cancelled = true; };
  }, [currentUser.role, featuredRequests.length, settings.featureFlags?.featured_turf_enabled]);
  const requestBillingModelChange = async (billingModel: 'commission' | 'monthly_subscription' | null) => {
    const result = await scheduleOwnerBillingModelChange(billingModel);
    showAppAlert(result.message);
  };

  // Filter state for bookings
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [bookingFilterTurf, setBookingFilterTurf] = useState<string>('All');
  const [bookingFilterStatus, setBookingFilterStatus] = useState<string>('All');
  const [bookingPage, setBookingPage] = useState(1);
  const bookingsPerPage = 12;
  const [payoutSearchQuery, setPayoutSearchQuery] = useState('');
  const [payoutPage, setPayoutPage] = useState(1);
  const payoutsPerPage = 10;

  // Modals
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
  const isManualModalOpen = showManualBookingModal || openOwnerManualBookingModal;
  const closeManualModal = () => {
    setShowManualBookingModal(false);
    setOpenOwnerManualBookingModal(false);
  };
  const [showAddTurfModal, setShowAddTurfModal] = useState(false);
  const [showAddonsModal, setShowAddonsModal] = useState(false);
  const [selectedTurfForAddonsId, setSelectedTurfForAddonsId] = useState<string | null>(null);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showStaffSetupPreview, setShowStaffSetupPreview] = useState<StaffAssignment | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [verificationLicenseNumber, setVerificationLicenseNumber] = useState(profile?.nidOrTradeLicense || '');
  const [verificationLicenseFile, setVerificationLicenseFile] = useState<File | null>(null);
  const [verificationSupportingFiles, setVerificationSupportingFiles] = useState<File[]>([]);
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  const openVerificationDocument = async (document: { fileName: string; dataUrl: string; url?: string }) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) { showAppAlert('Allow pop-ups to view this document.'); return; }
    try {
      let documentUrl = document.dataUrl;
      if (document.url) {
        const response = await apiFetch(document.url);
        if (!response.ok) throw new Error('Unable to load this verification document.');
        const blob = await response.blob();
        if (!blob.size || response.headers.get('content-type')?.includes('application/json')) throw new Error('The verification document is unavailable.');
        documentUrl = URL.createObjectURL(blob);
      }
      if (!documentUrl) throw new Error('The document link is unavailable.');
      popup.location.href = documentUrl;
    } catch (error) {
      popup.close();
      showAppAlert(error instanceof Error ? error.message : 'Unable to load this verification document.');
    }
  };

  useEffect(() => {
    if (profile?.nidOrTradeLicense) setVerificationLicenseNumber(profile.nidOrTradeLicense);
  }, [profile?.nidOrTradeLicense]);

  // Manual Booking Form State (Section 7.4)
  const [mbTurfId, setMbTurfId] = useState<string>(myTurfs[0]?.id || '');
  const [mbDate, setMbDate] = useState(getBDDateString());
  const [mbSlotId, setMbSlotId] = useState<string>('');
  const [mbCustomerName, setMbCustomerName] = useState('');
  const [mbCustomerPhone, setMbCustomerPhone] = useState('');
  const [mbPaymentMethod, setMbPaymentMethod] = useState<PaymentMethod>('cash');
  const [mbPaymentStatus, setMbPaymentStatus] = useState<PaymentStatus>('paid');
  const [mbPaymentAmount, setMbPaymentAmount] = useState('');
  const [mbReference, setMbReference] = useState('');
  const [mbNotes, setMbNotes] = useState('');

  // Add Turf Form State
  const [editingTurfId, setEditingTurfId] = useState<string | null>(null);
  const [newTurfName, setNewTurfName] = useState('');
  const [newTurfDesc, setNewTurfDesc] = useState('');
  const [newTurfAddress, setNewTurfAddress] = useState('');
  const [newTurfArea, setNewTurfArea] = useState('Banani');
  const [newTurfCity, setNewTurfCity] = useState('Dhaka');
  const [newTurfLatitude, setNewTurfLatitude] = useState('23.79');
  const [newTurfLongitude, setNewTurfLongitude] = useState('90.41');
  const [savedTurfPhotos, setSavedTurfPhotos] = useState<string[]>([]);
  const [selectedTurfPhotos, setSelectedTurfPhotos] = useState<File[]>([]);
  const [selectedTurfPhotoPreviews, setSelectedTurfPhotoPreviews] = useState<string[]>([]);
  const [turfPhotoError, setTurfPhotoError] = useState('');
  const turfPhotoInputRef = useRef<HTMLInputElement>(null);
  const [newTurfPrice, setNewTurfPrice] = useState(1200);
  const [schedulePricingRules, setSchedulePricingRules] = useState<PricingRule[]>([]);
  const [pricingRuleMode, setPricingRuleMode] = useState<'weekly' | 'date'>('weekly');
  const [pricingRuleLabel, setPricingRuleLabel] = useState('Morning');
  const [pricingRuleDay, setPricingRuleDay] = useState(0);
  const [pricingRuleDate, setPricingRuleDate] = useState('');
  const [pricingRuleStart, setPricingRuleStart] = useState('07:00');
  const [pricingRuleEnd, setPricingRuleEnd] = useState('08:00');
  const [pricingRulePrice, setPricingRulePrice] = useState(1200);
  const [newTurfSports, setNewTurfSports] = useState<string[]>(['Football']);
  const [newTurfAmenities, setNewTurfAmenities] = useState<string[]>(['Floodlights', 'Washroom']);
  const [customSportOptions, setCustomSportOptions] = useState<string[]>([]);
  const [customAmenityOptions, setCustomAmenityOptions] = useState<string[]>([]);
  const [customSportDraft, setCustomSportDraft] = useState('');
  const [customAmenityDraft, setCustomAmenityDraft] = useState('');
  const [newTurfCancellationHours, setNewTurfCancellationHours] = useState<number>(3);
  const [turfPendingDelete, setTurfPendingDelete] = useState<Turf | null>(null);
  const [deleteTurfError, setDeleteTurfError] = useState('');

  useEffect(() => () => selectedTurfPhotoPreviews.forEach((url) => URL.revokeObjectURL(url)), [selectedTurfPhotoPreviews]);

  const [addonName, setAddonName] = useState('');
  const [addonDescription, setAddonDescription] = useState('');
  const [addonCategory, setAddonCategory] = useState<'equipment' | 'service' | 'food' | 'other'>('equipment');
  const [addonPrice, setAddonPrice] = useState<number>(120);
  const [addonStock, setAddonStock] = useState<number | null>(null);
  const [addonItems, setAddonItems] = useState<TurfAddon[]>([]);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonError, setAddonError] = useState('');
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddonsModal || !selectedTurfForAddonsId) return;
    let cancelled = false;
    setAddonLoading(true);
    setAddonError('');
    apiFetch(`/api/owner/turfs/${encodeURIComponent(selectedTurfForAddonsId)}/addons`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load add-ons.');
      if (!cancelled) setAddonItems((result.data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id), turfId: String(row.turfId ?? row.turf_id ?? selectedTurfForAddonsId), name: String(row.name || ''), description: String(row.description || ''),
        category: row.category as TurfAddon['category'], price: Number(row.price), stockQuantity: row.stockQuantity == null && row.stock_quantity == null ? null : Number(row.stockQuantity ?? row.stock_quantity),
        isActive: Boolean(row.isActive ?? row.is_active), displayOrder: Number(row.displayOrder ?? row.display_order ?? 0),
      })));
    }).catch((error) => { if (!cancelled) setAddonError(error instanceof Error ? error.message : 'Unable to load add-ons.'); })
      .finally(() => { if (!cancelled) setAddonLoading(false); });
    return () => { cancelled = true; };
  }, [showAddonsModal, selectedTurfForAddonsId]);

  const turfSportOptions = ['Football', 'Cricket', 'Basketball', 'Badminton', 'Volleyball', 'Tennis'];
  const turfAmenityOptions = ['Floodlights', 'Washroom', 'Parking', 'Locker Room', 'Cafeteria', 'Drinking Water', 'Changing Room', 'Gallery'];
  const turfWeekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const addTurfPricingRule = () => {
    if (pricingRuleMode === 'date' && !pricingRuleDate) { showAppAlert('Choose the special pricing date.'); return; }
    const label = pricingRuleLabel.trim();
    if (!label || label.length > 60) { showAppAlert('Enter a shift label with 1 to 60 characters.'); return; }
    if (pricingRuleEnd <= pricingRuleStart || !Number.isFinite(pricingRulePrice) || pricingRulePrice <= 0) { showAppAlert('Enter a valid time range and positive hourly price.'); return; }
    const overlaps = schedulePricingRules.some((rule) => (pricingRuleMode === 'date' ? rule.date === pricingRuleDate : !rule.date && rule.dayOfWeek === pricingRuleDay) && pricingRuleStart < rule.endTime && rule.startTime < pricingRuleEnd);
    if (overlaps) { showAppAlert('This time range overlaps another price rule for the same day.'); return; }
    setSchedulePricingRules((rules) => [...rules, {
      id: crypto.randomUUID(), ...(pricingRuleMode === 'date' ? { date: pricingRuleDate } : { dayOfWeek: pricingRuleDay }),
      label, startTime: pricingRuleStart, endTime: pricingRuleEnd, pricePerHour: pricingRulePrice,
    }]);
  };
  const addCustomTurfValue = (kind: 'sport' | 'amenity') => {
    const value = (kind === 'sport' ? customSportDraft : customAmenityDraft).trim();
    const current = kind === 'sport' ? newTurfSports : newTurfAmenities;
    if (!value || value.length > 60) { showAppAlert('Enter a value with 1 to 60 characters.'); return; }
    if (current.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) { showAppAlert('That option is already selected.'); return; }
    if (kind === 'sport') { setCustomSportOptions((items) => [...items, value]); setNewTurfSports((items) => [...items, value]); setCustomSportDraft(''); }
    else { setCustomAmenityOptions((items) => [...items, value]); setNewTurfAmenities((items) => [...items, value]); setCustomAmenityDraft(''); }
  };

  // Add Staff Form State
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffTurfIds, setStaffTurfIds] = useState<string[]>(myTurfIds.slice(0, 1));
  const [staffPerms, setStaffPerms] = useState<string[]>([
    'bookings.view',
    'bookings.check_in',
    'bookings.complete',
    'bookings.create_manual',
    'slots.view',
    'slots.block',
  ]);

  // Withdrawal Form State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(1000);
  const [withdrawMethod, setWithdrawMethod] = useState('bKash');
  const [withdrawDetails, setWithdrawDetails] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');

  // Payout Details Editing (bank / bKash / Nagad)
  const [isEditingPayout, setIsEditingPayout] = useState(false);
  const [payoutFormMethod, setPayoutFormMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank_account'>('bkash');
  const [payoutFormAccountNumber, setPayoutFormAccountNumber] = useState('');
  const [payoutFormBankName, setPayoutFormBankName] = useState('');
  const [payoutFormBranchName, setPayoutFormBranchName] = useState('');
  const [payoutFormAccountHolder, setPayoutFormAccountHolder] = useState('');
  const [payoutFormMessage, setPayoutFormMessage] = useState('');

  const openEditPayoutForm = () => {
    setPayoutFormMethod(profile?.payoutMethod || 'bkash');
    setPayoutFormAccountNumber(profile?.payoutDetails.accountNumber || '');
    setPayoutFormBankName(profile?.payoutDetails.bankName || '');
    setPayoutFormBranchName(profile?.payoutDetails.branchName || '');
    setPayoutFormAccountHolder(profile?.payoutDetails.accountHolderName || '');
    setPayoutFormMessage('');
    setIsEditingPayout(true);
  };

  const handleSavePayoutDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await updateOwnerPayoutDetails({
      payoutMethod: payoutFormMethod,
      accountNumber: payoutFormAccountNumber,
      bankName: payoutFormBankName,
      branchName: payoutFormBranchName,
      accountHolderName: payoutFormAccountHolder,
    });
    setPayoutFormMessage(result.message);
    if (result.success) {
      setIsEditingPayout(false);
    }
  };

  // Slot Manager State
  const [slotDate, setSlotDate] = useState(getBDDateString());
  const [slotTurfId, setSlotTurfId] = useState(myTurfs[0]?.id || '');
  const [scheduleDay, setScheduleDay] = useState(weekdayKeys[new Date(`${getBDDateString()}T12:00:00Z`).getUTCDay()]);
  const [scheduleSlots, setScheduleSlots] = useState<ConfiguredSlotTime[]>([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [pricingMessage, setPricingMessage] = useState('');
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
  const selectedScheduleTurf = myTurfs.find((turf) => turf.id === slotTurfId);
  useEffect(() => {
    if (!myTurfs.some((turf) => turf.id === slotTurfId)) setSlotTurfId(myTurfs[0]?.id || '');
  }, [myTurfs, slotTurfId]);
  const slotTimeOptions = Array.from({ length: 48 }, (_, index) => {
    const minutes = index * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }).concat('24:00');
  useEffect(() => {
    if (!selectedScheduleTurf) { setScheduleSlots([]); setSchedulePricingRules([]); return; }
    setScheduleSlots(weekdaySlotSchedule(selectedScheduleTurf, scheduleDay));
  }, [selectedScheduleTurf, scheduleDay]);
  useEffect(() => {
    if (!selectedScheduleTurf) { setSchedulePricingRules([]); return; }
    setSchedulePricingRules((selectedScheduleTurf.pricingRules || []).map((rule) => ({ ...rule, id: rule.id || crypto.randomUUID(), label: rule.label || 'Shift' })));
    setPricingMessage('');
  }, [selectedScheduleTurf?.id]);
  useEffect(() => {
    if (slotTurfId) void loadAvailability(slotTurfId, slotDate);
  }, [slotTurfId, slotDate, loadAvailability]);

  const pricingRuleGroups = Object.values(schedulePricingRules.reduce<Record<string, { label: string; schedule: string; rules: PricingRule[] }>>((groups, rule) => {
    const label = rule.label || 'Shift';
    const schedule = rule.date ? `${rule.date} special date` : `${turfWeekdays[rule.dayOfWeek ?? 0]} weekly`;
    const key = `${schedule.toLowerCase()}|${label.toLowerCase()}`;
    if (!groups[key]) groups[key] = { label, schedule, rules: [] };
    groups[key].rules.push(rule);
    return groups;
  }, {}));

  // Filtered Bookings
  const pendingSetupStaffCount = myStaff.filter((staff) => staff.status === 'pending_setup').length;

  const filteredBookings = myBookings.filter((b) => {
    const query = bookingSearchQuery.trim().toLowerCase();
    const matchesTurf = bookingFilterTurf === 'All' || b.turfId === bookingFilterTurf;
    const matchesStatus = bookingFilterStatus === 'All' || (bookingFilterStatus === 'cancellation_request_pending'
      ? b.cancellationRequestStatus === 'pending' : b.status === bookingFilterStatus);
    const matchesSearch = !query || [b.bookingNumber, b.customerName, b.customerPhone, b.turfName, b.date, b.bookingSource, b.status, b.paymentStatus]
      .some((value) => String(value || '').toLowerCase().includes(query));
    return matchesTurf && matchesStatus && matchesSearch;
  });
  const bookingPageCount = Math.max(1, Math.ceil(filteredBookings.length / bookingsPerPage));
  const paginatedBookings = filteredBookings.slice((bookingPage - 1) * bookingsPerPage, bookingPage * bookingsPerPage);
  useEffect(() => setBookingPage((page) => Math.min(page, bookingPageCount)), [bookingPageCount]);
  const payoutQuery = payoutSearchQuery.trim().toLowerCase();
  const filteredWithdrawals = myWithdrawals.filter((withdrawal) => [
    withdrawal.id,
    withdrawal.amount,
    withdrawal.payoutMethod,
    withdrawal.payoutDetails,
    formatBDDate(withdrawal.createdAt),
    withdrawal.status,
    withdrawal.reference,
    withdrawal.rejectionReason,
  ].some((value) => String(value || '').toLowerCase().includes(payoutQuery)));
  const payoutPageCount = Math.max(1, Math.ceil(filteredWithdrawals.length / payoutsPerPage));
  const paginatedWithdrawals = filteredWithdrawals.slice((payoutPage - 1) * payoutsPerPage, payoutPage * payoutsPerPage);
  useEffect(() => setPayoutPage((page) => Math.min(page, payoutPageCount)), [payoutPageCount]);
  const settledBookings = filteredBookings.filter((b) => b.paymentStatus === 'paid' && ['confirmed', 'checked_in', 'completed'].includes(b.status));
  const settledTotals = settledBookings.reduce((totals, booking) => ({
    playerPaid: totals.playerPaid + booking.totalPaid,
    platformFees: totals.platformFees + booking.platformFeeAmount,
    gatewayFees: totals.gatewayFees + booking.gatewayFeeAmount,
    ownerNet: totals.ownerNet + booking.netOwnerAmount,
  }), { playerPaid: 0, platformFees: 0, gatewayFees: 0, ownerNet: 0 });

  const isSlotInPast = (date: string, time: string) => {
    const today = getBDDateString();
    if (date < today) return true;
    if (date > today) return false;
    const now = getBDNow();
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
  };
  const selectedDateSlots = slots.filter((slot) => slot.turfId === slotTurfId && slot.date === slotDate);
  const selectedDateSlotCounts = {
    available: selectedDateSlots.filter((slot) => slot.status === 'available' && !isSlotInPast(slot.date, slot.startTime)).length,
    booked: selectedDateSlots.filter((slot) => ['booked', 'locked'].includes(slot.status) && !isSlotInPast(slot.date, slot.startTime)).length,
    blocked: selectedDateSlots.filter((slot) => slot.status === 'blocked' && !isSlotInPast(slot.date, slot.startTime)).length,
    past: selectedDateSlots.filter((slot) => isSlotInPast(slot.date, slot.startTime)).length,
  };
  const availableSlotsForManual = slots.filter(
    (s) => s.turfId === mbTurfId && s.date === mbDate && s.status === 'available' && !isSlotInPast(s.date, s.startTime)
  );
  useEffect(() => {
    if (mbTurfId && mbDate) void loadAvailability(mbTurfId, mbDate);
  }, [mbTurfId, mbDate, loadAvailability]);

  const handleManualBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mbTurfId || !mbSlotId || !mbCustomerName || !mbCustomerPhone) return;

    const result = await createManualBooking({
      turfId: mbTurfId,
      slotId: mbSlotId,
      customerName: mbCustomerName,
      customerPhone: mbCustomerPhone,
      paymentMethod: mbPaymentMethod,
      paymentStatus: mbPaymentStatus,
      paymentAmount: mbPaymentAmount ? Number(mbPaymentAmount) : undefined,
      paymentReference: mbReference,
      notes: mbNotes,
    });
    if (!result) {
      showAppAlert('Manual booking could not be saved.');
      return;
    }

    closeManualModal();
    setMbCustomerName('');
    setMbCustomerPhone('');
    setMbReference('');
    setMbNotes('');
  };

  const handleSaveWeeklySchedule = async () => {
    if (!selectedScheduleTurf) return;
    const sortedSlots = [...scheduleSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const toMinutes = (time: string) => {
      const [hour, minute] = time.split(':').map(Number);
      return hour * 60 + minute;
    };
    let previousEnd = -1;
    for (const slot of sortedSlots) {
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start % 30 !== 0 || end % 30 !== 0 || end - start !== 60 || start < previousEnd || start >= 1440 || end > 1440) {
        setScheduleMessage('Each slot must be one hour, use 30-minute boundaries, and not overlap another slot.');
        return;
      }
      previousEnd = end;
    }
    const oldDays = selectedScheduleTurf.operatingHours.days || {};
    const openTime = sortedSlots[0]?.startTime || '07:00';
    const closeTime = sortedSlots.at(-1)?.endTime || '07:00';
    const operatingHours: Turf['operatingHours'] = {
      ...selectedScheduleTurf.operatingHours,
      openTime: selectedScheduleTurf.operatingHours.openTime || '07:00',
      closeTime: selectedScheduleTurf.operatingHours.closeTime || '23:59',
      days: {
        ...oldDays,
        [scheduleDay]: { openTime, closeTime, closed: sortedSlots.length === 0, slots: sortedSlots },
      },
    };
    const updated = await updateTurf(selectedScheduleTurf.id, { operatingHours });
    if (!updated) {
      setScheduleMessage('Could not save this weekly schedule. Please try again.');
      return;
    }
    setScheduleMessage(`${scheduleDay[0].toUpperCase()}${scheduleDay.slice(1)} availability saved.`);
    await loadAvailability(slotTurfId, slotDate);
  };

  const handleSavePricingRules = async () => {
    if (!selectedScheduleTurf) return;
    const updated = await updateTurf(selectedScheduleTurf.id, { pricingRules: schedulePricingRules });
    setPricingMessage(updated ? 'Pricing rules saved.' : 'Could not save pricing rules. Please try again.');
    if (updated) await loadAvailability(slotTurfId, slotDate);
  };

  const handleAddTurfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTurfName || !newTurfAddress) return;
    const latitude = Number(newTurfLatitude);
    const longitude = Number(newTurfLongitude);
    if (!newTurfLatitude.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !newTurfLongitude.trim() || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      showAppAlert('Enter a valid latitude and longitude for the turf location.');
      return;
    }

    let savedTurf: Turf | null;
    if (editingTurfId) {
      savedTurf = await updateTurf(editingTurfId, {
        name: newTurfName,
        description: newTurfDesc,
        address: newTurfAddress,
        area: newTurfArea,
        city: newTurfCity,
        latitude,
        longitude,
        photos: savedTurfPhotos,
        sportTypes: newTurfSports,
        amenities: newTurfAmenities,
        basePricePerHour: Number(newTurfPrice),
        cancellationCutoffHours: Number(newTurfCancellationHours),
      });
      if (!savedTurf) { showAppAlert('Turf changes could not be saved. Check the fields and try again.'); return; }
    } else {
      savedTurf = await createTurf({
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        name: newTurfName,
        description: newTurfDesc || 'Professional sports pitch with tournament grade lighting.',
        address: newTurfAddress,
        area: newTurfArea,
        city: newTurfCity,
        latitude,
        longitude,
        sportTypes: newTurfSports,
        amenities: newTurfAmenities,
        basePricePerHour: Number(newTurfPrice),
        operatingHours: { openTime: '07:00', closeTime: '23:59' },
        photos: [],
        status: 'pending_review',
        cancellationCutoffHours: Number(newTurfCancellationHours),
      });
      if (!savedTurf) { showAppAlert('Turf could not be submitted. Check the fields and try again.'); return; }
    }

    if (selectedTurfPhotos.length > 0) {
      const photoResult = await uploadTurfPhotos(savedTurf.id, selectedTurfPhotos);
      if (!photoResult.success) {
        setEditingTurfId(savedTurf.id);
        setTurfPhotoError(`Turf details were saved, but the photos were not uploaded: ${photoResult.message}`);
        return;
      }
    }

    setShowAddTurfModal(false);
    setEditingTurfId(null);
    setNewTurfName('');
    setNewTurfDesc('');
    setNewTurfAddress('');
    setNewTurfArea('Banani');
    setNewTurfCity('Dhaka');
    setNewTurfLatitude('23.79');
    setNewTurfLongitude('90.41');
    setSavedTurfPhotos([]);
    setSelectedTurfPhotos([]);
    setSelectedTurfPhotoPreviews([]);
    setTurfPhotoError('');
    setNewTurfPrice(1200);
    setNewTurfSports(['Football']);
    setNewTurfAmenities(['Floodlights', 'Washroom']);
    setCustomSportOptions([]);
    setCustomAmenityOptions([]);
    setCustomSportDraft('');
    setCustomAmenityDraft('');
    setNewTurfCancellationHours(3);
  };

  const openAddTurfModal = () => {
    setEditingTurfId(null);
    setNewTurfName('');
    setNewTurfDesc('');
    setNewTurfAddress('');
    setNewTurfArea('Banani');
    setNewTurfCity('Dhaka');
    setNewTurfLatitude('23.79');
    setNewTurfLongitude('90.41');
    setSavedTurfPhotos([]);
    setSelectedTurfPhotos([]);
    setSelectedTurfPhotoPreviews([]);
    setTurfPhotoError('');
    setNewTurfPrice(1200);
    setNewTurfSports(['Football']);
    setNewTurfAmenities(['Floodlights', 'Washroom']);
    setCustomSportOptions([]);
    setCustomAmenityOptions([]);
    setCustomSportDraft('');
    setCustomAmenityDraft('');
    setNewTurfCancellationHours(3);
    setShowAddTurfModal(true);
  };

  const openEditTurfModal = (turf: Turf) => {
    setEditingTurfId(turf.id);
    setNewTurfName(turf.name);
    setNewTurfDesc(turf.description);
    setNewTurfAddress(turf.address);
    setNewTurfArea(turf.area);
    setNewTurfCity(turf.city);
    setNewTurfLatitude(String(turf.latitude));
    setNewTurfLongitude(String(turf.longitude));
    setSavedTurfPhotos(turf.photos || []);
    setSelectedTurfPhotos([]);
    setSelectedTurfPhotoPreviews([]);
    setTurfPhotoError('');
    setNewTurfPrice(turf.basePricePerHour);
    setNewTurfSports(turf.sportTypes);
    setNewTurfAmenities(turf.amenities);
    setCustomSportOptions(turf.sportTypes.filter((sport) => !turfSportOptions.includes(sport)));
    setCustomAmenityOptions(turf.amenities.filter((amenity) => !turfAmenityOptions.includes(amenity)));
    setCustomSportDraft('');
    setCustomAmenityDraft('');
    setNewTurfCancellationHours(turf.cancellationCutoffHours ?? 3);
    setShowAddTurfModal(true);
  };

  const handleConfirmDeleteTurf = async () => {
    if (!turfPendingDelete) return;
    const result = await deleteTurf(turfPendingDelete.id);
    if (!result.success) {
      setDeleteTurfError(result.message);
      return;
    }
    setTurfPendingDelete(null);
    setDeleteTurfError('');
    showAppAlert(result.message);
  };

  const selectedTurfForAddons = selectedTurfForAddonsId ? turfs.find((t) => t.id === selectedTurfForAddonsId) ?? null : null;

  const handleAddAddonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTurfForAddons || !addonName.trim()) return;

    const editedAddon = editingAddonId ? addonItems.find((item) => item.id === editingAddonId) : undefined;
    const payload = { name: addonName.trim(), description: addonDescription.trim(), category: addonCategory, price: Number(addonPrice), stockQuantity: addonStock, isActive: editedAddon?.isActive ?? true, displayOrder: editedAddon?.displayOrder ?? addonItems.length + 1 };
    try {
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(selectedTurfForAddons.id)}/addons${editingAddonId ? `/${encodeURIComponent(editingAddonId)}` : ''}`, { method: editingAddonId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save add-on.');
      const row = result.data;
      const saved: TurfAddon = { id: String(row.id), turfId: String(row.turfId), name: row.name, description: row.description || undefined, category: row.category, price: Number(row.price), stockQuantity: row.stockQuantity == null ? null : Number(row.stockQuantity), isActive: Boolean(row.isActive), displayOrder: Number(row.displayOrder || 0) };
      setAddonItems((items) => editingAddonId ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved]);
      setAddonError('');
    } catch (error) { setAddonError(error instanceof Error ? error.message : 'Unable to save add-on.'); return; }

    setAddonName('');
    setAddonDescription('');
    setAddonCategory('equipment');
    setAddonPrice(120);
    setAddonStock(null);
    setEditingAddonId(null);
  };

  const handleAddonToggle = async (addonId: string) => {
    if (!selectedTurfForAddons) return;
    const addon = addonItems.find((item) => item.id === addonId);
    if (!addon) return;
    try {
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(selectedTurfForAddons.id)}/addons/${encodeURIComponent(addonId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...addon, isActive: !addon.isActive }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update add-on.');
      setAddonItems((items) => items.map((item) => item.id === addonId ? { ...item, isActive: !item.isActive } : item));
      setAddonError('');
    } catch (error) { setAddonError(error instanceof Error ? error.message : 'Unable to update add-on.'); }
  };

  const handleAddonDelete = async (addonId: string) => {
    if (!selectedTurfForAddons) return;
    try {
      const response = await apiFetch(`/api/owner/turfs/${encodeURIComponent(selectedTurfForAddons.id)}/addons/${encodeURIComponent(addonId)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete add-on.');
      setAddonItems((items) => items.filter((item) => item.id !== addonId));
      setAddonError('');
    } catch (error) { setAddonError(error instanceof Error ? error.message : 'Unable to delete add-on.'); }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await requestWithdrawal(Number(withdrawAmount), withdrawMethod, withdrawDetails || profile?.payoutDetails.accountNumber || '');
    setWithdrawMsg(res.message);
    if (res.success) {
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawMsg('');
      }, 1500);
    }
  };

  const handleCreateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName || !staffEmail || !staffPhone) return;
    const saved = await createStaff(staffName, staffEmail, staffPhone, staffTurfIds, staffPerms);
    if (!saved) { showAppAlert('Staff account was not saved. Confirm the turf assignments and email delivery settings.'); return; }
    setShowAddStaffModal(false);
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
  };

                    if (!isApproved) {
    return (
      <div className="min-h-[70vh] bg-[#07130c] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-400/30 bg-[#0A1E14] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-400/10 text-amber-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Business verification</p>
              <h1 className="mt-1 text-2xl font-black text-white">Your account is awaiting admin review</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Your contact email and trade license have been submitted. The owner dashboard, turf listings, bookings, and financial tools will become available after an admin verifies your business and approves your account.
              </p>
            </div>
          </div>
          {profile?.reviewMessage && (
            <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Admin requested an update</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white">{profile.reviewMessage}</p>
            </div>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Contact email</p>
              <p className="mt-1 break-all text-sm font-semibold text-white">{currentUser.email}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/50">Submitted verification documents</p>
              {profile?.businessVerificationDocuments?.length ? (
                <div className="mt-1 space-y-1">
                  {profile.businessVerificationDocuments.map((document, index) => (
                    <button key={`${document.fileName}-${index}`} type="button" onClick={() => void openVerificationDocument(document)} className="block max-w-full truncate text-left text-sm font-semibold text-[#C8FF5E] underline">
                      {document.fileName}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm font-semibold text-amber-200">Not submitted</p>
              )}
            </div>
          </div>
          {profile?.approvalStatus === 'pending_approval' && profile.reviewMessage && (
            <form className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/10 p-4" onSubmit={async (event) => {
              event.preventDefault(); setVerificationMessage('');
              if (!verificationLicenseFile) { setVerificationMessage('Choose the trade license file to submit your updated verification.'); return; }
              setVerificationSaving(true);
              const result = await updatePendingOwnerVerification(verificationLicenseNumber, verificationLicenseFile, verificationSupportingFiles);
              setVerificationSaving(false); setVerificationMessage(result.message);
              if (result.success) { setVerificationLicenseFile(null); setVerificationSupportingFiles([]); }
            }}>
              <div><h2 className="text-sm font-bold text-white">Update business verification</h2><p className="mt-1 text-xs text-white/55">Upload a trade license and any requested supporting documents. Your account will stay pending until admin review.</p></div>
              <label className="block text-xs font-semibold text-white/70">Trade license number<input required maxLength={100} value={verificationLicenseNumber} onChange={(event) => setVerificationLicenseNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#07130c] p-2.5 text-sm text-white outline-none focus:border-[#C8FF5E]" /></label>
              <label className="block text-xs font-semibold text-white/70">Updated trade license (PDF, JPG, PNG, or WEBP; max 10 MB)<input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationLicenseFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" /></label>
              <label className="block text-xs font-semibold text-white/70">Supporting documents (optional, max 5; upload each document you want to keep)<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setVerificationSupportingFiles(Array.from(event.target.files || []))} className="mt-1 block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" /></label>
              {verificationMessage && <p className="text-xs text-amber-200">{verificationMessage}</p>}
              <button disabled={verificationSaving} className="rounded-lg bg-[#C8FF5E] px-4 py-2 text-sm font-bold text-[#102014] disabled:opacity-50">{verificationSaving ? 'Submitting…' : 'Submit updated documents'}</button>
            </form>
          )}
          {profile?.approvalStatus === 'rejected' && (
            <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-sm text-rose-200">
              Your verification was not approved. Contact the platform administrator for next steps.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07130c] text-slate-100 pb-16">
      {/* Header & Approval Notice */}
      <div className="bg-[#0A1E14] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                  Turf Owner Console
                </span>
                <span className="text-xs text-white/60">Business: {profile?.businessName || currentUser.name}</span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1">Grounds & Booking Operations</h1>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1.5 bg-white/[0.06] p-1 rounded-2xl border border-white/10 flex-wrap no-scrollbar">
              <button
                onClick={() => setActiveTab('bookings')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'bookings' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Bookings ({myBookings.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('turfs')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'turfs' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>My Turfs ({myTurfs.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('slots')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'slots' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Slots & Schedule</span>
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'staff' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Staff ({myStaff.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('wallet')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'wallet' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Wallet & Payouts</span>
              </button>
              {settings.featureFlags?.tournament_enabled && <button
                onClick={() => setActiveTab('tournaments')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'tournaments' ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Tournaments</span>
              </button>}
            </div>
          </div>

          {/* Pending Approval Notice if not approved yet */}
          {!isApproved && (
            <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/35 p-4 text-amber-100 shadow-[0_16px_40px_rgba(245,158,11,0.12)]">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-300/30 text-amber-300">
                    <AlertTriangle className="w-5 h-5" />
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
                          Onboarding Status
                        </p>
                        <h2 className="text-lg font-black text-white mt-1">Account pending admin approval</h2>
                      </div>

                      <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                        Awaiting Review
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-amber-100/80 leading-relaxed">
                      Your turf owner profile has been submitted successfully. The platform is currently reviewing your business details,
                      payout setup, and verification information before your venue can go live for public bookings.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/70">Business Name</p>
                  <p className="mt-1 text-sm font-bold text-white">{profile?.businessName || 'Not provided yet'}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/70">Trade License / NID</p>
                  <p className="mt-1 text-sm font-bold text-white">{profile?.nidOrTradeLicense || 'Under verification'}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/70">Payout Method</p>
                  <p className="mt-1 text-sm font-bold text-white uppercase">{profile?.payoutMethod || 'Pending setup'}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/70">Submitted</p>
                  <p className="mt-1 text-sm font-bold text-white">{formatBDDate(new Date().toISOString())}</p>
                </div>
              </div>
            </div>
          )}

          {isApproved && profile?.billingModel === 'monthly_subscription' && (
            <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Monthly Subscription</p>
                <p className="mt-1 text-sm font-bold text-white">৳{Number(profile.subscriptionDueAmount || settings.monthlySubscriptionAmount || 0).toLocaleString()} due {profile.subscriptionDueDate || 'after approval'}</p>
                <p className="mt-1 text-[11px] text-white/60">Paid through: {profile.subscriptionPaidThrough || 'No payment recorded'}{profile.subscriptionPaymentReference ? ` · Ref ${profile.subscriptionPaymentReference}` : ''}</p>
              </div>
              <span className="text-xs text-amber-100/75">Payments are recorded by the platform admin.</span>
            </section>
          )}

          {isApproved && (profile?.billingSwitchEnabled || profile?.pendingBillingModel) && (
            <section className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0A1E14] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Billing Plan</p>
                <p className="mt-1 text-sm font-bold capitalize text-white">{(profile.billingModel || 'commission').replace('_', ' ')}</p>
                {profile.pendingBillingModel && <p className="mt-1 text-[11px] text-sky-200">Switch to {profile.pendingBillingModel.replace('_', ' ')} effective {profile.billingModelChangeEffectiveDate || 'at the next renewal'}{profile.billingModel === 'monthly_subscription' ? ', after the current subscription is paid.' : '.'}</p>}
                {!profile.pendingBillingModel && profile.billingSwitchEnabled && <p className="mt-1 text-[11px] text-white/55">Plan changes start at the next calendar-month boundary.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.billingSwitchEnabled && !profile.pendingBillingModel && <button type="button" disabled={profile.billingModel !== 'monthly_subscription' && Number(settings.monthlySubscriptionAmount ?? 0) <= 0} onClick={() => void requestBillingModelChange(profile.billingModel === 'monthly_subscription' ? 'commission' : 'monthly_subscription')} className="rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-bold text-[#0A1E14] disabled:cursor-not-allowed disabled:opacity-40">{profile.billingModel !== 'monthly_subscription' && Number(settings.monthlySubscriptionAmount ?? 0) <= 0 ? 'Subscription unavailable' : `Switch to ${profile.billingModel === 'monthly_subscription' ? 'commission' : 'monthly subscription'}`}</button>}
                {profile.billingSwitchEnabled && profile.pendingBillingModel && <button type="button" onClick={() => void requestBillingModelChange(null)} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white">Cancel scheduled change</button>}
              </div>
            </section>
          )}

          {/* Quick Metrics KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Active Turfs</div>
              <div className="text-xl font-black text-white mt-1">{myTurfs.filter((t) => t.status === 'active').length}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Total Bookings</div>
              <div className="text-xl font-black text-white mt-1">{myBookings.length}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Available Wallet</div>
              <div className="text-xl font-black text-[#C8FF5E] mt-1">৳{myWallet.availableBalance.toLocaleString()}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Held in Policy Window</div>
              <div className="text-xl font-black text-amber-400 mt-1">৳{myWallet.heldBalance.toLocaleString()}</div>
            </div>
            <div className="bg-[#0e271a] p-3.5 rounded-2xl border border-white/10 hover:border-[#C8FF5E]/30 transition-all">
              <div className="text-[10px] text-white/50 font-medium uppercase">Staff Delegated</div>
              <div className="text-xl font-black text-white mt-1">{myStaff.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* TAB 1: BOOKINGS & OPERATIONS */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Booking Management & Check-ins</h2>
                <p className="text-xs text-white/60">View player contacts, record counter arrivals, and handle manual entries.</p>
              </div>

              {/* Action Button: Manual Booking */}
              <button
                onClick={() => setShowManualBookingModal(true)}
                className="px-4 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Manual / Counter Booking</span>
              </button>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: 'Player Paid', amount: settledTotals.playerPaid, color: 'text-white' },
                { label: 'Platform Fees', amount: settledTotals.platformFees, color: 'text-sky-300' },
                { label: 'Gateway Fees', amount: settledTotals.gatewayFees, color: 'text-amber-300' },
                { label: 'Owner Net Earnings', amount: settledTotals.ownerNet, color: 'text-[#C8FF5E]' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-[#0e271a] p-3.5">
                  <div className="text-[10px] uppercase tracking-wide text-white/55">{card.label}</div>
                  <div className={`mt-1 text-lg font-black ${card.color}`}>৳{card.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={bookingSearchQuery}
                  onChange={(event) => {
                    setBookingSearchQuery(event.target.value);
                    setBookingPage(1);
                  }}
                  placeholder="Search booking, customer, phone, turf..."
                  aria-label="Search bookings"
                  className="w-full rounded-xl border border-white/10 bg-[#07130c] py-2 pl-9 pr-3 text-white placeholder-white/40 outline-none focus:border-[#C8FF5E]"
                />
              </div>
              <select
                value={bookingFilterTurf}
                onChange={(e) => { setBookingFilterTurf(e.target.value); setBookingPage(1); }}
                className="bg-[#07130c] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-[#C8FF5E] outline-none"
              >
                <option value="All">All Owned Turfs</option>
                {myTurfs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={bookingFilterStatus}
                onChange={(e) => { setBookingFilterStatus(e.target.value); setBookingPage(1); }}
                className="bg-[#07130c] border border-white/10 rounded-xl px-3 py-2 text-white focus:border-[#C8FF5E] outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked In</option>
                <option value="completed">Completed</option>
                <option value="cancellation_request_pending">Cancellation Review Needed</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            {/* Table */}
            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-[#0e271a] text-white/60 uppercase font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-3.5 px-4">Booking #</th>
                      <th className="py-3.5 px-4">Customer Contact</th>
                      <th className="py-3.5 px-4">Turf & Date</th>
                      <th className="py-3.5 px-4">Time Slot</th>
                      <th className="py-3.5 px-4">Payment Breakdown</th>
                      <th className="py-3.5 px-4">Net Owner Amount</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {paginatedBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">{b.bookingNumber}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{b.customerName}</div>
                          <div className="text-[11px] text-white/60 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-[#C8FF5E]" /> {b.customerPhone}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-white font-medium">{b.turfName}</div>
                          <div className="text-[11px] text-white/60">{b.date}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">
                          {formatBDTimeRange(b.startTime, b.endTime)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              b.bookingSource === 'online'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/30'
                                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {b.bookingSource}
                          </span>
                          <div className="text-[10px] text-white/50 mt-0.5">
                            {b.bookingSource === 'online' ? paymentGatewayLabel(b.paymentMethod) : 'Manual (0 TK Gateway)'}
                          </div>
                          <div className="mt-1.5 space-y-0.5 text-[10px] text-white/65">
                            <div>Turf price: ৳{b.baseAmount.toLocaleString()}</div>
                            <div>Platform fee: ৳{b.platformFeeAmount.toLocaleString()}</div>
                            {b.gatewayFeeAmount > 0 && <div>{paymentGatewayLabel(b.paymentMethod)} fee: ৳{b.gatewayFeeAmount.toLocaleString()}</div>}
                            <div className="font-bold text-white">Player total: ৳{b.totalPaid.toLocaleString()}</div>
                            <div>Payment: {b.paymentStatus}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-black text-[#C8FF5E] text-sm">৳{b.netOwnerAmount.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              b.status === 'confirmed'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : b.status === 'checked_in'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : b.status === 'completed'
                                ? 'bg-white/10 text-white/80 border-white/15'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {b.status.replace('_', ' ')}
                          </span>
                          {b.cancellationRequestStatus && <div className="mt-2 max-w-64 space-y-1 text-[10px] text-amber-100">
                            <p className="font-bold">Player cancellation: {b.cancellationRequestStatus}</p>
                            {b.cancellationRequestReason && <p>Player reason: {b.cancellationRequestReason}</p>}
                            {b.cancellationRequestRefundPercentage !== undefined && <p>Saved policy refund: {b.cancellationRequestRefundPercentage}% (captured when requested)</p>}
                            {b.cancellationDecisionReason && <p>Owner response: {b.cancellationDecisionReason}</p>}
                          </div>}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {b.cancellationRequestStatus === 'pending' && <div className="mb-2 flex justify-end gap-1">
                            {(['approve', 'reject'] as const).map((decision) => <button key={decision} onClick={async () => {
                              const reason = (await showAppPrompt(`Required reason for ${decision === 'approve' ? 'approving' : 'rejecting'} this cancellation request:`, decision === 'approve' ? 'Approved after review' : 'Booking remains available'))?.trim();
                              if (!reason) return;
                              const result = await decideCancellationRequest(b.id, decision, reason);
                              showAppAlert(result.message);
                            }} className={`rounded-lg px-2 py-1 text-[10px] font-bold ${decision === 'approve' ? 'bg-emerald-400 text-[#07130c]' : 'border border-rose-500/40 text-rose-200'}`}>
                              {decision === 'approve' ? 'Approve request' : 'Reject request'}
                            </button>)}
                          </div>}
                          {b.status === 'confirmed' && (
                            <button
                              onClick={() => checkInBooking(b.id)}
                              className="px-2.5 py-1 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-[11px] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer"
                            >
                              Check In
                            </button>
                          )}
                          {(b.status === 'confirmed' || b.status === 'checked_in') && (
                            <button
                              onClick={() => completeBooking(b.id)}
                              className="px-2.5 py-1 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-[11px] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 transition-all cursor-pointer"
                            >
                              Mark Complete
                            </button>
                          )}
                          {(b.status === 'confirmed' || b.status === 'checked_in') && (
                            <button
                              onClick={async () => {
                                const reason = (await showAppPrompt(
                                  'Enter the reason for cancelling this booking. The player receives a full refund of the turf price and platform fee. Any payment gateway fee is non-refundable.',
                                  'Ground unavailable',
                                ))?.trim();
                                if (!reason) return;
                                if (reason.length > 1000) { showAppAlert('The cancellation reason must be 1,000 characters or fewer.'); return; }
                                if (!confirm(`Cancel booking ${b.bookingNumber}? This immediately cancels the booking and queues a full player refund.`)) return;
                                const result = await cancelBooking(b.id, reason, true);
                                showAppAlert(result.success
                                  ? `Booking cancelled. A refund of ৳${result.refundAmount.toLocaleString()} has been queued for the player.`
                                  : result.message);
                              }}
                              className="px-2 py-1 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 text-[11px] font-semibold rounded-xl border border-rose-800/40 transition-colors cursor-pointer"
                              title="Cancel Match (100% refund)"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-white/50 text-xs">
                          No bookings match the current search and filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#0e271a] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setBookingPage((page) => Math.max(1, page - 1))}
                  disabled={bookingPage === 1}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <div className="text-[11px] text-white/60">
                  {filteredBookings.length === 0 ? '0 bookings' : `${filteredBookings.length} bookings · Page ${bookingPage} of ${bookingPageCount}`}
                </div>
                <button
                  type="button"
                  onClick={() => setBookingPage((page) => Math.min(bookingPageCount, page + 1))}
                  disabled={bookingPage >= bookingPageCount}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MY TURFS */}
        {activeTab === 'turfs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Your Listed Turfs</h2>
                <p className="text-xs text-white/60">Newly added turfs enter pending review status until admin approval.</p>
              </div>
              <button
                onClick={openAddTurfModal}
                className="px-4 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" /> Add New Turf
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myTurfs.map((turf) => (
                <div key={turf.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg">
                  <div className="relative h-44 bg-[#07130c]">
                            <img src={turf.photos[0] || 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85'} alt={turf.name} className="w-full h-full object-cover" />
                    <span
                      className={`absolute top-3 left-3 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                        turf.status === 'active'
                          ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                          : turf.status === 'pending_review'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                          : 'bg-rose-950/80 text-rose-300 border-rose-800/40'
                      }`}
                    >
                      {turf.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white">{turf.name}</h3>
                      <p className="text-xs text-white/60 mt-1">{turf.address}</p>
                      {turf.correctionMessage && turf.status === 'pending_review' && (
                        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Admin requested corrections</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-amber-50">{turf.correctionMessage}</p>
                          <button type="button" onClick={() => openEditTurfModal(turf)} className="mt-2 text-[11px] font-bold text-[#C8FF5E] hover:underline">
                            Edit this listing
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 mt-3">
                        {turf.sportTypes.map((s) => (
                          <span key={s} className="text-[10px] bg-[#07130c] border border-white/10 px-2 py-0.5 rounded-full text-white/70">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-white/50">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Cancel cutoff: {turf.cancellationCutoffHours ?? 3}h before start</span>
                    </div>

                    {!turfHasWeeklySlots(turf) && (
                      <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
                        <p className="text-[11px] leading-relaxed text-amber-100/80">Create and save weekly time slots before players can see this turf.</p>
                        <button type="button" onClick={() => { setSlotTurfId(turf.id); setOwnerActiveTab('slots'); setIsScheduleExpanded(true); }} className="mt-2 text-[11px] font-bold text-[#C8FF5E] hover:underline">Configure availability</button>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs flex-wrap gap-2">
                      <div>
                        <span className="text-white/60">Base Price:</span>{' '}
                        <span className="font-black text-[#C8FF5E]">৳{turf.basePricePerHour}/hr</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openEditTurfModal(turf)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => {
                            setDeleteTurfError('');
                            setTurfPendingDelete(turf);
                          }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>

                        <button
                          onClick={() => {
                            setSelectedTurfForAddonsId(turf.id);
                            setShowAddonsModal(true);
                          }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-xl border border-[#C8FF5E]/40 text-[#C8FF5E] hover:bg-[#C8FF5E]/10 transition-colors cursor-pointer"
                        >
                          Add-ons
                        </button>

                        <button
                          onClick={() => {
                            const nextStatus = turf.status === 'active' ? 'inactive' : 'active';
                            updateTurf(turf.id, { status: nextStatus });
                          }}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-xl border transition-colors cursor-pointer ${
                            turf.status === 'active'
                              ? 'border-white/15 text-white/60 hover:text-white hover:bg-white/[0.05]'
                              : 'border-[#C8FF5E] text-[#C8FF5E] hover:bg-[#C8FF5E]/10'
                          }`}
                        >
                          {turf.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SLOTS & SCHEDULE MANAGEMENT */}
        {activeTab === 'slots' && (
          <div className="space-y-4">
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0A1E14] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] sm:items-end sm:p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#C8FF5E]">Availability</p>
                <h2 className="mt-1 text-base font-bold text-white">Slots & Weekly Schedule</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/60">Set recurring one-hour availability, adjust hourly rates, and review the selected date’s slots.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="block font-semibold text-white/65">Turf</span>
                <select
                  value={slotTurfId}
                  onChange={(e) => setSlotTurfId(e.target.value)}
                    disabled={myTurfs.length === 0}
                    className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-white outline-none focus:border-[#C8FF5E] disabled:opacity-50"
                >
                    <option value="">Select a turf</option>
                  {myTurfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                </label>
                <label className="space-y-1.5">
                  <span className="block font-semibold text-white/65">Availability date</span>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-white outline-none focus:border-[#C8FF5E]"
                />
                </label>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0A1E14]">
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Weekly availability</h3>
                    <p className="mt-1 text-[11px] text-white/55">Choose a weekday to view or edit its recurring slots.</p>
                  </div>
                  <button type="button" aria-expanded={isScheduleExpanded} onClick={() => setIsScheduleExpanded((expanded) => !expanded)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white/75 hover:border-[#C8FF5E]/40 hover:text-white">
                    {isScheduleExpanded ? 'Hide editor' : 'Edit schedule'}
                    <ChevronDown className={`h-3.5 w-3.5 text-[#C8FF5E] transition-transform ${isScheduleExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Choose schedule weekday">
                  {turfWeekdays.map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={scheduleDay === day}
                      onClick={() => setScheduleDay(day)}
                      className={`rounded-xl border px-2 py-2.5 text-xs font-semibold capitalize transition-colors ${scheduleDay === day ? 'border-[#C8FF5E]/60 bg-[#C8FF5E]/10 text-[#C8FF5E]' : 'border-white/10 bg-[#07130c] text-white/65 hover:border-white/25 hover:text-white'}`}
                    >
                      <span className="sm:hidden">{day.slice(0, 3)}</span>
                      <span className="hidden sm:inline">{day}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px]">
                  <span className="font-semibold capitalize text-white">{scheduleDay}</span>
                  <span className="text-white/55">{scheduleSlots.length} {scheduleSlots.length === 1 ? 'slot' : 'slots'} configured</span>
                </div>
              </div>

              {isScheduleExpanded && <div className="border-t border-white/10 p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Time slots for {scheduleDay}</h4>
                    <p className="mt-1 text-[11px] text-white/50">Each slot is one hour. Times may start on the hour or half-hour.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const startTime = slotTimeOptions.filter((time) => time !== '24:00').find((time) => {
                        const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
                        return start + 60 <= 1440 && scheduleSlots.every((slot) => {
                          const existingStart = Number(slot.startTime.slice(0, 2)) * 60 + Number(slot.startTime.slice(3));
                          const existingEnd = slot.endTime === '24:00' ? 1440 : Number(slot.endTime.slice(0, 2)) * 60 + Number(slot.endTime.slice(3));
                          return start + 60 <= existingStart || start >= existingEnd;
                        });
                      });
                      if (startTime) {
                        const endMinute = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + 60;
                        const endTime = endMinute === 1440 ? '24:00' : `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`;
                        setScheduleSlots((previous) => [...previous, { startTime, endTime }].sort((a, b) => a.startTime.localeCompare(b.startTime)));
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#C8FF5E] px-3 py-2.5 text-xs font-bold text-[#0A1E14] hover:bg-[#A8E63E]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add slot
                  </button>
                </div>

                {scheduleSlots.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scheduleSlots.map((slot, index) => (
                      <div key={`${index}-${slot.startTime}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/10 bg-[#07130c] p-2.5">
                        <select aria-label="Slot start time" value={slot.startTime} onChange={(event) => setScheduleSlots((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item).sort((a, b) => a.startTime.localeCompare(b.startTime)))} className="min-w-0 rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white">
                          {slotTimeOptions.slice(0, -1).map((time) => <option key={time} value={time}>{formatBDTime(time)}</option>)}
                        </select>
                        <span className="text-[10px] text-white/40">to</span>
                        <select aria-label="Slot end time" value={slot.endTime} onChange={(event) => setScheduleSlots((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item))} className="min-w-0 rounded-lg border border-white/10 bg-[#0A1E14] px-2 py-2 text-xs text-white">
                          {slotTimeOptions.map((time) => <option key={time} value={time}>{formatBDTime(time)}</option>)}
                        </select>
                        <button type="button" aria-label="Remove slot" onClick={() => setScheduleSlots((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-white/50 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-xs text-white/45">No slots configured for {scheduleDay}. Add a time to make this weekday available.</p>
                )}

                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  {scheduleMessage && <p className={`text-xs ${scheduleMessage.includes('saved') ? 'text-[#C8FF5E]' : 'text-rose-300'}`}>{scheduleMessage}</p>}
                  {!selectedScheduleTurf && <p className="text-xs text-amber-300">Select an owned turf before saving this schedule.</p>}
                  <button type="button" onClick={() => void handleSaveWeeklySchedule()} disabled={!selectedScheduleTurf} className="rounded-xl bg-[#C8FF5E] px-4 py-2.5 text-xs font-bold text-[#0A1E14] hover:bg-[#A8E63E] disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto">Save {scheduleDay} schedule</button>
                </div>
              </div>}
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-[#0A1E14] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Pricing rules</h3>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55">Set a rate for a weekday shift or an exact date. Special-date rates take priority, then weekday rates, then the base rate.</p>
                </div>
                {selectedScheduleTurf && <span className="rounded-lg border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] text-white/65">Base rate <strong className="ml-1 text-[#C8FF5E]">৳{selectedScheduleTurf.basePricePerHour.toLocaleString()}/hr</strong></span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">Rule type</span>
                  <select aria-label="Pricing rule type" value={pricingRuleMode} onChange={(event) => setPricingRuleMode(event.target.value as 'weekly' | 'date')} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white">
                    <option value="weekly">Weekly shift</option><option value="date">Special date</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">{pricingRuleMode === 'weekly' ? 'Weekday' : 'Date'}</span>
                  {pricingRuleMode === 'weekly' ? (
                    <select aria-label="Pricing weekday" value={pricingRuleDay} onChange={(event) => setPricingRuleDay(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white">
                      {turfWeekdays.map((day, index) => <option key={day} value={index}>{day[0].toUpperCase() + day.slice(1)}</option>)}
                    </select>
                  ) : (
                    <input aria-label="Special pricing date" type="date" value={pricingRuleDate} onChange={(event) => setPricingRuleDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white" />
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">Shift label</span>
                  <input aria-label="Shift label" list="pricing-shift-labels" maxLength={60} value={pricingRuleLabel} onChange={(event) => setPricingRuleLabel(event.target.value)} placeholder="e.g. Evening" className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white placeholder-white/35" />
                </label>
                <datalist id="pricing-shift-labels"><option value="Morning" /><option value="Afternoon" /><option value="Evening" /><option value="Night" /><option value="Midnight" /></datalist>
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">Start time</span>
                  <select aria-label="Pricing start time" value={pricingRuleStart} onChange={(event) => setPricingRuleStart(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white">{slotTimeOptions.filter((time) => time !== '24:00').map((time) => <option key={time} value={time}>{formatBDTime(time)}</option>)}</select>
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">End time</span>
                  <select aria-label="Pricing end time" value={pricingRuleEnd} onChange={(event) => setPricingRuleEnd(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white">{slotTimeOptions.filter((time) => time !== '00:00').map((time) => <option key={time} value={time}>{formatBDTime(time)}</option>)}</select>
                </label>
                <label className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-white/65">Price per hour (৳)</span>
                  <input aria-label="Shift price per hour" type="number" min="1" step="0.01" value={pricingRulePrice} onChange={(event) => setPricingRulePrice(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-[#07130c] px-3 py-2.5 text-xs text-white" />
                </label>
              </div>
              {pricingRuleGroups.length > 0 && <div className="space-y-2">{pricingRuleGroups.map((group) => <div key={`${group.schedule}-${group.label}`} className="rounded-xl border border-white/10 bg-[#07130c] p-3"><p className="mb-2 text-xs font-bold text-white">{group.label} <span className="font-normal capitalize text-white/50">· {group.schedule}</span></p><div className="flex flex-wrap gap-2">{group.rules.map((rule) => <span key={rule.id} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#0A1E14] px-2.5 py-1.5 text-[11px] text-white/80">{formatBDTime(rule.startTime)}–{formatBDTime(rule.endTime)} · ৳{rule.pricePerHour}/hr<button type="button" aria-label={`Remove ${group.label} price range`} onClick={() => setSchedulePricingRules((rules) => rules.filter((item) => item.id !== rule.id))} className="font-bold text-rose-300">×</button></span>)}</div></div>)}</div>}
              <div className="flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                {pricingMessage && <p role="status" className={`text-xs ${pricingMessage.includes('saved') ? 'text-[#C8FF5E]' : 'text-rose-300'}`}>{pricingMessage}</p>}
                {!selectedScheduleTurf && <p className="text-xs text-amber-300">Select an owned turf before saving prices.</p>}
                <div className="flex gap-2 sm:ml-auto">
                  <button type="button" onClick={addTurfPricingRule} disabled={!selectedScheduleTurf} className="rounded-xl border border-[#C8FF5E]/30 px-4 py-2.5 text-xs font-semibold text-[#C8FF5E] hover:bg-[#C8FF5E]/10 disabled:cursor-not-allowed disabled:opacity-40">Add rule</button>
                  <button type="button" onClick={() => void handleSavePricingRules()} disabled={!selectedScheduleTurf} className="rounded-xl bg-[#C8FF5E] px-4 py-2.5 text-xs font-bold text-[#0A1E14] disabled:cursor-not-allowed disabled:opacity-40">Save pricing</button>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0A1E14]">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Slots for {formatBDDate(slotDate)}</h3>
                  <p className="mt-1 text-[11px] text-white/55">{selectedScheduleTurf?.name || 'Select a turf'} · {selectedDateSlots.length} total</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                  <span className="rounded-lg border border-[#C8FF5E]/25 bg-[#C8FF5E]/5 px-2.5 py-1.5 text-[#C8FF5E]">Available {selectedDateSlotCounts.available}</span>
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-white/70">Booked {selectedDateSlotCounts.booked}</span>
                  <span className="rounded-lg border border-rose-500/25 bg-rose-500/5 px-2.5 py-1.5 text-rose-300">Blocked {selectedDateSlotCounts.blocked}</span>
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-white/45">Past {selectedDateSlotCounts.past}</span>
                </div>
              </div>

              {selectedDateSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 sm:p-5">
              {selectedDateSlots.map((slot) => {
                  const isAvailable = slot.status === 'available';
                  const isBlocked = slot.status === 'blocked';
                  const isBooked = slot.status === 'booked' || slot.status === 'locked';
                  const isPast = isSlotInPast(slot.date, slot.startTime);

                  return (
                    <div
                      key={slot.id}
                      className={`min-h-32 rounded-xl border p-3.5 flex flex-col justify-between transition-colors ${
                        isAvailable
                          ? 'bg-[#0A1E14] border-white/10 text-white'
                          : isBlocked
                          ? 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                          : 'bg-[#0e271a]/50 border-white/10 text-white/50'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">
                          {formatBDTimeRange(slot.startTime, slot.endTime)}
                        </div>
                        <div className="text-[11px] text-[#C8FF5E] font-bold mt-1">৳{slot.price}</div>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider mt-2 inline-block px-2 py-0.5 rounded-full border ${
                            isPast
                              ? 'bg-white/5 text-white/45 border-white/10'
                              : isAvailable
                              ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                              : isBlocked
                              ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                              : 'bg-white/10 text-white/50 border-white/10'
                          }`}
                        >
                          {isPast ? 'Past time' : slot.status}
                        </span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/10">
                        {isPast ? (
                          <span className="text-[10px] text-white/40">Past time</span>
                        ) : isBooked ? (
                          <span className="text-[10px] text-white/40">Booked</span>
                        ) : isBlocked ? (
                          <button
                            onClick={() => void toggleSlotBlock(slot.id)}
                            className="w-full py-1 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1 bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40 hover:bg-[#C8FF5E]/20"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Unblock</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setMbTurfId(slot.turfId);
                              setMbDate(slot.date);
                              setMbSlotId(slot.id);
                              setShowManualBookingModal(true);
                            }}
                            className="w-full py-1 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1 bg-rose-950/50 text-rose-300 border border-rose-800/40 hover:bg-rose-900/60"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Create Manual Booking</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-white">No availability for this date</p>
                  <p className="mt-1 text-xs text-white/50">Add slots to the matching weekday schedule above, then save it to generate availability.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: STAFF MANAGEMENT */}
        {activeTab === 'staff' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Delegated Staff Accounts</h2>
                <p className="text-xs text-white/60">
                  Staff accounts have operational rights on assigned turfs. They CANNOT see earnings, wallets or request withdrawals.
                </p>
              </div>
              <button
                onClick={() => setShowAddStaffModal(true)}
                className="px-4 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" /> Add Staff Member
              </button>
            </div>

            {pendingSetupStaffCount > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">Account Setup</p>
                  <h3 className="mt-1 text-sm font-bold text-white">
                    {pendingSetupStaffCount} staff account{pendingSetupStaffCount > 1 ? 's are' : ' is'} waiting for setup
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStaffSetupPreview(myStaff.find((staff) => staff.status === 'pending_setup') || null)}
                  className="px-3 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-[11px] rounded-xl cursor-pointer transition-colors"
                >
                  Review Invite
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myStaff.map((staff) => (
                <div key={staff.id} className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white text-base">{staff.staffName}</h4>
                      <p className="text-xs text-white/60">{staff.staffEmail} • {staff.staffPhone}</p>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border ${
                        staff.status === 'pending_setup'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-400/30'
                          : 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                      }`}
                    >
                      {staff.status === 'pending_setup' ? 'Pending setup' : 'Staff scoped'}
                    </span>
                  </div>

                  <div>
                    <div className="text-[10px] text-white/60 font-bold uppercase mb-1">Assigned Turf(s):</div>
                    <div className="flex flex-wrap gap-1">
                      {staff.turfIds.map((tid) => {
                        const t = turfs.find((x) => x.id === tid);
                        return (
                          <span key={tid} className="text-[11px] bg-[#07130c] text-white/80 px-2.5 py-0.5 rounded-full border border-white/10">
                            {t?.name || tid}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <div className="text-[10px] text-white/60">
                      {staff.status === 'pending_setup' ? (
                        <>
                          Invite sent{' '}
                          {staff.invitedAt ? formatBDDate(staff.invitedAt) : 'recently'}
                        </>
                      ) : (
                        'Account active'
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowStaffSetupPreview(staff)}
                      className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-[10px] font-bold text-white/80 hover:bg-white/[0.08] cursor-pointer transition-colors"
                    >
                      View setup screen
                    </button>
                  </div>

                  <div>
                    <div className="text-[10px] text-white/60 font-bold uppercase mb-1">Assigned Permissions:</div>
                    <div className="flex flex-wrap gap-1">
                      {staff.permissions.map((perm) => (
                        <span key={perm} className="text-[10px] bg-[#0e271a] text-[#C8FF5E] px-2 py-0.5 rounded-full border border-[#C8FF5E]/30">
                          {perm.replace('bookings.', '').replace('slots.', '')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {myStaff.length === 0 && (
                <div className="col-span-full text-center py-12 bg-[#0A1E14] border border-white/10 rounded-2xl text-white/50 text-xs">
                  No staff members created yet. Delegate check-ins and counter bookings to your team members!
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: WALLET & WITHDRAWALS */}
        {activeTab === 'wallet' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Owner Wallet & Payouts</h2>
                <p className="text-xs text-white/60">Available earnings are net of platform commission. Minimum withdrawal: ৳{settings.minWithdrawalAmount}.</p>
              </div>

              <button
                disabled={myWallet.availableBalance < settings.minWithdrawalAmount}
                onClick={() => setShowWithdrawModal(true)}
                className="px-4 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:opacity-40 text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <DollarSign className="w-4 h-4" /> Request Payout
              </button>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="text-xs text-white/60">Ready for Withdrawal</div>
                <div className="text-2xl font-black text-[#C8FF5E] mt-1">
                  ৳{myWallet.availableBalance.toLocaleString()}
                </div>
                <p className="text-[11px] text-white/50 mt-1">From matches past cancellation window</p>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="text-xs text-white/60">Held in Active Policy Window</div>
                <div className="text-2xl font-black text-amber-400 mt-1">
                  ৳{myWallet.heldBalance.toLocaleString()}
                </div>
                <p className="text-[11px] text-white/50 mt-1">Held until match end / window expiry</p>
              </div>

              <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg">
                <div className="text-xs text-white/60">Total Paid Out to Date</div>
                <div className="text-2xl font-black text-white mt-1">
                  ৳{myWallet.totalWithdrawn.toLocaleString()}
                </div>
                <p className="text-[11px] text-white/50 mt-1">Approved & transferred payouts</p>
              </div>
            </div>

            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white">Payout Details</h3>
                  <p className="text-[11px] text-white/60 mt-1">
                    Approved withdrawal requests are transferred to this account via online payment.
                  </p>
                </div>
                {!isEditingPayout && (
                  <button
                    type="button"
                    onClick={openEditPayoutForm}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#C8FF5E]/40 text-[#C8FF5E] hover:bg-[#C8FF5E]/10 transition-colors cursor-pointer"
                  >
                    {profile?.payoutDetails.accountNumber ? 'Edit' : 'Add Payout Info'}
                  </button>
                )}
              </div>

              {!isEditingPayout ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-white/60">Method</div>
                    <div className="mt-1 font-bold text-white uppercase">{profile?.payoutMethod?.replace('_', ' ') || 'Not set'}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-white/60">Account / Wallet Number</div>
                    <div className="mt-1 font-bold text-white">{profile?.payoutDetails.accountNumber || 'Not set'}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-white/60">Bank / Holder</div>
                    <div className="mt-1 font-bold text-white">
                      {profile?.payoutDetails.bankName
                        ? `${profile.payoutDetails.bankName}${profile.payoutDetails.branchName ? ` (${profile.payoutDetails.branchName})` : ''}`
                        : profile?.payoutDetails.accountHolderName || '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSavePayoutDetails} className="space-y-3 text-xs">
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Payout Method:</label>
                    <select
                      value={payoutFormMethod}
                      onChange={(e) => setPayoutFormMethod(e.target.value as typeof payoutFormMethod)}
                      className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                    >
                      <option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option>
                      <option value="rocket">Rocket</option>
                      <option value="bank_account">Bank Account</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">
                      {payoutFormMethod === 'bank_account' ? 'Bank Account Number:' : 'Wallet Number:'}
                    </label>
                    <input
                      type="text"
                      value={payoutFormAccountNumber}
                      onChange={(e) => setPayoutFormAccountNumber(e.target.value)}
                      placeholder={payoutFormMethod === 'bank_account' ? 'e.g. 20501234567890' : 'e.g. 01819-223344'}
                      className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Account Holder Name:</label>
                    <input
                      type="text"
                      value={payoutFormAccountHolder}
                      onChange={(e) => setPayoutFormAccountHolder(e.target.value)}
                      placeholder="Full name as registered"
                      className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                    />
                  </div>

                  {payoutFormMethod === 'bank_account' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-white/80 font-semibold mb-1 block">Bank Name:</label>
                        <input
                          type="text"
                          value={payoutFormBankName}
                          onChange={(e) => setPayoutFormBankName(e.target.value)}
                          className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-white/80 font-semibold mb-1 block">Branch Name:</label>
                        <input
                          type="text"
                          value={payoutFormBranchName}
                          onChange={(e) => setPayoutFormBranchName(e.target.value)}
                          className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {payoutFormMessage && (
                    <div className="p-2.5 rounded-xl border border-[#C8FF5E]/30 bg-[#C8FF5E]/10 text-[11px] text-[#C8FF5E]">
                      {payoutFormMessage}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingPayout(false)}
                      className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                    >
                      Save Payout Details
                    </button>
                  </div>
                </form>
              )}
            </div>

                        <div className="bg-[#0A1E14] border border-white/10 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white">Featured Turf Listing</h3>
                  <p className="text-[11px] text-white/60 mt-1">
                    Global flag:{' '}
                    {settings.featureFlags?.featured_turf_enabled ? (
                      <span className="text-[#C8FF5E] font-bold">Enabled</span>
                    ) : (
                      <span className="text-rose-300 font-bold">Disabled by admin</span>
                    )}
                  </p>
                </div>
                <span className="rounded-full border border-[#C8FF5E]/40 bg-[#C8FF5E]/10 px-2.5 py-1 text-[10px] font-bold text-[#C8FF5E] uppercase">
                  SSLCommerz checkout
                </span>
              </div>

              {!settings.featureFlags?.featured_turf_enabled ? (
                <p className="text-xs text-white/50">Featured listings are turned off by the platform admin.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(settings.featuredPackages || []).map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setSelectedFeaturedPackageId(pkg.id)}
                        className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                          selectedFeaturedPackage?.id === pkg.id
                            ? 'border-[#C8FF5E]/50 bg-[#C8FF5E]/10 shadow-md shadow-[#C8FF5E]/10'
                            : 'border-white/10 bg-[#07130c] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{pkg.name}</span>
                          <span className="text-[10px] font-bold text-[#C8FF5E]">Priority {pkg.priority}</span>
                        </div>
                        <div className="mt-2 text-xl font-black text-[#C8FF5E]">৳{pkg.price.toLocaleString()}</div>
                        <div className="mt-1 text-[11px] text-white/60">
                          {pkg.durationDays} days • {pkg.description}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedFeaturedPackage && (
                    <div className="rounded-xl border border-white/10 bg-[#07130c] p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-white/60 font-bold uppercase tracking-wider mb-1 block">
                            Select Turf to Feature
                          </label>
                          <select
                            value={featuredTurfId || myTurfs[0]?.id || ''}
                            onChange={(e) => setFeaturedTurfId(e.target.value)}
                            className="w-full bg-[#0A1E14] border border-white/15 rounded-xl p-2.5 text-xs text-white focus:border-[#C8FF5E] outline-none"
                          >
                            {myTurfs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.isFeatured ? '(Already Featured)' : ''} — {t.status}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
                          <div className="text-white/60">Package total</div>
                          <div className="mt-1 text-lg font-black text-[#C8FF5E]">
                            ৳{selectedFeaturedPackage.price.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-white/50 mt-0.5">
                            {selectedFeaturedPackage.durationDays} days · Priority {selectedFeaturedPackage.priority}
                          </div>
                        </div>
                      </div>

                      <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#07130c] p-3 text-xs text-white/70">
                        <input type="checkbox" checked={applyFeaturedCredits} onChange={(event) => setApplyFeaturedCredits(event.target.checked)} className="mt-0.5 accent-[#C8FF5E]" />
                        <span>
                          Apply my available platform credits (৳{availableFeaturedCredit.toFixed(2)}).
                          {selectedFeaturedPackage.price > availableFeaturedCredit && ` Estimated checkout amount: ৳${(selectedFeaturedPackage.price - availableFeaturedCredit).toFixed(2)} plus gateway fee.`}
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={async () => {
                          const res = await requestFeaturedListing({
                            turfId: featuredTurfId || myTurfs[0]?.id || '',
                            packageId: selectedFeaturedPackage.id,
                            applyCredits: applyFeaturedCredits,
                          });
                          setFeaturedMsg(res.message);
                          if (res.success && res.checkoutUrl) window.location.assign(res.checkoutUrl);
                          if (res.success) setApplyFeaturedCredits(false);
                        }}
                        className="w-full py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                      >
                        Purchase Featured Listing
                      </button>

                      {featuredMsg && (
                        <div className="p-2.5 rounded-xl bg-[#0e271a] border border-[#C8FF5E]/30 text-[11px] text-[#C8FF5E] font-semibold">
                          {featuredMsg}
                        </div>
                      )}
                    </div>
                  )}

                  {myFeaturedRequests.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                        My Featured Requests
                      </div>
                      {myFeaturedRequests.map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#07130c] p-3 text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">
                              {r.turfName} · {r.packageName}
                            </div>
                            <div className="text-white/50 mt-0.5">
                              ৳{r.amount.toLocaleString()} · {r.durationDays}d · Cash ৳{Number(r.cashPaid || 0).toFixed(2)} · Credits ৳{Number(r.creditApplied || 0).toFixed(2)}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border w-fit ${
                              r.status === 'active' || r.status === 'approved'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : r.status === 'pending_approval'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                : r.status === 'rejected'
                                ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                                : 'bg-white/5 text-white/70 border-white/15'
                            }`}
                          >
                            {r.status.replace('_', ' ')}
                          </span>
                          {(r.status === 'active' || r.status === 'approved' || r.status === 'pending_approval') && (
                            <button
                              type="button"
                              onClick={async () => {
                                const reason = (await showAppPrompt('Reason for cancelling this featured listing:', 'No longer required'))?.trim();
                                if (!reason) return;
                                const result = await cancelFeaturedListing(r.id, reason);
                                setFeaturedMsg(result.message);
                                if (result.success) setAvailableFeaturedCredit((current) => current + Number(result.creditIssued || 0));
                              }}
                              className="w-fit rounded-lg border border-rose-500/40 px-2.5 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-950/30"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Withdrawal Requests Table */}
            <div className="bg-[#0A1E14] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-white">Payout History & Requests</h3>
                <div className="relative w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    type="search"
                    value={payoutSearchQuery}
                    onChange={(event) => {
                      setPayoutSearchQuery(event.target.value);
                      setPayoutPage(1);
                    }}
                    placeholder="Search payout requests..."
                    aria-label="Search payout requests"
                    className="w-full rounded-xl border border-white/10 bg-[#07130c] py-2 pl-9 pr-3 text-xs text-white placeholder-white/40 outline-none focus:border-[#C8FF5E]"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-[#0e271a] text-white/60 uppercase font-bold text-[10px] border-b border-white/10">
                    <tr>
                      <th className="py-3 px-4">Request ID</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Method & Account</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Admin Reference / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {paginatedWithdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">{w.id}</td>
                        <td className="py-3 px-4 font-black text-[#C8FF5E] text-sm">৳{w.amount.toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <div className="text-white font-medium">{w.payoutMethod}</div>
                          <div className="text-[11px] text-white/60">{w.payoutDetails}</div>
                        </td>
                        <td className="py-3 px-4 text-white/60">{formatBDDate(w.createdAt)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              w.status === 'paid'
                                ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                                : w.status === 'pending'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-white/60">
                          {w.reference || w.rejectionReason || 'Under review'}
                        </td>
                      </tr>
                    ))}
                    {filteredWithdrawals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-white/50 text-xs">
                          {myWithdrawals.length === 0 ? 'No payout requests yet.' : 'No payout requests match your search.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#0e271a] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPayoutPage((page) => Math.max(1, page - 1))}
                  disabled={payoutPage === 1}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <div className="text-[11px] text-white/60">
                  {filteredWithdrawals.length === 0 ? '0 requests' : `${filteredWithdrawals.length} requests · Page ${payoutPage} of ${payoutPageCount}`}
                </div>
                <button
                  type="button"
                  onClick={() => setPayoutPage((page) => Math.min(payoutPageCount, page + 1))}
                  disabled={payoutPage >= payoutPageCount}
                  className="rounded-xl border border-white/10 bg-[#07130c] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: TOURNAMENTS (SECTION 50)                                           */}
        {/* ========================================================================= */}
        {activeTab === 'tournaments' && settings.featureFlags?.tournament_enabled && (
          <div className="mt-6">
            <TournamentsView />
          </div>
        )}
      </div>

      {/* MODAL 1: MANUAL / OFFLINE BOOKING (SECTION 7.4) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-6xl max-h-[94vh] rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col min-h-0">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-[#C8FF5E]" /> New Manual / Offline Booking
                </h3>
                <p className="text-[11px] text-white/60">Direct booking at counter or phone. 0 TK Gateway fee!</p>
              </div>
              <button onClick={closeManualModal} className="text-white/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualBookingSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Select Turf:</label>
                <select
                  value={mbTurfId}
                  onChange={(e) => {
                    setMbTurfId(e.target.value);
                    setMbSlotId('');
                  }}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  required
                >
                  {myTurfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (৳{t.basePricePerHour}/hr)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Booking Date:</label>
                <input
                  type="date"
                  min={getBDDateString()}
                  value={mbDate}
                  onChange={(e) => { setMbDate(e.target.value); setMbSlotId(''); }}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Select Open Slot:</label>
                <select
                  value={mbSlotId}
                  onChange={(e) => setMbSlotId(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  required
                >
                  <option value="">-- Choose Slot --</option>
                  {availableSlotsForManual.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} | {formatBDTimeRange(s.startTime, s.endTime)} (৳{s.price})
                    </option>
                  ))}
                </select>
                {availableSlotsForManual.length === 0 && (
                  <p className="text-[11px] text-amber-300 mt-1">No available slots for this turf. Generate slots first.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Customer Name:</label>
                  <input
                    type="text"
                    value={mbCustomerName}
                    onChange={(e) => setMbCustomerName(e.target.value)}
                    placeholder="e.g. Captain Nayeem"
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                    required
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Customer Phone:</label>
                  <input
                    type="tel"
                    value={mbCustomerPhone}
                    onChange={(e) => setMbCustomerPhone(e.target.value)}
                    placeholder="e.g. +880 1711-223344"
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Payment Method:</label>
                  <select
                    value={mbPaymentMethod}
                    onChange={(e) => setMbPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    <option value="cash">Cash (In-person)</option>
                    <option value="bkash">bKash (Direct/Manual)</option>
                    <option value="nagad">Nagad (Direct/Manual)</option>
                    <option value="rocket">Rocket (Direct/Manual)</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Payment Status:</label>
                  <select
                    value={mbPaymentStatus}
                    onChange={(e) => setMbPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    <option value="paid">Paid Full</option>
                    <option value="pending">Pending Collection</option>
                    <option value="partial">Partial Advance</option>
                  </select>
                </div>
              </div>

              {mbPaymentStatus === 'partial' && (
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Amount received (BDT):</label>
                  <input type="number" min="0.01" step="0.01" value={mbPaymentAmount} onChange={(e) => setMbPaymentAmount(e.target.value)} required className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none" />
                </div>
              )}

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Payment Ref / Receipt # (optional):</label>
                <input
                  type="text"
                  value={mbReference}
                  onChange={(e) => setMbReference(e.target.value)}
                  placeholder="e.g. CASH-REC-2041 or bKash TrxID"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Notes (optional):</label>
                <input
                  type="text"
                  value={mbNotes}
                  onChange={(e) => setMbNotes(e.target.value)}
                  placeholder="e.g. Needs referee + bibs"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                />
              </div>

              {/* Fee Notice */}
              <div className="p-3 bg-[#0e271a] border border-[#C8FF5E]/30 rounded-xl text-[11px] text-[#C8FF5E]">
                <strong>Pricing Rules:</strong> Manual bookings do not use an online payment gateway, so the gateway fee is ৳0.
                {profile?.billingModel === 'monthly_subscription' ? ' Your monthly subscription plan has no booking platform fee.' : settings.platformFeeEnabled === false ? ' The platform fee is currently disabled.' : ` The current platform fee rate is ${settings.platformFeeRate}%.`}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualBookingModal(false)}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mbSlotId}
                  className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:opacity-40 text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                >
                  Confirm Manual Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD TURF */}
      {showAddTurfModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-6xl max-h-[94vh] rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col min-h-0">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">{editingTurfId ? 'Edit Turf Details' : 'Add New Sports Ground / Turf'}</h3>
              <button
                onClick={() => {
                  setShowAddTurfModal(false);
                  setEditingTurfId(null);
                }}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTurfSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs overflow-y-auto min-h-0 pr-1">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Turf Name:</label>
                <input
                  type="text"
                  value={newTurfName}
                  onChange={(e) => setNewTurfName(e.target.value)}
                  placeholder="e.g. Uttara Kickoff Arena"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Address / Location:</label>
                <input
                  type="text"
                  value={newTurfAddress}
                  onChange={(e) => setNewTurfAddress(e.target.value)}
                  placeholder="e.g. Sector 7, Uttara, Dhaka"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Area:</label>
                  <input
                    type="text"
                    value={newTurfArea}
                    onChange={(e) => setNewTurfArea(e.target.value)}
                    placeholder="Enter area (e.g. Uttara)"
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">City:</label>
                  <input
                    type="text"
                    value={newTurfCity}
                    onChange={(e) => setNewTurfCity(e.target.value)}
                    placeholder="Enter city (e.g. Chittagong)"
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Hourly Base Price (BDT):</label>
                  <input
                    type="number"
                    value={newTurfPrice}
                    onChange={(e) => setNewTurfPrice(Number(e.target.value))}
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none font-bold"
                    required
                  />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Turf Location:</label>
                <p className="mb-2 text-xs text-white/55">Click the map or drag the marker to set the turf’s exact location.</p>
                <TurfMap
                  latitude={Number(newTurfLatitude) || 0}
                  longitude={Number(newTurfLongitude) || 0}
                  editable
                  onLocationChange={(latitude, longitude) => {
                    setNewTurfLatitude(String(latitude));
                    setNewTurfLongitude(String(longitude));
                  }}
                  className="h-48 sm:h-56"
                />
                <p className="mt-1 text-xs text-white/45">{(Number(newTurfLatitude) || 0).toFixed(5)}, {(Number(newTurfLongitude) || 0).toFixed(5)}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-white/70">Latitude</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newTurfLatitude}
                      onChange={(event) => setNewTurfLatitude(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#07130c] p-2.5 text-white outline-none focus:border-[#C8FF5E]"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/70">Longitude</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newTurfLongitude}
                      onChange={(event) => setNewTurfLongitude(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#07130c] p-2.5 text-white outline-none focus:border-[#C8FF5E]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-white/80 font-semibold mb-1 block">Turf Photos (up to 5):</label>
                <input
                  ref={turfPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []) as File[];
                    if (files.length > 5) {
                      setTurfPhotoError('Choose no more than five images.');
                      setSelectedTurfPhotos([]);
                      setSelectedTurfPhotoPreviews([]);
                      event.target.value = '';
                      return;
                    }
                    const invalid = files.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024);
                    if (invalid) {
                      setTurfPhotoError(`${invalid.name} must be a JPEG, PNG, or WEBP image no larger than 10 MB.`);
                      setSelectedTurfPhotos([]);
                      setSelectedTurfPhotoPreviews([]);
                      event.target.value = '';
                      return;
                    }
                    setTurfPhotoError('');
                    setSelectedTurfPhotos(files);
                    setSelectedTurfPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
                  }}
                  className="block w-full rounded-xl border border-white/10 bg-[#07130c] p-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#C8FF5E] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#0A1E14]"
                />
                <p className="mt-1 text-xs text-white/50">
                  {selectedTurfPhotos.length ? 'These images will replace the current turf photos.' : 'JPEG, PNG, or WEBP; maximum 10 MB each. Selecting photos replaces the current set.'}
                </p>
                {turfPhotoError && <p className="mt-1 text-xs text-rose-300">{turfPhotoError}</p>}
                {(selectedTurfPhotoPreviews.length ? selectedTurfPhotoPreviews : savedTurfPhotos).length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(selectedTurfPhotoPreviews.length ? selectedTurfPhotoPreviews : savedTurfPhotos).map((photo, index) => (
                      <img key={`${photo}-${index}`} src={photo} alt={`Turf photo ${index + 1}`} className="h-20 w-full rounded-lg object-cover" />
                    ))}
                  </div>
                )}
                {selectedTurfPhotos.length > 0 && (
                  <button type="button" onClick={() => { setSelectedTurfPhotos([]); setSelectedTurfPhotoPreviews([]); if (turfPhotoInputRef.current) turfPhotoInputRef.current.value = ''; }} className="mt-2 text-xs font-semibold text-[#C8FF5E] hover:underline">
                    {savedTurfPhotos.length ? 'Keep current photos' : 'Clear selected photos'}
                  </button>
                )}
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Sports Supported:</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[...new Set([...turfSportOptions, ...customSportOptions])].map((sport) => {
                    const selected = newTurfSports.includes(sport);
                    return (
                      <button
                        key={sport}
                        type="button"
                        onClick={() =>
                          setNewTurfSports((prev) =>
                            selected ? prev.filter((item) => item !== sport) : [...prev, sport]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#C8FF5E] text-[#0A1E14] border-[#C8FF5E]'
                            : 'bg-[#07130c] text-white/70 border-white/10 hover:text-white'
                        }`}
                      >
                        {sport}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input aria-label="Custom sport" value={customSportDraft} maxLength={60} onChange={(event) => setCustomSportDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomTurfValue('sport'); } }} placeholder="Add another sport" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07130c] p-2 text-xs text-white" />
                  <button type="button" onClick={() => addCustomTurfValue('sport')} className="rounded-lg border border-[#C8FF5E]/40 px-3 text-xs font-bold text-[#C8FF5E]">Add custom</button>
                </div>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Amenities:</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[...new Set([...turfAmenityOptions, ...customAmenityOptions])].map((amenity) => {
                    const selected = newTurfAmenities.includes(amenity);
  return (
                      <button
                        key={amenity}
                        type="button"
                        onClick={() =>
                          setNewTurfAmenities((prev) =>
                            selected ? prev.filter((item) => item !== amenity) : [...prev, amenity]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#0e271a] text-[#C8FF5E] border-[#C8FF5E]/40'
                            : 'bg-[#07130c] text-white/70 border-white/10 hover:text-white'
                        }`}
                      >
                        {amenity}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input aria-label="Custom amenity" value={customAmenityDraft} maxLength={60} onChange={(event) => setCustomAmenityDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomTurfValue('amenity'); } }} placeholder="Add another amenity" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07130c] p-2 text-xs text-white" />
                  <button type="button" onClick={() => addCustomTurfValue('amenity')} className="rounded-lg border border-[#C8FF5E]/40 px-3 text-xs font-bold text-[#C8FF5E]">Add custom</button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-white/80 font-semibold mb-1 block">Description:</label>
                <textarea
                  value={newTurfDesc}
                  onChange={(e) => setNewTurfDesc(e.target.value)}
                  placeholder="Pitch specifications, lighting quality, locker rooms..."
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Cancellation Cutoff (hours before slot start):</label>
                <input
                  type="number"
                  min={0}
                  max={72}
                  value={newTurfCancellationHours}
                  onChange={(e) => setNewTurfCancellationHours(Number(e.target.value))}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none font-bold"
                  required
                />
                <p className="text-[10px] text-white/50 mt-1">
                  Players cannot cancel a booking once fewer than this many hours remain before the slot starts.
                </p>
              </div>

              <div className="md:col-span-2 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-[11px] text-amber-300">
                {editingTurfId ? (
                  <>Updating core details keeps the turf's current approval status unchanged.</>
                ) : (
                  <>
                    New listings are submitted with <strong>pending_review</strong> status for Admin quality check before going live.
                  </>
                )}
              </div>

              <div className="md:col-span-2 flex gap-2 pt-2 pb-1 sticky bottom-0 bg-[#0A1E14]">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTurfModal(false);
                    setEditingTurfId(null);
                  }}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                >
                  {editingTurfId ? 'Save Changes' : 'Submit for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE TURF CONFIRMATION */}
      {turfPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-300">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Request removal of "{turfPendingDelete.name}"?</h3>
                <p className="text-[11px] text-white/60">The turf will be hidden immediately. An admin must review the request before permanent removal.</p>
              </div>
            </div>

            {deleteTurfError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-[11px] text-rose-300">
                {deleteTurfError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTurfPendingDelete(null);
                  setDeleteTurfError('');
                }}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTurf}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all text-xs"
              >
                Request Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TURF ADD-ONS (PROTOYPE UI) */}
      {showAddonsModal && selectedTurfForAddons && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-3xl rounded-2xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C8FF5E]">Add-on Manager</p>
                <h3 className="mt-1 font-bold text-sm text-white">Manage Add-ons for {selectedTurfForAddons.name}</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddonsModal(false);
                  setSelectedTurfForAddonsId(null);
                  setAddonName('');
                  setAddonDescription('');
                  setAddonCategory('equipment');
                  setAddonPrice(120);
                  setAddonStock(null);
                }}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-[#07130c] p-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 mb-3">Existing Add-ons</h4>

                  {addonError && <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-xs text-rose-200">{addonError}</div>}
                  {addonLoading ? (
                    <p className="text-xs text-white/50">Loading add-ons…</p>
                  ) : addonItems.length === 0 ? (
                    <p className="text-xs text-white/50">No add-ons configured for this turf yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {addonItems.map((addon) => (
                        <div key={addon.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white">{addon.name}</span>
                                <span className="text-[10px] font-bold uppercase tracking-[0.12em] bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40 rounded-full px-2 py-0.5">
                                  {addon.category}
                                </span>
                              </div>
                              {addon.description && <p className="text-[11px] text-white/60 mt-1">{addon.description}</p>}
                              <div className="mt-2 text-[11px] text-white/70 flex flex-wrap gap-2">
                                <span className="font-bold text-[#C8FF5E]">৳{addon.price}</span>
                                <span>•</span>
                                <span>{addon.stockQuantity === null ? 'Unlimited stock' : `${addon.stockQuantity} in stock`}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => { setEditingAddonId(addon.id); setAddonName(addon.name); setAddonDescription(addon.description || ''); setAddonCategory(addon.category); setAddonPrice(addon.price); setAddonStock(addon.stockQuantity ?? null); }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold border border-white/10 bg-white/[0.03] text-white/70 hover:text-white"
                              >Edit</button>
                              <button
                                type="button"
                                onClick={() => handleAddonToggle(addon.id)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                  addon.isActive
                                    ? 'border-[#C8FF5E]/40 bg-[#C8FF5E]/10 text-[#C8FF5E]'
                                    : 'border-white/10 bg-white/[0.03] text-white/60'
                                }`}
                              >
                                {addon.isActive ? 'Active' : 'Inactive'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAddonDelete(addon.id)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold border border-rose-800/40 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleAddAddonSubmit} className="space-y-3 text-xs rounded-2xl border border-white/10 bg-[#07130c] p-4">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">{editingAddonId ? 'Edit Add-on' : 'Add New Add-on'}</h4>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Add-on Name</label>
                  <input
                    type="text"
                    value={addonName}
                    onChange={(e) => setAddonName(e.target.value)}
                    placeholder="e.g. Bibs Set"
                    className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                    required
                  />
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Description</label>
                  <textarea
                    value={addonDescription}
                    onChange={(e) => setAddonDescription(e.target.value)}
                    placeholder="Optional short description"
                    rows={2}
                    className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Category</label>
                    <select
                      value={addonCategory}
                      onChange={(e) => setAddonCategory(e.target.value as 'equipment' | 'service' | 'food' | 'other')}
                      className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                    >
                      <option value="equipment">Equipment</option>
                      <option value="service">Service</option>
                      <option value="food">Food</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Price (BDT)</label>
                    <input
                      type="number"
                      min={0}
                      value={addonPrice}
                      onChange={(e) => setAddonPrice(Number(e.target.value))}
                      className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Stock Quantity (optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={addonStock ?? ''}
                    onChange={(e) => setAddonStock(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="Leave empty for unlimited"
                    className="w-full bg-[#0A1E14] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddonsModal(false);
                      setSelectedTurfForAddonsId(null);
                      setAddonName('');
                      setAddonDescription('');
                      setAddonCategory('equipment');
                      setAddonPrice(120);
                      setAddonStock(null);
                      setEditingAddonId(null);
                    }}
                    className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                  >
                    {editingAddonId ? 'Update Add-on' : 'Save Add-on'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD STAFF */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">Create Operational Staff Account</h3>
              <button onClick={() => setShowAddStaffModal(false)} className="text-white/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaffSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Staff Full Name:</label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Rakibul Islam"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Email Address:</label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="e.g. staff@greenpitch.com"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Phone Number:</label>
                <input
                  type="tel"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder="e.g. +880 1600-000000"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Assign to Turf:</label>
                <select
                  value={staffTurfIds[0] || ''}
                  onChange={(e) => setStaffTurfIds([e.target.value])}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                >
                  {myTurfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                >
                  Create Staff Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: WITHDRAWAL REQUEST */}
      {showStaffSetupPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C8FF5E]">Staff setup preview</p>
                <h3 className="mt-1 font-bold text-sm text-white">Account Setup Screen</h3>
              </div>
              <button onClick={() => setShowStaffSetupPreview(null)} className="text-white/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-[#C8FF5E]/25 bg-[#C8FF5E]/8 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Invite recipient</p>
                  <h4 className="mt-1 text-lg font-black text-white">{showStaffSetupPreview.staffName}</h4>
                </div>
                <span className="rounded-full border border-[#C8FF5E]/30 bg-[#C8FF5E]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#C8FF5E]">
                  {showStaffSetupPreview.status === 'pending_setup' ? 'Pending setup' : 'Active'}
                </span>
              </div>

              <div className="mt-3 space-y-3 text-xs text-white/70">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <span>Email</span>
                  <span className="font-semibold text-white">{showStaffSetupPreview.staffEmail}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <span>Phone</span>
                  <span className="font-semibold text-white">{showStaffSetupPreview.staffPhone}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <span>Assigned turf</span>
                  <span className="font-semibold text-white">
                    {turfs.find((t) => t.id === showStaffSetupPreview.turfIds[0])?.name || 'Assigned turf'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#07130c] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Setup steps</p>
              <ol className="mt-3 space-y-2 text-xs text-white/70 list-decimal list-inside">
                <li>Staff opens the invite link and lands on the account setup screen.</li>
                <li>They choose a password, confirm phone number, and complete verification.</li>
                <li>After setup, the dashboard is scoped only to the assigned turf(s).</li>
              </ol>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStaffSetupPreview(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
              >
                Send Reminder
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">Request Earnings Payout</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="text-white/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#07130c] border border-white/10 p-3.5 rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-white/80">
                <span>Available Balance:</span>
                <span className="font-black text-[#C8FF5E]">৳{myWallet.availableBalance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-white/50 text-[11px]">
                <span>Minimum Withdrawal:</span>
                <span>৳{settings.minWithdrawalAmount}</span>
              </div>
            </div>

            <form onSubmit={handleWithdrawalSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Payout Amount (BDT):</label>
                <input
                  type="number"
                  min={settings.minWithdrawalAmount}
                  max={myWallet.availableBalance}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white font-bold focus:border-[#C8FF5E] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Payout Method:</label>
                <select
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                >
                  <option value="bKash Merchant">bKash (Merchant / Personal)</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Rocket">Rocket</option>
                  <option value="Bank Transfer">Bank Transfer (BRAC/City/EBL)</option>
                </select>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Account Number & Name:</label>
                <input
                  type="text"
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  placeholder="e.g. 01819223344 (Tanvir Ahmed)"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none placeholder:text-white/30"
                  required
                />
              </div>

              {withdrawMsg && (
                <div className="p-2.5 bg-[#0e271a] text-[#C8FF5E] border border-[#C8FF5E]/40 rounded-xl text-xs font-semibold">
                  {withdrawMsg}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold rounded-xl shadow-md shadow-[#C8FF5E]/20 cursor-pointer transition-all"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
