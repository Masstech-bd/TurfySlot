import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { showAppAlert } from '../common/AppDialog';
import { formatBDTimeRange } from '../../utils/datetime';
import {
  Tournament,
  TournamentTeam,
  TournamentMatch,
  TournamentStatus,
  TournamentMatchStatus,
  TournamentPlayerSearchResult,
} from '../../types';
import {
  Trophy,
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  Shield,
  Phone,
  Award,
  DollarSign,
  Info,
  ChevronRight,
  Sparkles,
  Lock,
  LogIn,
  UserPlus,
} from 'lucide-react';

interface TournamentsViewProps {
  onBackToExplore?: () => void;
}

interface RosterDraftSlot {
  mode: 'manual' | 'player';
  memberName: string;
  playerId?: string;
  playerName?: string;
  query: string;
  results: TournamentPlayerSearchResult[];
  searching: boolean;
}

const localDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const TournamentsView: React.FC<TournamentsViewProps> = ({ onBackToExplore }) => {
  const {
    currentUser,
    isAuthenticated,
    openSignInModal,
    openGetStartedModal,
    turfs,
    slots,
    tournaments,
    tournamentTeams,
    tournamentMatches,
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
  } = useApp();

  // Auth Guard: unauthenticated users cannot view Tournaments
  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-8 sm:p-12 shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#C8FF5E]/15 border border-[#C8FF5E]/30 flex items-center justify-center mx-auto text-[#C8FF5E]">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Login Required to View Tournaments</h2>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              টুর্নামেন্ট ফিক্সচার, ব্র্যাকেট এবং টিম রেজিস্ট্রেশন দেখতে অনুগ্রহ করে আপনার অ্যাকাউন্টে লগইন করুন।
            </p>
            <p className="text-xs text-white/50 max-w-md mx-auto">
              Please sign in to your account to view tournament fixtures, bracket results, prize pools, and register teams.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => openSignInModal('player')}
              className="w-full sm:w-auto px-6 py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black text-xs sm:text-sm rounded-full cursor-pointer shadow-lg shadow-[#C8FF5E]/20 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In to View Tournaments</span>
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

  // Filters
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'overview' | 'teams' | 'matches'>('overview');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAddMatchModal, setShowAddMatchModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [matchToScore, setMatchToScore] = useState<TournamentMatch | null>(null);

  // Register Team Form State
  const [regTeamName, setRegTeamName] = useState('');
  const [regRosterNotes, setRegRosterNotes] = useState('');
  const [rosterDraft, setRosterDraft] = useState<RosterDraftSlot[]>([]);
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Create Tournament Form State
  const myTurfs = currentUser.role === 'admin' ? turfs : turfs.filter((t) => t.ownerId === currentUser.id);
  const canCreateTournament = currentUser.role === 'admin' || (currentUser.role === 'turf_owner' && myTurfs.length > 0);

  const [tTurfId, setTTurfId] = useState(myTurfs[0]?.id || '');
  const [tName, setTName] = useState('');
  const [tSport, setTSport] = useState('Football');
  const [tFormat, setTFormat] = useState('7-a-side Knockout');
  const [tStartDate, setTStartDate] = useState(() => localDateOffset(14));
  const [tEndDate, setTEndDate] = useState(() => localDateOffset(16));
  const [tMaxTeams, setTMaxTeams] = useState(8);
  const [tTeamSize, setTTeamSize] = useState(5);
  const [tEntryFee, setTEntryFee] = useState(2500);
  const [tPrizePool, setTPrizePool] = useState('৳20,000 Champion Prize + Trophy + Medals');
  const [tDesc, setTDesc] = useState('');
  const [createError, setCreateError] = useState('');
  const [reviewMessages, setReviewMessages] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  // Add Match Form State
  const [mRoundName, setMRoundName] = useState('Quarter Final');
  const [mTeamAId, setMTeamAId] = useState('');
  const [mTeamBId, setMTeamBId] = useState('');
  const [mDate, setMDate] = useState('2026-09-20');
  const [mStartTime, setMStartTime] = useState('16:00');
  const [mEndTime, setMEndTime] = useState('17:00');
  const [mSlotId, setMSlotId] = useState('');

  // Score Modal State
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);

  // Filtered Tournaments
  const filteredTournaments = tournaments.filter((t) => {
    const sportMatch = selectedSport === 'All' || t.sportType.toLowerCase() === selectedSport.toLowerCase();
    const statusMatch = selectedStatus === 'All' || t.status === selectedStatus;
    return sportMatch && statusMatch;
  });
  const ownerHostedTournaments = currentUser.role === 'turf_owner'
    ? tournaments.filter((tournament) => myTurfs.some((turf) => turf.id === tournament.turfId))
    : [];
  const incomingInvitations = currentUser.role === 'player'
    ? tournamentTeams.flatMap((team) => (team.rosterMembers || [])
      .filter((member) => member.status === 'pending' && member.playerId === currentUser.id)
      .map((member) => ({ team, member, tournament: tournaments.find((item) => item.id === team.tournamentId) })))
    : [];

  const openTeamRegistration = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setRegTeamName('');
    setRegRosterNotes('');
    setRegError('');
    setRegSuccess('');
    setRosterDraft(Array.from({ length: Math.max(0, (tournament.teamSize || 1) - 1) }, () => ({ mode:'manual' as const,memberName:'',query:'',results:[],searching:false })));
    setShowRegisterModal(true);
  };

  const handleTournamentReview = async (tournament: Tournament, decision: 'approve' | 'request_changes') => {
    const message = (reviewMessages[tournament.id] || '').trim();
    if (decision === 'request_changes' && !message) {
      showAppAlert('Enter the changes the owner needs to make.');
      return;
    }
    setReviewBusyId(tournament.id);
    try {
      await decideTournamentReview(tournament.id, decision, message);
      setReviewMessages((previous) => ({ ...previous, [tournament.id]: '' }));
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to save the tournament review.');
    } finally {
      setReviewBusyId(null);
    }
  };

  const searchRosterSlot = async (index: number) => {
    if (!selectedTournament) return;
    const slot = rosterDraft[index];
    if (!slot || slot.query.trim().length < 2) {
      setRegError('Enter at least two letters to search for a player.');
      return;
    }
    setRegError('');
    setRosterDraft((previous) => previous.map((entry, slotIndex) => slotIndex === index ? { ...entry, searching:true,results:[] } : entry));
    try {
      const results = await searchTournamentPlayers(selectedTournament.id, slot.query);
      setRosterDraft((previous) => previous.map((entry, slotIndex) => slotIndex === index ? { ...entry, searching:false,results } : entry));
    } catch (error) {
      setRosterDraft((previous) => previous.map((entry, slotIndex) => slotIndex === index ? { ...entry, searching:false,results:[] } : entry));
      setRegError(error instanceof Error ? error.message : 'Unable to search players.');
    }
  };

  const answerRosterInvitation = async (tournamentId: string, memberId: string, decision: 'accept' | 'decline') => {
    setInvitationBusyId(memberId);
    try { await respondTournamentInvitation(tournamentId,memberId,decision); }
    catch (error) { showAppAlert(error instanceof Error ? error.message : 'Unable to update the invitation.'); }
    finally { setInvitationBusyId(null); }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!selectedTournament) return;
    if (!regTeamName.trim()) {
      setRegError('Please enter a valid team name.');
      return;
    }

    if (selectedTournament.teamSize) {
      const incomplete = rosterDraft.find((slot) => slot.mode === 'manual' ? !slot.memberName.trim() : !slot.playerId);
      if (incomplete) {
        setRegError('Fill every teammate place with a member name or an invited player. The captain counts as one roster member.');
        return;
      }
    }
    const members = rosterDraft.map((slot) => slot.mode === 'manual' ? { memberName:slot.memberName.trim() } : { playerId:slot.playerId });
    const res = await registerTournamentTeam(selectedTournament.id, regTeamName, regRosterNotes, members);
    if (res.success) {
      setRegSuccess(res.message);
      setTimeout(() => {
        setShowRegisterModal(false);
        setRegTeamName('');
        setRegRosterNotes('');
        setRosterDraft([]);
        setRegSuccess('');
      }, 1400);
    } else {
      setRegError(res.message);
    }
  };

  const handleCreateTournamentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!tName.trim()) {
      setCreateError('Please enter a tournament name.');
      return;
    }
    if (!tTurfId) {
      setCreateError('Please select a hosting turf venue.');
      return;
    }
    if (!tSport.trim()) {
      setCreateError('Please select a sport.');
      return;
    }
    if (!tStartDate || !tEndDate) {
      setCreateError('Please choose both a start date and an end date.');
      return;
    }
    if (tEndDate < tStartDate) {
      setCreateError('The end date must be on or after the start date.');
      return;
    }
    if (!Number.isInteger(Number(tMaxTeams)) || Number(tMaxTeams) < 2) {
      setCreateError('Maximum teams must be a whole number of at least 2.');
      return;
    }

    try {
      const tournamentData = {
        turfId: tTurfId,
        name: tName.trim(),
        sportType: tSport,
        format: tFormat,
        startDate: tStartDate,
        endDate: tEndDate,
        maxTeams: Number(tMaxTeams),
        teamSize: Number(tTeamSize),
        entryFeeAmount: tEntryFee ? Number(tEntryFee) : undefined,
        prizePoolNote: tPrizePool.trim(),
        description: tDesc.trim(),
      };
      if (editingTournamentId) await updateTournament(editingTournamentId, tournamentData);
      else await createTournament(tournamentData);

      setShowCreateModal(false);
      setEditingTournamentId(null);
      setTName('');
      setTDesc('');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to create tournament.');
    }
  };

  const handleAddMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;

    const teamA = tournamentTeams.find((t) => t.id === mTeamAId);
    const teamB = tournamentTeams.find((t) => t.id === mTeamBId);

    try {
      await addOrUpdateTournamentMatch(selectedTournament.id, {
      roundName: mRoundName,
      teamAId: mTeamAId || undefined,
      teamBId: mTeamBId || undefined,
      teamAName: teamA ? teamA.teamName : 'TBD',
      teamBName: teamB ? teamB.teamName : 'TBD',
      scheduledDate: mDate,
      scheduledStartTime: mStartTime,
      scheduledEndTime: mEndTime,
      slotId: mSlotId || undefined,
      });

      setShowAddMatchModal(false);
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to save match.');
    }
  };

  const handleSaveScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !matchToScore) return;

    let winnerId: string | undefined = undefined;
    if (scoreA > scoreB && matchToScore.teamAId) {
      winnerId = matchToScore.teamAId;
    } else if (scoreB > scoreA && matchToScore.teamBId) {
      winnerId = matchToScore.teamBId;
    }

    try {
      await addOrUpdateTournamentMatch(selectedTournament.id, {
      id: matchToScore.id,
      roundName: matchToScore.roundName,
      teamAId: matchToScore.teamAId,
      teamBId: matchToScore.teamBId,
      teamAName: matchToScore.teamAName,
      teamBName: matchToScore.teamBName,
      scheduledDate: matchToScore.scheduledDate,
      scheduledStartTime: matchToScore.scheduledStartTime,
      scheduledEndTime: matchToScore.scheduledEndTime,
      slotId: matchToScore.slotId,
      scoreA,
      scoreB,
      winnerTeamId: winnerId,
      status: 'completed',
      });

      setShowScoreModal(false);
      setMatchToScore(null);
    } catch (error) {
      showAppAlert(error instanceof Error ? error.message : 'Unable to save match result.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0A1E14] border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#C8FF5E]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C8FF5E]/10 border border-[#C8FF5E]/20 text-[#C8FF5E] text-xs font-bold">
              <Trophy className="w-3.5 h-3.5" />
              <span>Turf Tournaments & Brackets</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Community Sports Tournaments
            </h1>
            <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
              Discover official turf cups, knockout leagues, and weekend championships across Dhaka.
              Register your squad, track fixtures, and compete for trophies.
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
            {canCreateTournament && (
              <button
                type="button"
                onClick={() => {
                  setCreateError('');
                  setShowCreateModal(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-xs font-black flex items-center gap-2 shadow-lg shadow-[#C8FF5E]/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Tournament</span>
              </button>
            )}
          </div>
        </div>

        {/* Hard Financial Boundary Notice */}
        <div className="mt-5 p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200/90 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-amber-300">Financial Boundary: </span>
            TurfySlot is an informational tournament host & bracket scheduler. We do not collect team entry
            fees or escrow prize money. All fees and prizes are handled directly between teams and the turf
            organizer offline.
          </div>
        </div>
      </div>

      {currentUser.role === 'turf_owner' && ownerHostedTournaments.length > 0 && (
        <section className="rounded-3xl border border-[#C8FF5E]/15 bg-gradient-to-br from-[#10291d] to-[#0a1a12] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-black text-white">Tournament registrations</h2>
            <p className="mt-1 text-xs text-white/55">See which teams signed up, their captain contact, and roster notes.</p>
          </div>
          <div className="space-y-3">
            {ownerHostedTournaments.map((tournament) => {
              const tournamentTeamsForOwner = tournamentTeams.filter((team) => team.tournamentId === tournament.id && ['registered','pending_roster'].includes(team.status));
              const pendingRosterCount = tournamentTeamsForOwner.filter((team) => team.status === 'pending_roster').length;
              return (
                <div key={tournament.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white">{tournament.name}</h3>
                      <p className="mt-1 text-[11px] text-white/50">{tournament.turfName} · {tournament.status.replace('_', ' ')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-[#C8FF5E]/20 bg-[#C8FF5E]/10 px-3 py-1.5 text-xs font-bold text-[#C8FF5E]">
                        {tournamentTeamsForOwner.length} / {tournament.maxTeams} teams reserved
                      </span>
                      <button type="button" onClick={() => { setSelectedTournament(tournament); setActiveDetailsTab('teams'); }} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-white/75 hover:bg-white/[0.06]">
                        Open team list
                      </button>
                    </div>
                  </div>
                  {pendingRosterCount > 0 && <p className="mt-2 text-[11px] text-amber-200/75">{pendingRosterCount} team{pendingRosterCount === 1 ? '' : 's'} waiting for invited players to accept.</p>}
                  {tournamentTeamsForOwner.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-white/[0.035] p-3 text-xs text-white/45">No teams have registered yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {tournamentTeamsForOwner.map((team, index) => (
                        <article key={team.id} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
                          <div className="flex items-start gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#C8FF5E]/10 text-[10px] font-black text-[#C8FF5E]">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-bold text-white">{team.teamName}</h4>
                              {team.status === 'pending_roster' && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">Awaiting roster</p>}
                              <p className="mt-1 text-[11px] text-white/65">Captain: {team.captainName || 'Name unavailable'}</p>
                              <p className="mt-0.5 text-[11px] text-[#C8FF5E]/85">Phone: {team.captainPhone || 'Not provided'}</p>
                              {(team.rosterMembers || []).map((member) => <p key={member.id} className="mt-1 text-[11px] text-white/60">{member.memberName} · {member.status === 'pending' ? 'invitation pending' : member.status}</p>)}
                              {team.rosterNotes && <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/50">Roster: {team.rosterNotes}</p>}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {currentUser.role === 'player' && incomingInvitations.length > 0 && (
        <section className="rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-950/35 to-[#0a1a12] p-5 sm:p-6 space-y-3">
          <div>
            <h2 className="text-lg font-black text-white">Team invitations</h2>
            <p className="mt-1 text-xs text-white/55">Accepting an invitation adds you to the captain's tournament roster.</p>
          </div>
          {incomingInvitations.map(({ team,member,tournament }) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/15 p-4">
              <div>
                <h3 className="font-bold text-white">{team.teamName}</h3>
                <p className="mt-1 text-xs text-white/60">{tournament?.name || 'Tournament'} · invited by {team.captainName}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={invitationBusyId === member.id} onClick={() => void answerRosterInvitation(team.tournamentId,member.id,'accept')} className="rounded-lg bg-[#C8FF5E] px-3 py-2 text-xs font-black text-[#0A1E14] disabled:opacity-50">Accept</button>
                <button type="button" disabled={invitationBusyId === member.id} onClick={() => void answerRosterInvitation(team.tournamentId,member.id,'decline')} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-50">Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {currentUser.role === 'admin' && (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-950/15 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-black text-white">Tournament submissions awaiting review</h2>
            <p className="mt-1 text-xs text-white/60">Approve a submission to publish it, or request changes with a clear explanation.</p>
          </div>
          {tournaments.filter((item) => item.status === 'pending_review').length === 0 ? (
            <p className="rounded-xl bg-white/[0.04] p-4 text-sm text-white/55">No tournament submissions are waiting for review. Tournaments marked “open” below are already published and do not appear in this queue.</p>
          ) : tournaments.filter((item) => item.status === 'pending_review').map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-[#07130c] p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">{item.name}</h3>
                  <p className="mt-1 text-xs text-white/60">{item.turfName} · {item.organizerName} · {item.sportType} · revision {item.reviewRevision || 1}</p>
                  <p className="mt-2 text-xs text-white/70">{item.startDate} to {item.endDate} · {item.maxTeams} teams</p>
                  {item.description && <p className="mt-2 text-xs text-white/55">{item.description}</p>}
                </div>
                <button type="button" disabled={reviewBusyId === item.id} onClick={() => void handleTournamentReview(item, 'approve')} className="rounded-lg bg-[#C8FF5E] px-4 py-2 text-xs font-black text-[#0A1E14] disabled:opacity-50">Approve and publish</button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea maxLength={2000} value={reviewMessages[item.id] || ''} onChange={(event) => setReviewMessages((previous) => ({ ...previous, [item.id]: event.target.value }))} rows={2} placeholder="Explain what the owner needs to change" className="min-h-16 flex-1 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs text-white placeholder:text-white/35" />
                <button type="button" disabled={reviewBusyId === item.id} onClick={() => void handleTournamentReview(item, 'request_changes')} className="self-start rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">Request changes</button>
              </div>
            </div>
          ))}
          {tournaments.some((item) => item.status === 'changes_requested') && (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-amber-200">Waiting for owner revisions</h3>
              {tournaments.filter((item) => item.status === 'changes_requested').map((item) => (
                <div key={item.id} className="rounded-lg bg-white/[0.04] p-3 text-xs text-white/70">
                  <strong className="text-white">{item.name}</strong> · {item.organizerName} · submitted revision {item.reviewRevision || 1}
                  <p className="mt-1 text-amber-100/80">Requested changes: {item.reviewMessage}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e271a] p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white/70">Sport:</span>
          <div className="flex flex-wrap gap-1.5">
            {['All', 'Football', 'Cricket', 'Futsal', 'Badminton'].map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => setSelectedSport(sport)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedSport === sport
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/60 hover:text-white bg-white/5'
                }`}
              >
                {sport}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white/70">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-[#07130c] border border-white/15 rounded-xl px-3 py-1.5 text-white text-xs focus:border-[#C8FF5E] outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="pending_review">Awaiting Admin Review</option>
            <option value="changes_requested">Changes Requested</option>
            <option value="open">Registration Open</option>
            <option value="registration_closed">Registration Closed</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Tournament Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTournaments.map((t) => {
          const teamsInTournament = tournamentTeams.filter(
            (team) => team.tournamentId === t.id && ['registered','pending_roster'].includes(team.status)
          );
          const isOrganizer = t.organizerId === currentUser.id || currentUser.role === 'admin';
          const myTeam = tournamentTeams.find(
            (team) => team.tournamentId === t.id && team.captainId === currentUser.id && ['registered','pending_roster'].includes(team.status)
          );

          return (
            <div
              key={t.id}
              className="bg-[#0A1E14] border border-white/10 hover:border-[#C8FF5E]/30 transition-all rounded-3xl p-5 flex flex-col justify-between shadow-xl space-y-4"
            >
              <div className="space-y-3">
                {/* Top Status & Sport */}
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] font-bold text-[11px] border border-[#C8FF5E]/30 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" /> {t.sportType}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${
                      t.status === 'open'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : t.status === 'ongoing'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : t.status === 'completed'
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        : 'bg-white/10 text-white/60 border-white/10'
                    }`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Tournament Name & Venue */}
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">{t.name}</h3>
                  <p className="text-xs text-white/60 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#C8FF5E]" /> {t.turfName}
                  </p>
                </div>

                {/* Details Box */}
                <div className="p-3.5 bg-[#07130c] rounded-2xl border border-white/10 text-xs space-y-2">
                  <div className="flex justify-between text-white/80">
                    <span className="text-white/50">Format:</span>
                    <span className="font-semibold text-white">{t.format}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-white/50">Dates:</span>
                    <span className="font-semibold text-white">
                      {t.startDate} - {t.endDate}
                    </span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-white/50">Teams / Places Held:</span>
                    <span className="font-bold text-[#C8FF5E]">
                      {teamsInTournament.length} / {t.maxTeams} Teams
                    </span>
                  </div>
                  {t.entryFeeAmount !== undefined && (
                    <div className="flex justify-between text-white/80 pt-1 border-t border-white/5">
                      <span className="text-white/50">Entry Fee (Offline):</span>
                      <span className="font-bold text-amber-300">৳{t.entryFeeAmount.toLocaleString()}</span>
                    </div>
                  )}
                  {t.prizePoolNote && (
                    <div className="flex justify-between text-white/80">
                      <span className="text-white/50">Prize Pool:</span>
                      <span className="font-bold text-[#C8FF5E] text-[11px] truncate max-w-[160px]">
                        {t.prizePoolNote}
                      </span>
                    </div>
                  )}
                </div>

                {t.description && (
                  <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                )}
                {currentUser.role === 'turf_owner' && t.organizerId === currentUser.id && t.status === 'changes_requested' && (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-950/20 p-3 text-xs text-amber-100">
                    <strong>Admin requested changes:</strong> {t.reviewMessage}
                    <p className="mt-1 text-amber-100/65">Edit the tournament, save your updates, then resubmit it for review.</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTournament(t);
                    setActiveDetailsTab('overview');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  View Details & Fixtures
                </button>

                {myTeam ? (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                    {myTeam.status === 'pending_roster' ? `Awaiting teammates: ${myTeam.teamName}` : `Registered: ${myTeam.teamName} ✓`}
                  </span>
                ) : isOrganizer ? (
                  <span className="text-[11px] font-bold text-[#C8FF5E] bg-[#C8FF5E]/15 px-3 py-1.5 rounded-xl border border-[#C8FF5E]/30">
                    Organizer
                  </span>
                ) : t.status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => openTeamRegistration(t)}
                    className="px-4 py-2 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] text-xs font-black shadow-md transition-all cursor-pointer"
                  >
                    Register Team
                  </button>
                ) : (
                  <span className="text-xs text-white/40 font-semibold">Registration Closed</span>
                )}
                {isOrganizer && !['cancelled', 'completed'].includes(t.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTournamentId(t.id);
                      setTTurfId(t.turfId);
                      setTName(t.name);
                      setTSport(t.sportType);
                      setTFormat(t.format || '');
                      setTStartDate(t.startDate.slice(0, 10));
                      setTEndDate(t.endDate.slice(0, 10));
                      setTMaxTeams(t.maxTeams);
                      setTTeamSize(t.teamSize || 2);
                      setTEntryFee(t.entryFeeAmount || 0);
                      setTPrizePool(t.prizePoolNote || '');
                      setTDesc(t.description || '');
                      setCreateError('');
                      setShowCreateModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold cursor-pointer"
                  >
                    Edit
                  </button>
                )}
                {currentUser.role === 'turf_owner' && t.organizerId === currentUser.id && t.status === 'changes_requested' && (
                  <button type="button" disabled={reviewBusyId === t.id} onClick={async () => {
                    setReviewBusyId(t.id);
                    try { await resubmitTournament(t.id); }
                    catch (error) { showAppAlert(error instanceof Error ? error.message : 'Unable to resubmit tournament.'); }
                    finally { setReviewBusyId(null); }
                  }} className="px-3 py-2 rounded-xl bg-[#C8FF5E] text-[#0A1E14] text-xs font-black disabled:opacity-50">
                    Resubmit for review
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredTournaments.length === 0 && (
          <div className="col-span-full text-center py-16 bg-[#0A1E14] border border-white/10 rounded-3xl p-8 space-y-4">
            <Trophy className="w-12 h-12 text-[#C8FF5E]/40 mx-auto" />
            <h3 className="text-lg font-bold text-white">No Tournaments Found</h3>
            <p className="text-xs text-white/60 max-w-md mx-auto">
              No tournaments match your current filters. Check back soon or create one if you manage a turf!
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: TOURNAMENT DETAILS DRAWER (OVERVIEW, TEAMS, FIXTURES)            */}
      {/* ========================================================================= */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#C8FF5E]" /> {selectedTournament.name}
                </h3>
                <p className="text-xs text-white/60">
                  {selectedTournament.turfName} • {selectedTournament.sportType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTournament(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-white/10 gap-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveDetailsTab('overview')}
                className={`pb-2 transition-all cursor-pointer ${
                  activeDetailsTab === 'overview'
                    ? 'border-b-2 border-[#C8FF5E] text-[#C8FF5E]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('teams')}
                className={`pb-2 transition-all cursor-pointer ${
                  activeDetailsTab === 'teams'
                    ? 'border-b-2 border-[#C8FF5E] text-[#C8FF5E]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Teams ({tournamentTeams.filter((t) => t.tournamentId === selectedTournament.id && t.status === 'registered').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('matches')}
                className={`pb-2 transition-all cursor-pointer ${
                  activeDetailsTab === 'matches'
                    ? 'border-b-2 border-[#C8FF5E] text-[#C8FF5E]'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Fixtures & Matches ({tournamentMatches.filter((m) => m.tournamentId === selectedTournament.id).length})
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeDetailsTab === 'overview' && (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-[#07130c] rounded-2xl border border-white/10 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-white/60">Hosting Turf:</span>
                    <span className="font-bold text-white">{selectedTournament.turfName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Tournament Dates:</span>
                    <span className="font-semibold text-white">
                      {selectedTournament.startDate} to {selectedTournament.endDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Format:</span>
                    <span className="font-semibold text-white">{selectedTournament.format}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Organizer:</span>
                    <span className="font-semibold text-white">{selectedTournament.organizerName}</span>
                  </div>
                  {selectedTournament.entryFeeAmount !== undefined && (
                    <div className="flex justify-between pt-1 border-t border-white/5">
                      <span className="text-white/60">Entry Fee (Per Team):</span>
                      <span className="font-bold text-amber-300">
                        ৳{selectedTournament.entryFeeAmount.toLocaleString()} (Paid directly to organizer)
                      </span>
                    </div>
                  )}
                  {selectedTournament.prizePoolNote && (
                    <div className="flex justify-between">
                      <span className="text-white/60">Prize Pool / Awards:</span>
                      <span className="font-bold text-[#C8FF5E]">{selectedTournament.prizePoolNote}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Rules & Information</h4>
                  <p className="text-white/70 leading-relaxed bg-white/[0.03] p-3 rounded-2xl border border-white/5">
                    {selectedTournament.description}
                  </p>
                </div>

                {/* Organizer Controls */}
                {(selectedTournament.organizerId === currentUser.id || currentUser.role === 'admin') && (
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[11px] text-white/50">Organizer Actions:</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await cancelTournament(selectedTournament.id);
                          setSelectedTournament(null);
                        } catch (error) {
                          showAppAlert(error instanceof Error ? error.message : 'Unable to cancel tournament.');
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Cancel Tournament
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: REGISTERED TEAMS */}
            {activeDetailsTab === 'teams' && (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <div className="text-white/60">
                    <span>Confirmed Teams ({tournamentTeams.filter((t) => t.tournamentId === selectedTournament.id && t.status === 'registered').length} / {selectedTournament.maxTeams})</span>
                    {tournamentTeams.some((t) => t.tournamentId === selectedTournament.id && t.status === 'pending_roster') && <span className="ml-2 text-amber-200">· {tournamentTeams.filter((t) => t.tournamentId === selectedTournament.id && t.status === 'pending_roster').length} awaiting roster</span>}
                  </div>
                  {selectedTournament.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => openTeamRegistration(selectedTournament)}
                      className="px-3 py-1.5 bg-[#C8FF5E] text-[#0A1E14] font-bold rounded-lg text-xs cursor-pointer"
                    >
                      + Register a Team
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {tournamentTeams
                    .filter((team) => team.tournamentId === selectedTournament.id)
                    .map((team, idx) => {
                      const isCaptain = team.captainId === currentUser.id;
                      return (
                        <div
                          key={team.id}
                          className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#C8FF5E]/20 text-[#C8FF5E] flex items-center justify-center font-bold text-[10px]">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-white text-sm">{team.teamName}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                  team.status === 'registered'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : team.status === 'pending_roster'
                                    ? 'bg-amber-500/20 text-amber-200'
                                    : 'bg-white/10 text-white/45'
                                }`}
                              >
                                {team.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-white/60 mt-1 flex items-center gap-3">
                              <span>Captain: {team.captainName}</span>
                              <span>📞 {team.captainPhone}</span>
                            </div>
                            {team.rosterNotes && (
                              <div className="text-[10px] text-white/50 mt-1 italic">
                                Roster: {team.rosterNotes}
                              </div>
                            )}
                            {(team.rosterMembers || []).map((member) => (
                              <div key={member.id} className={`mt-1 text-[11px] ${member.status === 'pending' ? 'text-amber-200/80' : 'text-white/65'}`}>
                                {member.memberName} · {member.status === 'pending' ? (isCaptain ? 'invitation sent; awaiting response' : 'invitation pending') : member.status === 'manual' ? 'manual roster entry' : 'confirmed'}
                              </div>
                            ))}
                          </div>

                          {isCaptain && ['registered','pending_roster'].includes(team.status) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const result = await withdrawTournamentTeam(selectedTournament.id, team.id);
                                if (!result.success) showAppAlert(result.message);
                              }}
                              className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      );
                    })}

                  {tournamentTeams.filter((t) => t.tournamentId === selectedTournament.id).length === 0 && (
                    <div className="text-center py-8 text-white/50">
                      No teams registered yet. Be the first team on the roster!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: FIXTURES & MATCHES */}
            {activeDetailsTab === 'matches' && (
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Scheduled Match Fixtures</span>
                  {(selectedTournament.organizerId === currentUser.id || currentUser.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => setShowAddMatchModal(true)}
                      className="px-3 py-1.5 bg-[#C8FF5E] text-[#0A1E14] font-bold rounded-lg text-xs cursor-pointer"
                    >
                      + Add Match Fixture
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {tournamentMatches
                    .filter((m) => m.tournamentId === selectedTournament.id)
                    .map((m) => {
                      const isOrganizer =
                        selectedTournament.organizerId === currentUser.id || currentUser.role === 'admin';
                      const isCompleted = m.status === 'completed';

                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-2xl bg-[#07130c] border border-white/10 space-y-2"
                        >
                          <div className="flex justify-between text-[11px] text-white/50">
                            <span className="font-bold text-[#C8FF5E]">{m.roundName}</span>
                            <span>
                              {m.scheduledDate} ({m.scheduledStartTime} - {m.scheduledEndTime})
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm font-bold text-white px-2">
                            <span className={m.winnerTeamId === m.teamAId ? 'text-[#C8FF5E]' : ''}>
                              {m.teamAName} {m.winnerTeamId === m.teamAId ? '🏆' : ''}
                            </span>
                            <div className="px-3 py-1 bg-white/10 rounded-lg text-xs font-mono text-center">
                              {isCompleted ? `${m.scoreA} - ${m.scoreB}` : 'VS'}
                            </div>
                            <span className={m.winnerTeamId === m.teamBId ? 'text-[#C8FF5E]' : ''}>
                              {m.teamBName} {m.winnerTeamId === m.teamBId ? '🏆' : ''}
                            </span>
                          </div>

                          {isOrganizer && (
                            <div className="pt-2 border-t border-white/5 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setMatchToScore(m);
                                  setScoreA(m.scoreA || 0);
                                  setScoreB(m.scoreB || 0);
                                  setShowScoreModal(true);
                                }}
                                className="text-[11px] font-semibold text-[#C8FF5E] hover:underline cursor-pointer"
                              >
                                {isCompleted ? 'Edit Score / Winner' : 'Record Score & Winner'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {tournamentMatches.filter((m) => m.tournamentId === selectedTournament.id).length === 0 && (
                    <div className="text-center py-8 text-white/50">
                      No match fixtures scheduled yet. The organizer will post brackets once registration closes.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REGISTER TEAM                                                    */}
      {/* ========================================================================= */}
      {showRegisterModal && selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="font-bold text-white text-base">Register Team for {selectedTournament.name}</h3>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Team Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dhaka Vipers FC"
                  value={regTeamName}
                  onChange={(e) => setRegTeamName(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                />
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Captain Info:</label>
                <div className="p-3 bg-[#07130c] rounded-xl border border-white/10 text-white/70 space-y-1">
                  <div>Name: {currentUser.name}</div>
                  <div>Phone: {currentUser.phone}</div>
                </div>
              </div>

              {selectedTournament.teamSize ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-white/80 font-semibold mb-1 block">Teammates ({selectedTournament.teamSize - 1} required):</label>
                    <p className="text-[10px] text-white/50">You are counted as the captain. Fill each remaining roster place with a name or invite a player account.</p>
                  </div>
                  {rosterDraft.map((slot,index) => (
                    <div key={index} className="rounded-xl border border-white/10 bg-[#07130c] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-white">Teammate {index + 1}</span>
                        <select value={slot.mode} onChange={(event) => setRosterDraft((previous) => previous.map((entry,slotIndex) => slotIndex === index ? { mode:event.target.value as RosterDraftSlot['mode'],memberName:'',query:'',results:[],searching:false } : entry))} className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-white">
                          <option value="manual">Enter name</option>
                          <option value="player">Find player</option>
                        </select>
                      </div>
                      {slot.mode === 'manual' ? (
                        <input required maxLength={100} value={slot.memberName} onChange={(event) => setRosterDraft((previous) => previous.map((entry,slotIndex) => slotIndex === index ? { ...entry,memberName:event.target.value } : entry))} placeholder="Teammate's name" className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white placeholder:text-white/35" />
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input value={slot.playerName || slot.query} disabled={Boolean(slot.playerId)} onChange={(event) => setRosterDraft((previous) => previous.map((entry,slotIndex) => slotIndex === index ? { ...entry,query:event.target.value,playerId:undefined,playerName:undefined } : entry))} placeholder="Search active players by name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-xs text-white placeholder:text-white/35 disabled:opacity-60" />
                            {slot.playerId ? <button type="button" onClick={() => setRosterDraft((previous) => previous.map((entry,slotIndex) => slotIndex === index ? { ...entry,playerId:undefined,playerName:undefined,query:'' } : entry))} className="rounded-lg border border-white/15 px-3 text-[10px] text-white/70">Change</button> : <button type="button" disabled={slot.searching} onClick={() => void searchRosterSlot(index)} className="rounded-lg bg-white/10 px-3 text-[10px] font-bold text-white disabled:opacity-50">{slot.searching ? 'Searching…' : 'Search'}</button>}
                          </div>
                          {slot.results.map((candidate) => <button key={candidate.id} type="button" onClick={() => setRosterDraft((previous) => previous.map((entry,slotIndex) => slotIndex === index ? { ...entry,playerId:candidate.id,playerName:candidate.name,query:candidate.name,results:[] } : entry))} className="block w-full rounded-lg border border-[#C8FF5E]/15 bg-[#C8FF5E]/[0.06] px-3 py-2 text-left text-xs text-white hover:bg-[#C8FF5E]/10">Invite {candidate.name}</button>)}
                          {slot.mode === 'player' && !slot.searching && slot.query.length >= 2 && slot.results.length === 0 && !slot.playerId && <p className="text-[10px] text-white/45">Search for active player accounts. Their invitation must be accepted before the roster is confirmed.</p>}
                        </div>
                      )}
                    </div>
                  ))}
                  <div>
                    <label className="text-white/70 font-semibold mb-1 block">Team notes (optional):</label>
                    <textarea value={regRosterNotes} onChange={(event) => setRegRosterNotes(event.target.value)} rows={2} maxLength={5000} placeholder="Optional notes for the organizer" className="w-full rounded-xl border border-white/15 bg-[#07130c] p-3 text-xs text-white placeholder:text-white/40" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Roster / Player Names (Optional):</label>
                  <textarea placeholder="e.g. Tanvir (GK), Rafiq (Def), Shakil (Mid), Nabil (Fwd)" value={regRosterNotes} onChange={(e) => setRegRosterNotes(e.target.value)} rows={3} className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white placeholder-white/40 focus:border-[#C8FF5E] outline-none" />
                </div>
              )}

              <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
                <span className="font-bold">Offline Payment Note:</span> If this tournament has an entry fee,
                settle it directly with the organizer ({selectedTournament.organizerName}) offline.
              </div>

              {regError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 text-rose-300 font-semibold rounded-xl">
                  {regError}
                </div>
              )}

              {regSuccess && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-semibold rounded-xl">
                  {regSuccess}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black cursor-pointer shadow-lg"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE TOURNAMENT                                                */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#C8FF5E]" /> {editingTournamentId ? 'Edit Tournament' : 'Host a Tournament'}
              </h3>
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setEditingTournamentId(null); }}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournamentSubmit} className="space-y-3.5 text-xs">
              <p className="rounded-xl border border-amber-400/20 bg-amber-950/20 p-3 text-[11px] leading-relaxed text-amber-100/80">
                This submission stays private until an admin approves it. If changes are requested, you can edit the tournament and resubmit it.
              </p>
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Hosting Turf Venue:</label>
                <select
                  required
                  value={tTurfId}
                  onChange={(e) => setTTurfId(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                >
                  {myTurfs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.area})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Tournament Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dhaka Champions Cup 2026"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Sport:</label>
                  <select
                    required
                    value={tSport}
                    onChange={(e) => setTSport(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    <option value="Football">Football</option>
                    <option value="Cricket">Cricket</option>
                    <option value="Futsal">Futsal</option>
                    <option value="Badminton">Badminton</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Format:</label>
                  <input
                    type="text"
                    value={tFormat}
                    onChange={(e) => setTFormat(e.target.value)}
                    placeholder="e.g. 7-a-side Knockout"
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Start Date:</label>
                  <input
                    type="date"
                    required
                    value={tStartDate}
                    onChange={(e) => setTStartDate(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">End Date:</label>
                  <input
                    type="date"
                    required
                    value={tEndDate}
                    onChange={(e) => setTEndDate(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Max Teams:</label>
                  <input
                    type="number"
                    required
                    min={2}
                    max={32}
                    value={tMaxTeams}
                    onChange={(e) => setTMaxTeams(Number(e.target.value))}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white font-bold focus:border-[#C8FF5E] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Players per team (including captain):</label>
                {editingTournamentId && !selectedTournament?.teamSize ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-white/55">This older tournament uses the legacy roster format.</p>
                ) : (
                  <input type="number" required min={2} max={100} value={tTeamSize} disabled={Boolean(editingTournamentId)} onChange={(event) => setTTeamSize(Number(event.target.value))} className="w-full rounded-xl border border-white/15 bg-[#07130c] p-2.5 text-white focus:border-[#C8FF5E] outline-none disabled:opacity-60" />
                )}
                <p className="mt-1 text-[10px] text-white/45">Set this when creating the tournament. Each team must fill every place.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Entry Fee (BDT, Display Only):</label>
                  <input
                    type="number"
                    value={tEntryFee}
                    onChange={(e) => setTEntryFee(Number(e.target.value))}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-[#C8FF5E] font-bold focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Prize Pool / Note:</label>
                  <input
                    type="text"
                    value={tPrizePool}
                    onChange={(e) => setTPrizePool(e.target.value)}
                    placeholder="e.g. ৳20,000 + Trophy"
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">Tournament Description & Rules:</label>
                <textarea
                  rows={3}
                  value={tDesc}
                  onChange={(e) => setTDesc(e.target.value)}
                  placeholder="Specify match timings, cleats policy, age brackets, or awards..."
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white placeholder-white/40 focus:border-[#C8FF5E] outline-none"
                />
              </div>

              {createError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 text-rose-300 font-semibold rounded-xl">
                  {createError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setEditingTournamentId(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black cursor-pointer shadow-lg"
                >
                  {editingTournamentId ? 'Save Changes' : 'Submit for Admin Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD MATCH FIXTURE                                                */}
      {/* ========================================================================= */}
      {showAddMatchModal && selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="font-bold text-white text-base">Schedule Match Fixture</h3>
              <button
                type="button"
                onClick={() => setShowAddMatchModal(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMatchSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-white/80 font-semibold mb-1 block">Round Name:</label>
                <input
                  type="text"
                  required
                  value={mRoundName}
                  onChange={(e) => setMRoundName(e.target.value)}
                  placeholder="e.g. Group A Match 1 or Quarter Final"
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-3 text-white focus:border-[#C8FF5E] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Team A:</label>
                  <select
                    value={mTeamAId}
                    onChange={(e) => setMTeamAId(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    <option value="">Select Team A</option>
                    {tournamentTeams
                      .filter((t) => t.tournamentId === selectedTournament.id && t.status === 'registered')
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.teamName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Team B:</label>
                  <select
                    value={mTeamBId}
                    onChange={(e) => setMTeamBId(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  >
                    <option value="">Select Team B</option>
                    {tournamentTeams
                      .filter((t) => t.tournamentId === selectedTournament.id && t.status === 'registered')
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.teamName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Date:</label>
                  <input
                    type="date"
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">Start Time:</label>
                  <input
                    type="time"
                    value={mStartTime}
                    onChange={(e) => setMStartTime(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div>
                  <label className="text-white/80 font-semibold mb-1 block">End Time:</label>
                  <input
                    type="time"
                    value={mEndTime}
                    onChange={(e) => setMEndTime(e.target.value)}
                    className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-white/80 font-semibold mb-1 block">
                  Reserve Turf Slot (Optional - Auto Blocks from Public):
                </label>
                <select
                  value={mSlotId}
                  onChange={(e) => setMSlotId(e.target.value)}
                  className="w-full bg-[#07130c] border border-white/15 rounded-xl p-2.5 text-white focus:border-[#C8FF5E] outline-none"
                >
                  <option value="">No automatic slot block</option>
                  {slots
                    .filter((s) => s.turfId === selectedTournament.turfId && s.status === 'available')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} ({formatBDTimeRange(s.startTime, s.endTime)}) - Slot #{s.id}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMatchModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black cursor-pointer shadow-lg"
                >
                  Save Fixture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: RECORD SCORE & WINNER                                            */}
      {/* ========================================================================= */}
      {showScoreModal && matchToScore && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b121e] border border-white/15 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="font-bold text-white text-base">Record Match Score</h3>
              <button
                type="button"
                onClick={() => setShowScoreModal(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveScoreSubmit} className="space-y-4 text-xs">
              <div className="text-center font-bold text-sm text-white">{matchToScore.roundName}</div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="space-y-1 text-center">
                  <span className="font-bold text-white truncate block">{matchToScore.teamAName}</span>
                  <input
                    type="number"
                    min={0}
                    value={scoreA}
                    onChange={(e) => setScoreA(Number(e.target.value))}
                    className="w-20 mx-auto text-center bg-[#07130c] border border-white/15 rounded-xl p-3 text-2xl font-black text-[#C8FF5E] focus:border-[#C8FF5E] outline-none"
                  />
                </div>
                <div className="space-y-1 text-center">
                  <span className="font-bold text-white truncate block">{matchToScore.teamBName}</span>
                  <input
                    type="number"
                    min={0}
                    value={scoreB}
                    onChange={(e) => setScoreB(Number(e.target.value))}
                    className="w-20 mx-auto text-center bg-[#07130c] border border-white/15 rounded-xl p-3 text-2xl font-black text-[#C8FF5E] focus:border-[#C8FF5E] outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScoreModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-white font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-black cursor-pointer shadow-lg"
                >
                  Save Score
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
