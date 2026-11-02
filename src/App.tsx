import React, { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { SignInModal } from './components/common/SignInModal';
import { GetStartedModal } from './components/common/GetStartedModal';
import { EmailVerificationModal } from './components/common/EmailVerificationModal';
import { ScrollToTopButton } from './components/common/ScrollToTopButton';
import { AppDialogHost } from './components/common/AppDialog';

const PlayerPortal = lazy(() => import('./components/player/PlayerPortal').then((module) => ({ default: module.PlayerPortal })));
const OwnerPortal = lazy(() => import('./components/owner/OwnerPortal').then((module) => ({ default: module.OwnerPortal })));
const StaffPortal = lazy(() => import('./components/staff/StaffPortal').then((module) => ({ default: module.StaffPortal })));
const AdminPortal = lazy(() => import('./components/admin/AdminPortal').then((module) => ({ default: module.AdminPortal })));

const AppContent: React.FC = () => {
  const { currentUser, isSessionRestoring } = useApp();

  if (isSessionRestoring) {
    return <div className="flex min-h-screen items-center justify-center bg-[#07130c] text-sm font-medium text-slate-300" role="status">Restoring your session…</div>;
  }

  return (
    <div className="min-h-screen bg-[#07130c] text-slate-100 flex flex-col font-sans selection:bg-[#C8FF5E] selection:text-[#0A1E14]">
      {/* Global Navigation matching HTML template */}
      <Navbar />

      {/* Role-Specific Portal Content */}
      <main className="flex-1">
        <Suspense fallback={<div className="min-h-[40vh]" aria-label="Loading dashboard" />}>
          {currentUser.role === 'player' && <PlayerPortal />}
          {currentUser.role === 'turf_owner' && <OwnerPortal />}
          {currentUser.role === 'staff' && <StaffPortal />}
          {currentUser.role === 'admin' && <AdminPortal />}
        </Suspense>
      </main>

      {/* Interactive Auth Modals */}
      <SignInModal />
      <GetStartedModal />
      <EmailVerificationModal />
      <ScrollToTopButton />
      <AppDialogHost />

      {/* System Status Footer */}
      <footer className="bg-[#0A1E14] border-t border-white/10 py-6 text-xs text-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C8FF5E] animate-pulse"></span>
            <span className="text-white font-semibold">Turfyslot Marketplace Engine</span>
            <span className="text-white/40">• System Active</span>
          </div>
          <div className="text-white/50 text-center sm:text-right">
            Designed for VPS + Coolify + PostgreSQL • Ready for Database Migration
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
