import React from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { Shield, Sparkles, Building, UserCheck, AlertTriangle, LogIn, UserPlus } from 'lucide-react';

export const RoleSwitcherBanner: React.FC = () => {
  const { currentUser, switchRoleDirectly, openSignInModal, openGetStartedModal } = useApp();

  const roleDescriptions: Record<
    UserRole,
    { title: string; subtitle: string; icon: React.ReactNode; badgeClass: string; borderClass: string }
  > = {
    player: {
      title: 'Player Role Active',
      subtitle: 'Browse turfs in Dhaka, check live availability, lock slots for 10-min TTL, pay via SSLCommerz, view QR check-in & cancel with policy refund calculation.',
      icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      borderClass: 'border-emerald-500/20 bg-emerald-950/20',
    },
    turf_owner: {
      title: 'Turf Owner Role Active',
      subtitle: 'Manage turfs, define peak/off-peak rates, block maintenance slots, create Manual / Offline Bookings (0 TK gateway fee), invite Staff, and manage Wallet & Withdrawals.',
      icon: <Building className="w-4 h-4 text-indigo-400" />,
      badgeClass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      borderClass: 'border-indigo-500/20 bg-indigo-950/20',
    },
    staff: {
      title: 'Staff Role Active (Scoped Operations)',
      subtitle: 'Restricted strictly to assigned turf. Can check in players with QR code, complete bookings, block slots & create counter bookings. Financial data & wallet are strictly hidden.',
      icon: <UserCheck className="w-4 h-4 text-amber-400" />,
      badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      borderClass: 'border-amber-500/20 bg-amber-950/20',
    },
    admin: {
      title: 'System Admin Role Active',
      subtitle: 'Global platform control: Turf Owner verification queue, Turf listing approvals, Commission settings, Dispute arbitration, Withdrawal approvals & Flexible Cancellation Policy Engine.',
      icon: <Shield className="w-4 h-4 text-rose-400" />,
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      borderClass: 'border-rose-500/20 bg-rose-950/20',
    },
  };

  const currentInfo = roleDescriptions[currentUser.role];

  return (
    <div className={`border-b ${currentInfo.borderClass} px-4 py-2.5 transition-colors`}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={`p-1.5 rounded-lg border flex items-center justify-center shrink-0 ${currentInfo.badgeClass}`}>
            {currentInfo.icon}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{currentInfo.title}</span>
              <span className="text-[11px] text-slate-300 font-medium truncate">({currentUser.name})</span>
              {currentUser.status === 'pending_approval' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <AlertTriangle className="w-3 h-3" /> Awaiting Admin Approval
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 max-w-2xl line-clamp-1 hidden sm:block">{currentInfo.subtitle}</p>
          </div>
        </div>

        {/* Action Controls: Sign In / Select Role and Quick Jump */}
        <div className="flex items-center gap-2 self-end md:self-auto text-[11px] shrink-0">
          <button
            onClick={() => openSignInModal()}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Sign in to the role linked to your account"
          >
            <LogIn className="w-3 h-3" />
            <span>Sign In</span>
          </button>

          <div className="hidden xl:flex items-center gap-1 border-l border-slate-700 pl-2">
            <span className="text-slate-400 text-[10px] mr-0.5">Sign in:</span>
            {(['player', 'turf_owner', 'staff', 'admin'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => switchRoleDirectly(r)}
                className={`px-2 py-0.5 rounded-md font-medium capitalize transition-colors cursor-pointer ${
                  currentUser.role === r
                    ? 'bg-white text-slate-900 font-bold shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
