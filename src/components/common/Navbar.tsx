import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { formatBDDateTime } from '../../utils/datetime';
import { apiFetch } from '../../utils/apiClient';
import {
  Camera,
  ChevronDown,
  LogOut,
  LogIn,
  ShieldCheck,
  Building2,
  Users,
  Calendar,
  Wallet,
  Clock,
  PlusCircle,
  FileCheck,
  Scale,
  Settings as SettingsIcon,
  Heart,
  QrCode,
  Ticket,
  Trophy,
  Bell,
  CheckCheck,
} from 'lucide-react';

const vapidKeyToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const Navbar: React.FC = () => {
  const {
    currentUser,
    switchRoleDirectly,
    isAuthenticated,
    openSignInModal,
    openGetStartedModal,
    logoutUser,
    playerActiveTab,
    setPlayerActiveTab,
    ownerActiveTab,
    setOwnerActiveTab,
    adminActiveTab,
    setAdminActiveTab,
    setOpenOwnerManualBookingModal,
    setOpenStaffManualBookingModal,
    turfs,
    bookings,
    withdrawals,
    disputes,
    favorites,
    users,
    ownerProfiles,
    notifications,
    settings,
    markNotificationRead,
    clearAllNotifications,
    updateProfileImage,
  } = useApp();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [avatarUploadMessage, setAvatarUploadMessage] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setAvatarUploadMessage('Choose a JPEG, PNG, or WEBP image up to 10 MB.');
      return;
    }
    setAvatarUploading(true);
    setAvatarUploadMessage('Uploading profile image…');
    const result = await updateProfileImage(file);
    setAvatarUploadMessage(result.message);
    setAvatarUploading(false);
  };

  useEffect(() => {
    if (!isAuthenticated || !['player', 'turf_owner', 'admin'].includes(currentUser.role) || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.getRegistration('/service-worker.js').then((registration) => registration?.pushManager.getSubscription()).then((subscription) => {
      if (!cancelled) setPushEnabled(Boolean(subscription));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isAuthenticated, currentUser.id, currentUser.role]);

  const togglePushNotifications = async () => {
    setPushStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push notifications are not supported by this browser.');
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
        const endpointHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const response = await apiFetch(`/api/player/notifications/push-subscriptions/${endpointHash}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to disable push notifications.');
        await subscription.unsubscribe();
        setPushEnabled(false);
        setPushStatus('Push notifications disabled.');
        return;
      }
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser to enable push alerts.');
      const keyResponse = await apiFetch('/api/notifications/push/public-key');
      const keyResult = await keyResponse.json();
      if (!keyResponse.ok || !keyResult.success) throw new Error(keyResult.message || 'Web Push is not configured.');
      const created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(String(keyResult.data.publicKey)) });
      const response = await apiFetch('/api/player/notifications/push-subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: created.toJSON() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        await created.unsubscribe();
        throw new Error(result.message || 'Unable to enable push notifications.');
      }
      setPushEnabled(true);
      setPushStatus('Push notifications enabled.');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'Unable to update push notification settings.');
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    if (currentUser.role === 'player' && playerActiveTab !== 'explore') {
      setPlayerActiveTab('explore');
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Counts & Badges
  const pendingTurfsCount = turfs.filter(
    (t) => t.status === 'pending_review'
  ).length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;
  const openDisputesCount = disputes.filter((d) => d.status === 'pending' || d.status === 'investigating').length;

  const ownerTurfs = turfs.filter((t) => t.ownerId === currentUser.id);
  const ownerTurfIds = ownerTurfs.map((t) => t.id);
  const ownerBookings = bookings.filter((b) => ownerTurfIds.includes(b.turfId));
  const playerBookings = bookings.filter(
    (b) => b.playerId === currentUser.id || b.customerPhone === currentUser.phone
  );

  const currentUserNotifications = notifications.filter((item) => item.userId === currentUser.id);
  const isOwnerApproved = ownerProfiles.some((profile) => profile.userId === currentUser.id && profile.approvalStatus === 'active') && currentUser.status === 'active';
  const unreadNotificationsCount = currentUserNotifications.filter((item) => !item.read).length;

  const roleBadges: Record<UserRole, { label: string; bg: string; text: string }> = {
    player: { label: 'Player', bg: 'bg-[#C8FF5E]/15 border border-[#C8FF5E]/30', text: 'text-[#C8FF5E]' },
    turf_owner: { label: 'Turf Owner', bg: 'bg-[#C8FF5E]/15 border border-[#C8FF5E]/30', text: 'text-[#C8FF5E]' },
    staff: { label: 'Staff', bg: 'bg-emerald-500/20 border border-emerald-500/30', text: 'text-emerald-300' },
    admin: { label: 'Admin', bg: 'bg-amber-500/20 border border-amber-500/30', text: 'text-amber-300' },
  };

  // When logged in (portal view like StaffPortal with "Ground Check-In & Match Dispatch"),
  // the container expands to max-w-7xl so the logo moves to the LEFT and matches
  // the exact start alignment of the portal header ("Ground Check-In & Match Dispatch").
  // On public home page, it strictly stays max-w-6xl so the home page layout remains untouched.
  const isPortalView = isAuthenticated && (currentUser.role !== 'player' || playerActiveTab !== 'explore');

  const headerClass = isScrolled
    ? 'sticky top-0 left-0 right-0 z-50 transition-all duration-300 bg-[#0A1E14]/95 backdrop-blur-xl border-b border-white/[0.08] py-2.5 shadow-2xl shadow-black/40'
    : 'sticky top-0 left-0 right-0 z-50 transition-all duration-300 bg-[#0A1E14]/90 backdrop-blur-md border-b border-white/[0.08] py-3';

  const navContainerClass = isPortalView
    ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 lg:gap-6 transition-all duration-300'
    : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 lg:gap-6 transition-all duration-300';

  return (
    <header className={headerClass}>
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleProfileImageChange} aria-label="Choose profile image" />
      <div className={navContainerClass}>
        {/* Left: Brand Logo */}
        <a
          id="nav-brand-logo"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (currentUser.role === 'player') {
              setPlayerActiveTab('explore');
            }
            scrollToSection('home');
          }}
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
        >
          <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#C8FF5E] flex items-center justify-center text-[#0A1E14] font-black text-base sm:text-lg shadow-sm shadow-[#C8FF5E]/20 transition-transform group-hover:scale-105 select-none">
            ⚽
          </span>
          <span className="font-playfair text-xl sm:text-2xl font-black tracking-tight text-white">
            Turfy<span className="text-[#C8FF5E]">Slot</span>
          </span>
        </a>

        {/* Keep public discovery links available to signed-in players too. */}
        {(!isAuthenticated || currentUser.role === 'player') && (
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <button
              onClick={() => scrollToSection('turfs')}
              className="text-sm font-medium text-white/80 hover:text-[#C8FF5E] transition-colors cursor-pointer"
            >
              Find Turf
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-sm font-medium text-white/80 hover:text-[#C8FF5E] transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-sm font-medium text-white/80 hover:text-[#C8FF5E] transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('testimonials')}
              className="text-sm font-medium text-white/80 hover:text-[#C8FF5E] transition-colors cursor-pointer"
            >
              Testimonials
            </button>
          </nav>
        )}

        {/* Right: Auth Controls & Profile */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {!isAuthenticated ? (
            <>
              {/* LOGIN / SIGN IN BUTTON */}
              <button
                id="nav-login-btn"
                aria-label="Login"
                onClick={() => openSignInModal()}
                className="hidden min-[400px]:flex px-2.5 sm:px-5 py-2 rounded-full border border-white/20 hover:border-[#C8FF5E] hover:bg-white/10 text-white font-semibold text-[11px] sm:text-sm transition-all duration-300 items-center gap-1 sm:gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#C8FF5E]" />
                <span className="hidden min-[400px]:inline">Login</span>
              </button>

              {/* GET STARTED BUTTON */}
              <button
                id="nav-getstarted-btn"
                onClick={() => openGetStartedModal()}
                className="hidden min-[400px]:flex px-2.5 sm:px-5 py-2 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-[11px] sm:text-sm transition-all duration-300 shadow-[0_4px_20px_rgba(200,255,94,0.25)] hover:-translate-y-0.5 items-center gap-1.5 cursor-pointer"
              >
                <span className="sm:hidden">Sign Up</span>
                <span className="hidden sm:inline">Get Started</span>
              </button>
            </>
          ) : (
            /* Authenticated User: Login & Get Started disappear! */
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowNotificationsPanel((prev) => !prev)}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] border border-white/10 text-white hover:bg-white/[0.14] transition-colors cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C8FF5E] px-1 text-[10px] font-black text-[#0A1E14]">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                {showNotificationsPanel && (
                  <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-[#0A1E14] border border-white/15 rounded-2xl shadow-2xl p-3 z-50 text-slate-100 backdrop-blur-2xl animate-fadeIn">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div>
                        <div className="text-sm font-black text-white">Notifications Center</div>
                        <div className="text-[10px] uppercase tracking-wider text-white/50">
                          {unreadNotificationsCount} unread
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowNotificationsPanel(false)}
                          className="text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => clearAllNotifications()}
                          className="flex items-center gap-1 rounded-full bg-white/[0.08] border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors cursor-pointer"
                        >
                          <CheckCheck className="w-3 h-3" />
                          Mark all read
                        </button>
                      </div>
                    </div>

                    {isAuthenticated && ['player', 'turf_owner', 'admin'].includes(currentUser.role) && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <div>
                          <div className="text-[11px] font-bold text-white">Browser push alerts</div>
                          {pushStatus && <div className="mt-1 text-[10px] text-white/60">{pushStatus}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => void togglePushNotifications()}
                          className="shrink-0 rounded-full border border-[#C8FF5E]/40 px-2.5 py-1 text-[10px] font-bold text-[#C8FF5E] hover:bg-[#C8FF5E]/10 transition-colors cursor-pointer"
                        >
                          {pushEnabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    )}

                    <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {currentUserNotifications.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-[#07130c] p-4 text-center text-[11px] text-white/50">
                          No notifications yet.
                        </div>
                      ) : (
                        currentUserNotifications.map((notification) => (
                          <button
                            key={notification.id}
                            onClick={() => markNotificationRead(notification.id)}
                            className={`w-full rounded-xl border p-3 text-left transition-all ${
                              notification.read
                                ? 'border-white/10 bg-white/[0.02]'
                                : 'border-[#C8FF5E]/30 bg-[#C8FF5E]/10 shadow-[0_8px_20px_rgba(200,255,94,0.08)]'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black uppercase ${
                                  notification.type === 'payment'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : notification.type === 'refund'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : notification.type === 'approval'
                                    ? 'bg-[#C8FF5E]/15 text-[#C8FF5E]'
                                    : notification.type === 'dispute'
                                    ? 'bg-rose-500/15 text-rose-300'
                                    : 'bg-sky-500/15 text-sky-300'
                                }`}
                              >
                                {notification.type.substring(0, 1).toUpperCase()}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className={`text-xs font-bold ${notification.read ? 'text-white/60' : 'text-white'}`}>{notification.title}</div>
                                  {notification.read ? (
                                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45">Read</span>
                                  ) : (
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#C8FF5E]" />
                                  )}
                                </div>

                                <div className={`mt-1 text-[11px] leading-relaxed ${notification.read ? 'text-white/45' : 'text-white/70'}`}>{notification.message}</div>
                                <div className={`mt-1.5 text-[10px] uppercase tracking-wider ${notification.read ? 'text-white/30' : 'text-white/45'}`}>
                                  {formatBDDateTime(notification.createdAt)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Role Badge */}
              <span
                className={`hidden xl:inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider items-center gap-1.5 ${
                  roleBadges[currentUser.role]?.bg
                } ${roleBadges[currentUser.role]?.text}`}
              >
                {currentUser.role === 'turf_owner' && <Building2 className="w-3 h-3" />}
                {currentUser.role === 'staff' && <Users className="w-3 h-3" />}
                {currentUser.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                {currentUser.role === 'player' && <Ticket className="w-3 h-3" />}
                <span>{roleBadges[currentUser.role]?.label}</span>
              </span>

              {/* User Dropdown Pill */}
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition-colors text-xs font-semibold cursor-pointer"
                  title="Account Settings & Role Switcher"
                >
                  <img
                    src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={currentUser.name}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-[#C8FF5E]"
                  />
                  <span className="text-white hidden sm:inline max-w-[100px] truncate">{currentUser.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-white/60" />
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-[#0A1E14] border border-white/15 rounded-2xl shadow-2xl p-2.5 z-50 text-slate-100 backdrop-blur-2xl animate-fadeIn">
                    <div className="p-2.5 border-b border-white/10 mb-1">
                      <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                      <div className="text-[11px] text-white/60 truncate">{currentUser.email}</div>
                      <div className="mt-1">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                            roleBadges[currentUser.role]?.bg
                          } ${roleBadges[currentUser.role]?.text}`}
                        >
                          Role: {roleBadges[currentUser.role]?.label}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4 text-[#C8FF5E]" />
                      <span>{avatarUploading ? 'Uploading photo…' : 'Change profile photo'}</span>
                    </button>
                    {avatarUploadMessage && <p className="px-2 pb-2 text-[11px] text-white/60">{avatarUploadMessage}</p>}

                    {/* Role quick actions */}
                    {currentUser.role === 'player' && (
                      <>
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setPlayerActiveTab('my_bookings');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Ticket className="w-4 h-4 text-[#C8FF5E]" />
                          <span>My Bookings & Passes ({playerBookings.length})</span>
                        </button>
                        {settings.featureFlags?.squad_enabled && <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setPlayerActiveTab('squads');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Users className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Squad Finder</span>
                        </button>}
                        {settings.featureFlags?.tournament_enabled && <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setPlayerActiveTab('tournaments');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Trophy className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Tournaments</span>
                        </button>}
                      </>
                    )}

                    {currentUser.role === 'turf_owner' && isOwnerApproved && (
                      <>
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setOwnerActiveTab('wallet');
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Wallet className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Wallet & Earnings Payouts</span>
                        </button>
                        {settings.featureFlags?.tournament_enabled && <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setOwnerActiveTab('tournaments');
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Trophy className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Ground Tournaments</span>
                        </button>}
                      </>
                    )}

                    {currentUser.role === 'admin' && (
                      <>
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setAdminActiveTab('approvals');
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <FileCheck className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Review Approvals Queue ({pendingTurfsCount})</span>
                        </button>
                        {settings.featureFlags?.tournament_enabled && <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            setAdminActiveTab('tournaments');
                          }}
                          className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Trophy className="w-4 h-4 text-[#C8FF5E]" />
                          <span>Tournaments Oversight</span>
                        </button>}
                      </>
                    )}

                    <button
                      onClick={() => {
                        setShowUserDropdown(false);
                        openSignInModal();
                      }}
                      className="w-full text-left p-2 rounded-xl hover:bg-white/10 text-xs font-medium text-[#C8FF5E] flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Switch Role / Dashboard</span>
                    </button>

                    <div className="pt-1 mt-1 border-t border-white/10">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          logoutUser();
                        }}
                        className="w-full text-left p-2 rounded-xl text-xs text-rose-400 hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-2 text-white transition-colors hover:text-[#C8FF5E] cursor-pointer md:hidden"
            aria-label="Toggle Navigation Menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
          >
            <span className="relative flex h-5 w-6 flex-col justify-center" aria-hidden="true">
              <span
                className={`absolute h-0.5 w-6 rounded-full bg-current transition-[rotate,top] duration-300 ease-in-out motion-reduce:transition-none ${
                  mobileMenuOpen ? 'top-1/2 rotate-45' : 'top-0 rotate-0'
                }`}
              />
              <span
                className={`absolute top-1/2 h-0.5 w-6 -translate-y-1/2 rounded-full bg-current transition-[opacity,scale] duration-200 ease-in-out motion-reduce:transition-none ${
                  mobileMenuOpen ? 'scale-x-0 opacity-0' : 'scale-x-100 opacity-100'
                }`}
              />
              <span
                className={`absolute h-0.5 w-6 rounded-full bg-current transition-[rotate,top] duration-300 ease-in-out motion-reduce:transition-none ${
                  mobileMenuOpen ? 'top-1/2 -rotate-45' : 'top-full -rotate-0'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Accessible on all mobile screen sizes) */}
      {mobileMenuOpen && (
        <div id="mobile-navigation-menu" className="md:hidden bg-[#0A1E14] border-b border-white/10 px-5 py-4 space-y-4 animate-fadeIn max-h-[85vh] overflow-y-auto no-scrollbar">
          {isAuthenticated && currentUser.role === 'player' && (
            <nav aria-label="Public site navigation" className="flex flex-col space-y-2 pb-3 border-b border-white/10">
              {[
                ['turfs', 'Find Turf'],
                ['features', 'Features'],
                ['how-it-works', 'How It Works'],
                ['testimonials', 'Testimonials'],
              ].map(([section, label]) => (
                <button
                  key={section}
                  onClick={() => scrollToSection(section)}
                  className="text-left text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05] font-semibold text-sm py-2 px-3 rounded-xl transition-all"
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {/* Public / Unauthenticated Home Nav */}
          {!isAuthenticated ? (
            <nav className="flex flex-col space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection('turfs');
                }}
                className="text-left text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05] font-semibold text-sm py-2 px-3 rounded-xl transition-all"
              >
                Find Turf
              </button>

              <button
                onClick={() => scrollToSection('features')}
                className="text-left text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05] font-semibold text-sm py-2 px-3 rounded-xl transition-all"
              >
                Features
              </button>

              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-left text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05] font-semibold text-sm py-2 px-3 rounded-xl transition-all"
              >
                How It Works
              </button>

              <button
                onClick={() => scrollToSection('testimonials')}
                className="text-left text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05] font-semibold text-sm py-2 px-3 rounded-xl transition-all"
              >
                Testimonials
              </button>
            </nav>
          ) : (
            <>
              {/* Active Role Identifier */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-white/60">Current Session:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    roleBadges[currentUser.role]?.bg
                  } ${roleBadges[currentUser.role]?.text}`}
                >
                  <span>{roleBadges[currentUser.role]?.label} Workspace</span>
                </span>
              </div>

              {/* 1. PLAYER MOBILE NAV */}
              {currentUser.role === 'player' && (
                <nav className="flex flex-col space-y-2">
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPlayerActiveTab('explore');
                      scrollToSection('turfs');
                    }}
                    className={`text-left font-semibold text-sm py-2 px-3 rounded-xl transition-all ${
                      playerActiveTab === 'explore'
                        ? 'bg-[#C8FF5E] text-[#0A1E14]'
                        : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                    }`}
                  >
                    Find Turf & Bookings
                  </button>

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPlayerActiveTab('my_bookings');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`text-left font-semibold text-sm py-2 px-3 rounded-xl transition-all flex items-center justify-between ${
                      playerActiveTab === 'my_bookings'
                        ? 'bg-[#C8FF5E] text-[#0A1E14]'
                        : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                    }`}
                  >
                    <span>My Bookings & Tickets</span>
                    {playerBookings.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-[#C8FF5E]/20 text-[#C8FF5E] font-bold">
                        {playerBookings.length}
                      </span>
                    )}
                  </button>

                  {settings.featureFlags?.squad_enabled && <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPlayerActiveTab('squads');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`text-left font-semibold text-sm py-2 px-3 rounded-xl transition-all flex items-center justify-between ${
                      playerActiveTab === 'squads'
                        ? 'bg-[#C8FF5E] text-[#0A1E14]'
                        : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Squad Finder</span>
                    </div>
                  </button>}

                  {settings.featureFlags?.tournament_enabled && <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPlayerActiveTab('tournaments');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`text-left font-semibold text-sm py-2 px-3 rounded-xl transition-all flex items-center justify-between ${
                      playerActiveTab === 'tournaments'
                        ? 'bg-[#C8FF5E] text-[#0A1E14]'
                        : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      <span>Tournaments</span>
                    </div>
                  </button>}

                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPlayerActiveTab('favorites');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`text-left font-semibold text-sm py-2 px-3 rounded-xl transition-all flex items-center justify-between ${
                      playerActiveTab === 'favorites'
                        ? 'bg-[#C8FF5E] text-[#0A1E14]'
                        : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                    }`}
                  >
                    <span>Saved Grounds</span>
                    <span className="text-xs text-white/50">{favorites.length}</span>
                  </button>
                </nav>
              )}
            </>
          )}

          {/* 2. TURF OWNER MOBILE NAV */}
          {currentUser.role === 'turf_owner' && isOwnerApproved && (
            <nav className="flex flex-col space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('bookings');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  ownerActiveTab === 'bookings'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Bookings Management</span>
                </div>
                <span className="text-xs font-bold">{ownerBookings.length}</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('turfs');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  ownerActiveTab === 'turfs'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>My Listed Grounds</span>
                </div>
                <span className="text-xs font-bold">{ownerTurfs.length}</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('slots');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  ownerActiveTab === 'slots'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Slot Schedule & Blocker</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('staff');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  ownerActiveTab === 'staff'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Staff Team & Permissions</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('wallet');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  ownerActiveTab === 'wallet'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>Wallet & Payout Requests</span>
              </button>

              {settings.featureFlags?.tournament_enabled && <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOwnerActiveTab('tournaments');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  ownerActiveTab === 'tournaments'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span>Ground Tournaments</span>
              </button>}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOpenOwnerManualBookingModal(true);
                }}
                className="w-full py-2.5 rounded-xl bg-[#C8FF5E] text-[#0A1E14] font-bold text-xs flex items-center justify-center gap-1.5 shadow-md mt-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ New Manual Booking (0 TK Gateway)</span>
              </button>
            </nav>
          )}

          {/* 3. STAFF MOBILE NAV */}
          {currentUser.role === 'staff' && (
            <nav className="flex flex-col space-y-2">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" /> Ground Operations Terminal
                </div>
                <p className="text-[11px] text-white/60">
                  Scan player booking passes, monitor today's matches, or block damaged pitches.
                </p>
              </div>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setOpenStaffManualBookingModal(true);
                }}
                className="w-full py-2.5 rounded-xl bg-[#C8FF5E] text-[#0A1E14] font-bold text-xs flex items-center justify-center gap-1.5 shadow-md mt-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Counter / Walk-in Booking</span>
              </button>
            </nav>
          )}

          {/* 4. ADMIN MOBILE NAV */}
          {currentUser.role === 'admin' && (
            <nav className="flex flex-col space-y-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('approvals');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'approvals'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4" />
                  <span>Turf Approvals Queue</span>
                </div>
                {pendingTurfsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-amber-400 text-black font-black">
                    {pendingTurfsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('users');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'users'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>User Accounts & KYC</span>
                </div>
                <span className="text-xs text-white/50">{users.length}</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('withdrawals');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'withdrawals'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  <span>Withdrawal Payout Requests</span>
                </div>
                {pendingWithdrawalsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-amber-400 text-black font-black">
                    {pendingWithdrawalsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('bookings');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'bookings'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Master Bookings Oversight</span>
                </div>
                <span className="text-xs text-white/50">{bookings.length}</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('disputes');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'disputes'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  <span>Disputes & Refunds</span>
                </div>
                {openDisputesCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500 text-white font-black">
                    {openDisputesCount}
                  </span>
                )}
              </button>

              {settings.featureFlags?.tournament_enabled && <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('tournaments');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center justify-between ${
                  adminActiveTab === 'tournaments'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  <span>Tournaments Oversight</span>
                </div>
              </button>}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('policy_engine');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  adminActiveTab === 'policy_engine'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Flexible Cancellation Policy Engine</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('settings');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  adminActiveTab === 'settings'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Commission & Platform Settings</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAdminActiveTab('reports');
                }}
                className={`text-left font-semibold text-sm py-2 px-3 rounded-xl flex items-center gap-2 ${
                  adminActiveTab === 'reports'
                    ? 'bg-[#C8FF5E] text-[#0A1E14]'
                    : 'text-white/80 hover:text-[#C8FF5E] hover:bg-white/[0.05]'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>Reports & Analytics</span>
              </button>
            </nav>
          )}

          {/* User Status / Account in Mobile Drawer */}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
            {!isAuthenticated ? (
              <>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openSignInModal();
                  }}
                  className="w-full py-2.5 rounded-full border-2 border-white/25 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-[#C8FF5E]" />
                  <span>Login</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openGetStartedModal();
                  }}
                  className="w-full py-2.5 rounded-full bg-[#C8FF5E] text-[#0A1E14] font-bold text-sm shadow-md cursor-pointer"
                >
                  Get Started
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 p-2.5 bg-white/[0.05] rounded-xl">
                  <img
                    src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={currentUser.name}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-[#C8FF5E]"
                  />
                  <div className="truncate flex-1">
                    <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                    <div className="text-[11px] text-white/60 truncate">{currentUser.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-[#C8FF5E] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>{avatarUploading ? 'Uploading photo…' : 'Change profile photo'}</span>
                </button>
                {avatarUploadMessage && <p className="text-center text-[11px] text-white/60">{avatarUploadMessage}</p>}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openSignInModal();
                  }}
                  className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-[#C8FF5E] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Switch Role / Dashboard</span>
                </button>

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logoutUser();
                  }}
                  className="w-full py-2.5 rounded-xl bg-rose-950/40 text-rose-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
