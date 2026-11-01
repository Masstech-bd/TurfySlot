import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Booking, Slot, PaymentMethod, PaymentStatus } from '../../types';
import { formatBDTimeRange, getBDDateString } from '../../utils/datetime';
import { showAppAlert } from '../common/AppDialog';
import {
  Users,
  QrCode,
  CheckCircle2,
  Calendar,
  Clock,
  Lock,
  Unlock,
  Plus,
  Phone,
  AlertCircle,
  X,
  Search,
} from 'lucide-react';

export const StaffPortal: React.FC = () => {
  const {
    currentUser,
    staffAssignments,
    turfs,
    slots,
    loadAvailability,
    bookings,
    checkInBooking,
    completeBooking,
    toggleSlotBlock,
    createManualBooking,
    openStaffManualBookingModal,
    setOpenStaffManualBookingModal,
  } = useApp();

  // Find assignment for current staff user
  const assignment = staffAssignments.find((sa) => sa.staffUserId === currentUser.id);
  const assignedTurfIds = assignment?.turfIds || [];
  const permissions = assignment?.permissions || [];

  const assignedTurfs = turfs.filter((t) => assignedTurfIds.includes(t.id));
  const assignedBookings = bookings.filter((b) => assignedTurfIds.includes(b.turfId));

  const [selectedTurfId, setSelectedTurfId] = useState<string>(assignedTurfIds[0] || '');
  useEffect(() => { if (!selectedTurfId && assignedTurfIds.length) setSelectedTurfId(assignedTurfIds[0]); }, [assignedTurfIds, selectedTurfId]);
  const [activeStaffTab, setActiveStaffTab] = useState<'emergency_slot_block' | 'check_in_queue'>('emergency_slot_block');
  const [qrInputCode, setQrInputCode] = useState('');
  const [scanMessage, setScanMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isScanningQr, setIsScanningQr] = useState(false);
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const verifyQrRef = useRef<(code: string) => Promise<void>>(async () => undefined);

  // Manual counter booking state
  const [showManualModal, setShowManualModal] = useState(false);
  const isCounterModalOpen = showManualModal || openStaffManualBookingModal;
  const closeCounterModal = () => {
    setShowManualModal(false);
    setOpenStaffManualBookingModal(false);
  };
  const [mbSlotId, setMbSlotId] = useState('');
  const [mbCustomerName, setMbCustomerName] = useState('');
  const [mbCustomerPhone, setMbCustomerPhone] = useState('');
  const [mbPaymentMethod, setMbPaymentMethod] = useState<PaymentMethod>('cash');
  const [mbPaymentStatus, setMbPaymentStatus] = useState<PaymentStatus>('paid');

  const selectedTurf = turfs.find((t) => t.id === selectedTurfId);
  const todayDate = getBDDateString();
  useEffect(() => {
    if (selectedTurfId) void loadAvailability(selectedTurfId, todayDate);
  }, [selectedTurfId, todayDate, loadAvailability]);

  // Today's slots for assigned turf
  const turfSlots = slots.filter((s) => s.turfId === selectedTurfId && s.date === todayDate);

  // Handle QR code validation / search
  const verifyCheckInCode = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQrInputCode(trimmed);
    const matched = assignedBookings.find((booking) =>
      booking.bookingNumber.toLowerCase() === trimmed.toLowerCase() ||
      booking.qrCode.toLowerCase() === trimmed.toLowerCase()
    );

    if (!matched) {
      setScanMessage({ text: `No reservation found for code "${trimmed}" on your assigned ground.`, isError: true });
      return;
    }
    if (matched.status === 'checked_in') {
      setScanMessage({ text: `Player ${matched.customerName} is already checked in!`, isError: false });
      return;
    }
    if (matched.status === 'completed') {
      setScanMessage({ text: `Booking ${matched.bookingNumber} was already marked completed.`, isError: true });
      return;
    }
    if (matched.status !== 'confirmed') {
      setScanMessage({ text: 'This booking is not confirmed yet, so it cannot be checked in.', isError: true });
      return;
    }

    const checkedIn = await checkInBooking(matched.id);
    if (!checkedIn) {
      setScanMessage({ text: 'The booking could not be checked in. Refresh and confirm your assignment permissions.', isError: true });
      return;
    }
    setScanMessage({
      text: `Success! Checked in ${matched.customerName} for ${matched.turfName} (${formatBDTimeRange(matched.startTime, matched.endTime)}).`,
      isError: false,
    });
    setQrInputCode('');
  };
  verifyQrRef.current = verifyCheckInCode;

  const handleVerifyCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyCheckInCode(qrInputCode);
  };

  useEffect(() => {
    if (!isScanningQr) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let animationFrame = 0;
    type BarcodeDetectorLike = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> };
    type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

    const stopCamera = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };
    const startCamera = async () => {
      const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (!Detector) {
        setScanMessage({ text: 'Camera QR scanning is not supported in this browser. Use a QR scanner keyboard or enter the booking reference.', isError: true });
        setIsScanningQr(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanMessage({ text: 'Camera access is unavailable. Open this site on localhost or HTTPS, or enter the booking reference.', isError: true });
        setIsScanningQr(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped || !scanVideoRef.current) { stopCamera(); return; }
        scanVideoRef.current.srcObject = stream;
        await scanVideoRef.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        const scan = async () => {
          if (stopped || !scanVideoRef.current) return;
          try {
            const codes = await detector.detect(scanVideoRef.current);
            const code = codes.find((item) => item.rawValue.trim())?.rawValue;
            if (code) {
              stopped = true;
              stopCamera();
              setIsScanningQr(false);
              await verifyQrRef.current(code);
              return;
            }
          } catch { /* Continue scanning the next camera frame. */ }
          if (!stopped) animationFrame = window.requestAnimationFrame(() => { void scan(); });
        };
        animationFrame = window.requestAnimationFrame(() => { void scan(); });
      } catch {
        setScanMessage({ text: 'Could not open the camera. Check browser camera permission or enter the booking reference.', isError: true });
        setIsScanningQr(false);
        stopCamera();
      }
    };
    void startCamera();
    return () => {
      stopped = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      stopCamera();
      if (scanVideoRef.current) scanVideoRef.current.srcObject = null;
    };
  }, [isScanningQr]);

  const handleManualBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mbSlotId || !mbCustomerName || !mbCustomerPhone) return;

    const result = await createManualBooking({
      turfId: selectedTurfId,
      slotId: mbSlotId,
      customerName: mbCustomerName,
      customerPhone: mbCustomerPhone,
      paymentMethod: mbPaymentMethod,
      paymentStatus: mbPaymentStatus,
    });
    if (!result.booking) {
      showAppAlert(result.error || 'Manual booking could not be saved.');
      return;
    }

    closeCounterModal();
    setMbCustomerName('');
    setMbCustomerPhone('');
    setMbSlotId('');
  };

  return (
    <div className="min-h-screen bg-[#07130c] text-slate-100 pb-16">
      {/* Header */}
      <div className="bg-[#0A1E14] border-b border-white/10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                  Staff Operational Terminal
                </span>
                <span className="text-xs text-white/60">Staff: {currentUser.name}</span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1">Ground Check-In & Match Dispatch</h1>
              <p className="text-xs text-white/60 mt-1">
                Assigned to:{' '}
                <span className="text-[#C8FF5E] font-semibold">
                  {assignedTurfs.map((t) => t.name).join(', ') || 'No turf assigned'}
                </span>
              </p>
            </div>

            {/* Turf switcher if multiple assigned */}
            {assignedTurfs.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-white/60">Current Ground:</label>
                <select
                  value={selectedTurfId}
                  onChange={(e) => setSelectedTurfId(e.target.value)}
                  className="bg-[#0e271a] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C8FF5E]"
                >
                  {assignedTurfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Scoped Security Banner */}
          <div className="mt-4 p-3 bg-white/[0.04] border border-white/10 rounded-xl flex items-start gap-2 text-xs text-white/80">
            <AlertCircle className="w-4 h-4 text-[#C8FF5E] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#C8FF5E]">Staff Scoped Permissions:</strong> You have operational rights on assigned grounds.
              Earnings, wallet balances, withdrawal requests, and turf pricing controls are strictly hidden to preserve owner
              confidentiality.
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs Navigation for Staff */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex items-center gap-1.5 bg-white/[0.06] p-1 rounded-2xl border border-white/10 flex-wrap no-scrollbar w-fit">
          <button
            onClick={() => setActiveStaffTab('emergency_slot_block')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
              activeStaffTab === 'emergency_slot_block'
                ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Emergency Slot Block</span>
            {turfSlots.filter((s) => s.status === 'blocked').length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeStaffTab === 'emergency_slot_block'
                    ? 'bg-[#0A1E14]/20 text-[#0A1E14]'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {turfSlots.filter((s) => s.status === 'blocked').length} Blocked
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveStaffTab('check_in_queue')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
              activeStaffTab === 'check_in_queue'
                ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Check-In & Match Schedule</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeStaffTab === 'check_in_queue'
                  ? 'bg-[#0A1E14]/20 text-[#0A1E14]'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {assignedBookings.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Emergency Slot Block (Active by default, NO internal scrollbar) */}
      {activeStaffTab === 'emergency_slot_block' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
          <div className="bg-[#0e271a] border border-white/10 rounded-2xl p-6 shadow-lg space-y-6">
            {/* Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#C8FF5E]" /> Emergency Slot Block & Pitch Control
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                    Today: {todayDate}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  Temporarily lock or unlock slots if pitch requires emergency repair, rain sweep, or urgent maintenance.
                </p>
              </div>

              {/* Summary Chips */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-[#07130c] border border-white/10 text-white/70">
                  Total: <strong className="text-white">{turfSlots.length}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                  Available:{' '}
                  <strong className="text-emerald-400">
                    {turfSlots.filter((s) => s.status === 'available').length}
                  </strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60">
                  Booked:{' '}
                  <strong className="text-white">
                    {turfSlots.filter((s) => s.status === 'booked').length}
                  </strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300">
                  Blocked:{' '}
                  <strong className="text-rose-400">
                    {turfSlots.filter((s) => s.status === 'blocked').length}
                  </strong>
                </span>
              </div>
            </div>

            {/* Slot Cards Grid (NO SCROLLBAR: Completely flat, responsive layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {turfSlots.map((s) => {
                const isBlocked = s.status === 'blocked';
                const isBooked = s.status === 'booked';
                const isAvailable = s.status === 'available';

                return (
                  <div
                    key={s.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-md ${
                      isBlocked
                        ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                        : isBooked
                        ? 'bg-white/[0.03] border-white/10 opacity-75'
                        : 'bg-[#07130c] border-white/10 hover:border-[#C8FF5E]/40 text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-sm text-white">
                        <Clock className="w-3.5 h-3.5 text-[#C8FF5E]" />
                        <span>
                          {formatBDTimeRange(s.startTime, s.endTime)}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                          isBlocked
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : isBooked
                            ? 'bg-white/10 text-white/60 border-white/10'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>Rate: ৳{s.price}</span>
                      {isAvailable && (
                        <span className="text-[11px] text-emerald-400 font-semibold">Available</span>
                      )}
                      {isBooked && (
                        <span className="text-[11px] text-white/60 font-semibold">Reserved</span>
                      )}
                      {isBlocked && (
                        <span className="text-[11px] text-rose-400 font-semibold">Pitch Locked</span>
                      )}
                    </div>

                    {/* Action Button */}
                    {!isBooked ? (
                      <button
                        onClick={() => toggleSlotBlock(s.id)}
                        className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isBlocked
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                            : 'bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50'
                        }`}
                      >
                        {isBlocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Unlock / Open Slot</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Lock / Block Slot</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full py-2 px-3 rounded-xl bg-white/[0.04] text-white/40 text-center font-medium text-xs border border-white/5 flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white/30" />
                        <span>Player Booked</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {turfSlots.length === 0 && (
              <div className="text-center py-12 bg-[#07130c] border border-white/10 rounded-2xl text-white/50 text-xs">
                No slots scheduled for today on this ground.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Fast Player Check-In & Arrival Queue & Match Schedule */}
      {activeStaffTab === 'check_in_queue' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: QR Code Scanner / Check-in Terminal */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#0e271a] border border-white/10 rounded-2xl p-5 space-y-4 shadow-lg sticky top-24">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#C8FF5E]" /> Fast Player Check-In
              </h3>
              <p className="text-xs text-white/60">
                Scan or enter the player's booking number (e.g. <span className="font-mono text-[#C8FF5E]">TS-2026-0891</span>) on arrival.
              </p>

              <button
                type="button"
                onClick={() => { setScanMessage(null); setIsScanningQr((scanning) => !scanning); }}
                className="w-full rounded-xl border border-[#C8FF5E]/40 bg-[#C8FF5E]/10 px-3 py-2 text-xs font-bold text-[#C8FF5E] hover:bg-[#C8FF5E]/15"
              >
                {isScanningQr ? 'Stop Camera Scanner' : 'Scan with Camera'}
              </button>
              {isScanningQr && <video ref={scanVideoRef} autoPlay playsInline muted className="w-full max-h-56 rounded-xl bg-black object-cover" aria-label="Camera QR scanner" />}

              <form onSubmit={handleVerifyCheckIn} className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={qrInputCode}
                    onChange={(e) => setQrInputCode(e.target.value)}
                    placeholder="Enter Booking Ref or QR..."
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl py-2.5 pl-3 pr-20 text-xs text-white placeholder-white/40 font-mono focus:outline-none focus:border-[#C8FF5E]"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    Verify
                  </button>
                </div>
              </form>

              {/* Quick Test Codes */}
              <div>
                <div className="text-[10px] text-white/50 font-bold uppercase mb-1">Quick Test References:</div>
                <div className="flex flex-wrap gap-1">
                  {assignedBookings.slice(0, 3).map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setQrInputCode(b.bookingNumber)}
                      className="text-[10px] font-mono bg-[#07130c] hover:bg-white/10 text-[#C8FF5E] px-2 py-0.5 rounded border border-white/10 cursor-pointer"
                    >
                      {b.bookingNumber}
                    </button>
                  ))}
                </div>
              </div>

              {scanMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                    scanMessage.isError
                      ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                      : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {scanMessage.isError ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{scanMessage.text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Today's Dispatch & Match Queue */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white">Arrival Queue & Match Schedule</h2>
                <p className="text-xs text-white/60">Confirmed teams expected at counter today.</p>
              </div>

              {permissions.includes('bookings.create_manual') && (
                <button
                  onClick={() => setShowManualModal(true)}
                  className="px-3.5 py-1.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow-md shadow-[#C8FF5E]/20 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Counter Booking
                </button>
              )}
            </div>

            {/* Bookings Queue Cards */}
            <div className="space-y-3">
              {assignedBookings.map((b) => {
                const isCheckedIn = b.status === 'checked_in';
                const isConfirmed = b.status === 'confirmed';
                const isCompleted = b.status === 'completed';

                return (
                  <div
                    key={b.id}
                    className={`bg-[#0A1E14] border rounded-2xl p-4.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg ${
                      isCheckedIn
                        ? 'border-[#C8FF5E]/60 bg-[#0e271a]'
                        : isCompleted
                        ? 'border-white/5 opacity-60'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-[#C8FF5E]">{b.bookingNumber}</span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            isCheckedIn
                              ? 'bg-[#C8FF5E]/20 text-[#C8FF5E] border-[#C8FF5E]/30'
                              : isConfirmed
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-white/5 text-white/50 border-white/10'
                          }`}
                        >
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-white">{b.customerName}</h4>
                      <div className="text-xs text-white/60 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-[#C8FF5E]" /> {b.customerPhone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#C8FF5E]" /> {formatBDTimeRange(b.startTime, b.endTime)}
                        </span>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {isConfirmed && (
                        <button
                          onClick={() => checkInBooking(b.id)}
                          className="px-3.5 py-1.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
                        >
                          Check In Player
                        </button>
                      )}

                      {isCheckedIn && (
                        <button
                          onClick={() => completeBooking(b.id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
                        >
                          Match Finished
                        </button>
                      )}

                      {isCompleted && (
                        <span className="text-xs text-white/50 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-[#C8FF5E]" /> Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {assignedBookings.length === 0 && (
                <div className="text-center py-12 bg-[#0A1E14] border border-white/10 rounded-2xl text-white/50 text-xs">
                  No bookings assigned to your ground yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAFF COUNTER BOOKING MODAL */}
      {isCounterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A1E14] border border-white/15 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-sm text-white">Counter / Walk-in Booking</h3>
              <button onClick={closeCounterModal} className="text-white/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualBookingSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/70 font-semibold mb-1 block">Ground:</label>
                <div className="p-2.5 bg-[#07130c] border border-white/10 rounded-xl font-bold text-white">{selectedTurf?.name}</div>
              </div>

              <div>
                <label className="text-white/70 font-semibold mb-1 block">Available Slot:</label>
                <select
                  value={mbSlotId}
                  onChange={(e) => setMbSlotId(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white"
                  required
                >
                  <option value="">-- Choose Slot --</option>
                  {slots
                    .filter((s) => s.turfId === selectedTurfId && s.status === 'available')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} ({formatBDTimeRange(s.startTime, s.endTime)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-white/70 font-semibold mb-1 block">Player / Team Name:</label>
                <input
                  type="text"
                  value={mbCustomerName}
                  onChange={(e) => setMbCustomerName(e.target.value)}
                  placeholder="e.g. Captain Anik"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-white/70 font-semibold mb-1 block">Phone Number:</label>
                <input
                  type="tel"
                  value={mbCustomerPhone}
                  onChange={(e) => setMbCustomerPhone(e.target.value)}
                  placeholder="e.g. +880 1700-000000"
                  className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2.5 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-white/70 font-semibold mb-1 block">Payment:</label>
                  <select
                    value={mbPaymentMethod}
                    onChange={(e) => setMbPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2 text-white"
                  >
                    <option value="cash">Cash (Counter)</option>
                    <option value="bkash">bKash Manual</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/70 font-semibold mb-1 block">Status:</label>
                  <select
                    value={mbPaymentStatus}
                    onChange={(e) => setMbPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full bg-[#07130c] border border-white/10 rounded-xl p-2 text-white"
                  >
                    <option value="paid">Collected (Paid)</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCounterModal}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!mbSlotId}
                  className="flex-1 py-2 bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:opacity-50 text-[#0A1E14] font-bold rounded-xl shadow cursor-pointer"
                >
                  Confirm Counter Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
