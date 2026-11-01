import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { showAppAlert } from '../common/AppDialog';
import { OpenMatch, OpenMatchSkillLevel } from '../../types';
import { formatBDTimeRange } from '../../utils/datetime';
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  Shield,
  Phone,
  Filter,
  UserCheck,
  UserMinus,
  Info,
  Lock,
  LogIn,
  UserPlus,
} from 'lucide-react';

interface SquadsViewProps {
  onBackToExplore?: () => void;
}

export const SquadsView: React.FC<SquadsViewProps> = ({ onBackToExplore }) => {
  const {
    currentUser,
    isAuthenticated,
    openSignInModal,
    openGetStartedModal,
    bookings,
    openMatches,
    matchParticipants,
    createOpenMatch,
    cancelOpenMatch,
    joinOpenMatch,
    leaveOpenMatch,
    removeMatchParticipant,
  } = useApp();

  // Auth Guard: unauthenticated users cannot view Squad Finder
  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-8 sm:p-12 shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#C8FF5E]/15 border border-[#C8FF5E]/30 flex items-center justify-center mx-auto text-[#C8FF5E]">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Login Required to View Squads</h2>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              স্কোয়াড ফাইন্ডার এবং ওপেন ম্যাচ দেখতে অনুগ্রহ করে আপনার প্লেয়ার অ্যাকাউন্টে লগইন করুন।
            </p>
            <p className="text-xs text-white/50 max-w-md mx-auto">
              Please sign in to your player account to browse open squads, join community matches, and connect with team captains.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => openSignInModal('player')}
              className="w-full sm:w-auto px-6 py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black text-xs sm:text-sm rounded-full cursor-pointer shadow-lg shadow-[#C8FF5E]/20 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to View Squads</span>
            </button>
            <button
              onClick={() => openGetStartedModal('player')}
              className="w-full sm:w-auto px-6 py-3 bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs sm:text-sm rounded-full border border-white/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4 text-[#C8FF5E]" />
              <span>Create Account</span>
            </button>
            {onBackToExplore && (
              <button
                onClick={onBackToExplore}
                className="w-full sm:w-auto px-5 py-3 text-white/60 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Back to Explore Turfs
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filter States
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [selectedSkill, setSelectedSkill] = useState<string>('All');
  const [filterMode, setFilterMode] = useState<'all' | 'my_squads'>('all');

  // Modals
  const [showHostModal, setShowHostModal] = useState(false);
  const [selectedMatchForDetails, setSelectedMatchForDetails] = useState<OpenMatch | null>(null);

  // Host Form State
  const [hostBookingId, setHostBookingId] = useState('');
  const [hostSkillLevel, setHostSkillLevel] = useState<OpenMatchSkillLevel>('casual');
  const [hostMaxPlayers, setHostMaxPlayers] = useState(10);
  const [hostNotes, setHostNotes] = useState('');
  const [hostError, setHostError] = useState('');
  const [hostSuccess, setHostSuccess] = useState('');

  // Eligible confirmed bookings owned by current user that don't have an active open match yet
  const eligibleBookings = bookings.filter((b) => {
    const isOwner = b.playerId === currentUser.id;
    const isConfirmed = b.status === 'confirmed';
    const hasActiveMatch = openMatches.some((m) => m.bookingId === b.id && m.status !== 'cancelled');
    return isOwner && isConfirmed && !hasActiveMatch;
  });

  // Filtered Open Matches
  const filteredMatches = openMatches.filter((m) => {
    if (m.status === 'cancelled') return false;
    const matchSport = selectedSport === 'All' || m.sportType.toLowerCase() === selectedSport.toLowerCase();
    const matchArea = selectedArea === 'All' || m.area.toLowerCase() === selectedArea.toLowerCase();
    const matchSkill = selectedSkill === 'All' || m.skillLevel === selectedSkill;

    let matchMode = true;
    if (filterMode === 'my_squads') {
      const isCaptain = m.captainId === currentUser.id;
      const isParticipant = matchParticipants.some(
        (p) => p.matchId === m.id && p.playerId === currentUser.id && p.status === 'joined'
      );
      matchMode = isCaptain || isParticipant;
    }

    return matchSport && matchArea && matchSkill && matchMode;
  });

  const handleCreateMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHostError('');
    setHostSuccess('');

    if (!hostBookingId) {
      setHostError('Please select one of your confirmed turf bookings.');
      return;
    }

    const res = await createOpenMatch({
      bookingId: hostBookingId,
      skillLevel: hostSkillLevel,
      maxPlayers: Number(hostMaxPlayers),
      notes: hostNotes,
    });

    if (res.success) {
      setHostSuccess(res.message);
      setTimeout(() => {
        setShowHostModal(false);
        setHostBookingId('');
        setHostNotes('');
        setHostSuccess('');
      }, 1200);
    } else {
      setHostError(res.message);
    }
  };

  // Distinct areas and sports for filter chips
  const distinctAreas = ['All', ...Array.from(new Set(openMatches.map((m) => m.area)))];
  const distinctSports = ['All', 'Football', 'Cricket', 'Futsal', 'Badminton'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#C8FF5E]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8FF5E]/10 border border-[#C8FF5E]/20 text-[#C8FF5E] text-xs font-bold">
              <Users className="w-3.5 h-3.5" />
              <span>Community Matchmaking</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Squad Finder & Open Matches
            </h1>
            <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
              Find players to complete your 5-a-side team or join an open game at turfs across Dhaka.
              Free social matchmaking with instant captain contact.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onBackToExplore && (
              <button
                type="button"
                onClick={onBackToExplore}
                className="px-4 py-2.5 rounded-xl border border-white/15 hover:border-white/30 text-white/80 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Back to Turfs
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setHostError('');
                setHostSuccess('');
                if (eligibleBookings.length > 0) {
                  setHostBookingId(eligibleBookings[0].id);
                }
                setShowHostModal(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-xs font-black flex items-center gap-2 shadow-lg shadow-[#C8FF5E]/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Host Open Match</span>
            </button>
          </div>
        </div>

        {/* Hard Financial Boundary Disclaimer Banner */}
        <div className="mt-5 p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200/90 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-amber-300">Financial Boundary: </span>
            TurfySlot does not collect payments, entry fees, or handle squad cost-splits for Open Matches.
            Any shared turf fees are settled directly between players and the captain in cash or mobile wallet.
          </div>
        </div>
      </div>

      {/* Filter and Mode Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0e271a] p-4 rounded-2xl border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md'
                : 'text-white/70 hover:text-white bg-white/5'
            }`}
          >
            All Open Matches ({openMatches.filter((m) => m.status !== 'cancelled').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('my_squads')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'my_squads'
                ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md'
                : 'text-white/70 hover:text-white bg-white/5'
            }`}
          >
            My Squads
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Area Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-white/50 text-[11px]">Area:</span>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="bg-[#07130c] border border-white/15 rounded-xl px-2.5 py-1.5 text-white text-xs focus:border-[#C8FF5E] outline-none"
            >
              {distinctAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Sport Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-white/50 text-[11px]">Sport:</span>
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="bg-[#07130c] border border-white/15 rounded-xl px-2.5 py-1.5 text-white text-xs focus:border-[#C8FF5E] outline-none"
            >
              {distinctSports.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Skill Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-white/50 text-[11px]">Skill:</span>
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="bg-[#07130c] border border-white/15 rounded-xl px-2.5 py-1.5 text-white text-xs focus:border-[#C8FF5E] outline-none"
            >
              <option value="All">All Levels</option>
              <option value="casual">Casual / Friendly</option>
              <option value="competitive">Competitive</option>
              <option value="mixed">Mixed Level</option>
            </select>
          </div>
        </div>
      </div>

      {/* Matches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredMatches.map((m) => {
          const isCaptain = m.captainId === currentUser.id;
          const userParticipant = matchParticipants.find(
            (p) => p.matchId === m.id && p.playerId === currentUser.id && p.status === 'joined'
          );
          const isJoined = Boolean(userParticipant);
          const slotsLeft = Math.max(0, m.maxPlayers - m.joinedCount);
          const isFull = m.joinedCount >= m.maxPlayers;

          return (
            <div
              key={m.id}
              className="bg-[#0A1E14] border border-white/10 hover:border-[#C8FF5E]/30 transition-all rounded-3xl p-5 flex flex-col justify-between shadow-xl space-y-4"
            >
              <div className="space-y-3">
                {/* Top Badges */}
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] font-bold text-[11px] border border-[#C8FF5E]/30">
                    {m.sportType}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {m.skillLevel}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        isFull
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {isFull ? 'Full Squad' : `${slotsLeft} Spots Left`}
                    </span>
                  </div>
                </div>

                {/* Match Title & Turf */}
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">{m.turfName}</h3>
                  <p className="text-xs text-white/60 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#C8FF5E]" /> {m.area}, Dhaka
                  </p>
                </div>

                {/* Date & Time */}
                <div className="p-3 bg-[#07130c] rounded-2xl border border-white/10 text-xs space-y-1">
                  <div className="flex items-center justify-between text-white/80">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#C8FF5E]" /> {m.date}
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                      <Clock className="w-3.5 h-3.5 text-[#C8FF5E]" /> {formatBDTimeRange(m.startTime, m.endTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-white/60 text-[11px] pt-1 border-t border-white/5">
                    <span>Captain: {m.captainName}</span>
                    <span className="font-mono text-[10px] text-white/50">Ref #{m.bookingNumber}</span>
                  </div>
                </div>

                {/* Squad Capacity Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60">Squad Roster</span>
                    <span className="font-bold text-[#C8FF5E]">
                      {m.joinedCount} / {m.maxPlayers} Players
                    </span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isFull ? 'bg-amber-400' : 'bg-[#C8FF5E]'
                      }`}
                      style={{ width: `${Math.min(100, (m.joinedCount / m.maxPlayers) * 100)}%` }}
                    />
                  </div>
                </div>

                {m.notes && (
                  <p className="text-xs text-white/70 italic bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                    &quot;{m.notes}&quot;
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMatchForDetails(m)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  View Details
                </button>

                {isCaptain ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#C8FF5E] bg-[#C8FF5E]/15 px-2.5 py-1 rounded-full border border-[#C8FF5E]/30">
                      Your Match (Captain)
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await cancelOpenMatch(m.id);
                        if (!result.success) showAppAlert(result.message);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer underline"
                    >
                      Disband
                    </button>
                  </div>
                ) : isJoined ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                      Joined ✓
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await leaveOpenMatch(m.id);
                        if (!result.success) showAppAlert(result.message);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer underline"
                    >
                      Leave
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isFull}
                    onClick={async () => {
                      const result = await joinOpenMatch(m.id);
                      if (!result.success) showAppAlert(result.message);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A1E14] text-xs font-black transition-all cursor-pointer shadow-md"
                  >
                    {isFull ? 'Squad Full' : 'Join Squad'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredMatches.length === 0 && (
          <div className="col-span-full text-center py-16 bg-[#0A1E14] border border-white/10 rounded-3xl p-8 space-y-4">
            <Users className="w-12 h-12 text-[#C8FF5E]/40 mx-auto" />
            <h3 className="text-lg font-bold text-white">No Open Matches Found</h3>
            <p className="text-xs text-white/60 max-w-md mx-auto">
              No open squads match your selected filters right now. Have a turf booking? Host an open
              match to invite fellow players!
            </p>
            <button
              type="button"
              onClick={() => {
                if (eligibleBookings.length > 0) {
                  setHostBookingId(eligibleBookings[0].id);
                }
                setShowHostModal(true);
              }}
              className="px-6 py-2.5 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-xs rounded-full cursor-pointer"
            >
              Host an Open Match
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: HOST OPEN MATCH FORM                                             */}
      {/* ========================================================================= */}
      {showHostModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#C8FF5E]/20 text-[#C8FF5E] flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Host an Open Match</h3>
                  <p className="text-[11px] text-white/60">Invite teammates to your confirmed booking</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHostModal(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {eligibleBookings.length === 0 ? (
              <div className="p-4 bg-[#07130c] rounded-2xl border border-white/10 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">No Eligible Confirmed Bookings</h4>
                <p className="text-xs text-white/60">
                  Only a player who holds a confirmed turf booking can host an
                  Open Match. Book a turf slot first, then host your squad here!
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowHostModal(false);
                    if (onBackToExplore) onBackToExplore();
                  }}
                  className="px-4 py-2 bg-[#C8FF5E] text-[#0A1E14] font-bold text-xs rounded-xl cursor-pointer"
                >
                  Book a Turf Slot First
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateMatchSubmit} className="space-y-4 text-xs">
                {/* Select Booking */}
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">
                    Choose Your Confirmed Turf Booking:
                  </label>
                  <select
                    value={hostBookingId}
                    onChange={(e) => setHostBookingId(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    {eligibleBookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.turfName} • {b.date} ({formatBDTimeRange(b.startTime, b.endTime)}) • Ref #{b.bookingNumber}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Expected Skill Level:</label>
                    <select
                      value={hostSkillLevel}
                      onChange={(e) => setHostSkillLevel(e.target.value as OpenMatchSkillLevel)}
                      className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                    >
                      <option value="casual">Casual / Friendly</option>
                      <option value="intermediate">Mixed Level</option>
                      <option value="competitive">Competitive</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">
                      Total Players Needed (Inc. You):
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={22}
                      value={hostMaxPlayers}
                      onChange={(e) => setHostMaxPlayers(Math.max(2, Number(e.target.value)))}
                      className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white font-bold focus:border-[#C8FF5E] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Notes / Instructions for Players:</label>
                  <textarea
                    value={hostNotes}
                    onChange={(e) => setHostNotes(e.target.value)}
                    placeholder="e.g. Bring extra jersey (green or black), cleats allowed, cost-split ৳150 cash at counter."
                    rows={3}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white placeholder-white/40 focus:border-[#C8FF5E] outline-none"
                  />
                </div>

                {/* Hard Financial Boundary Notice */}
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-400">
                    <Shield className="w-3.5 h-3.5" /> No Platform Money Transfers
                  </div>
                  <p className="text-white/70">
                    Open Matches are purely for social matchmaking. As captain, you already paid for your turf
                    booking. If players share the turf cost, collect it directly from them offline.
                  </p>
                </div>

                {hostError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 font-semibold text-xs">
                    {hostError}
                  </div>
                )}

                {hostSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-semibold text-xs">
                    {hostSuccess}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowHostModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black cursor-pointer shadow-lg shadow-[#C8FF5E]/20"
                  >
                    Post Open Match
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MATCH DETAILS & SQUAD ROSTER DRAWER                              */}
      {/* ========================================================================= */}
      {selectedMatchForDetails && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">{selectedMatchForDetails.turfName}</h3>
                <p className="text-xs text-white/60">
                  {selectedMatchForDetails.area} • {selectedMatchForDetails.sportType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMatchForDetails(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Captain Details */}
            <div className="p-3.5 bg-[#07130c] rounded-2xl border border-white/10 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white/60">Match Captain:</span>
                <span className="font-bold text-white">{selectedMatchForDetails.captainName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">Captain Phone:</span>
                <span className="font-mono text-[#C8FF5E] font-semibold flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {selectedMatchForDetails.captainPhone}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">Booking Reference:</span>
                <span className="font-mono text-white/80">{selectedMatchForDetails.bookingNumber}</span>
              </div>
            </div>

            {/* Squad Members List */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Squad Members ({selectedMatchForDetails.joinedCount}/{selectedMatchForDetails.maxPlayers})
                </h4>
                <span className="text-[10px] text-[#C8FF5E] font-semibold">
                  {selectedMatchForDetails.skillLevel}
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {matchParticipants
                  .filter((p) => p.matchId === selectedMatchForDetails.id && p.status === 'joined')
                  .map((p, idx) => {
                    const isSelf = p.playerId === currentUser.id;
                    const isCaptain = p.playerId === selectedMatchForDetails.captainId;
                    const canRemove =
                      (selectedMatchForDetails.captainId === currentUser.id || currentUser.role === 'admin') &&
                      !isCaptain;

                    return (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#C8FF5E]/20 text-[#C8FF5E] flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-white">
                              {p.playerName} {isSelf ? '(You)' : ''}
                            </span>
                            {p.playerPhone && (
                              <div className="text-[10px] text-white/40 font-mono">{p.playerPhone}</div>
                            )}
                          </div>
                        </div>

                        {canRemove && (
                          <button
                            type="button"
                            onClick={async () => {
                              const result = await removeMatchParticipant(selectedMatchForDetails.id, p.playerId);
                              if (!result.success) showAppAlert(result.message);
                            }}
                            className="text-rose-400 hover:text-rose-300 text-[11px] font-semibold cursor-pointer"
                            title="Remove from squad"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Financial Disclaimer */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] text-white/60 space-y-1">
              <span className="font-bold text-white/80">Offline Payment Notice:</span>
              <p>
                TurfySlot is an open platform directory. Any pitch cost-sharing is handled directly with the
                captain offline.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedMatchForDetails(null)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
