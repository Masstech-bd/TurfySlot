import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';
import { getPasswordStrength } from '../../utils/passwordStrength';
import {
  X,
  User as UserIcon,
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  LogIn,
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCcw,
} from 'lucide-react';

export const SignInModal: React.FC = () => {
  const {
    isSignInModalOpen,
    setIsSignInModalOpen,
    signInRolePreset,
    openGetStartedModal,
    loginWithCredentials,
    requestPasswordReset,
    resetPasswordWithCode,
    currentUser,
  } = useApp();

  const [selectedRole, setSelectedRole] = useState<UserRole>(signInRolePreset || currentUser.role || 'player');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [authStep, setAuthStep] = useState<'signin' | 'resetRequest' | 'otp' | 'resetPassword'>('signin');
  const [resetEmail, setResetEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Sync role preset if opened with one
  useEffect(() => {
    if (signInRolePreset) {
      setSelectedRole(signInRolePreset);
    }
  }, [signInRolePreset]);

  useEffect(() => {
    setLoginError('');
    setEmail('');
    setPassword('');
  }, [selectedRole]);

  if (!isSignInModalOpen) return null;

  const roleMeta: Record<
    UserRole,
    { label: string; icon: React.ReactNode; subtitle: string }
  > = {
    player: {
      label: 'Player',
      icon: <UserIcon className="w-4 h-4" />,
      subtitle: 'Book pitches, instant slot hold & match squads',
    },
    turf_owner: {
      label: 'Turf Owner',
      icon: <Building2 className="w-4 h-4" />,
      subtitle: 'Manage venues, 0 TK POS counter & wallet earnings',
    },
    staff: {
      label: 'Staff',
      icon: <Users className="w-4 h-4" />,
      subtitle: 'Pitch desk QR check-in & counter booking',
    },
    admin: {
      label: 'Admin',
      icon: <ShieldCheck className="w-4 h-4" />,
      subtitle: 'Full platform management & turf approvals',
    },
  };

  const resetAuthFlow = () => {
    setAuthStep('signin');
    setStatusMessage('');
    setResetEmail('');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');
    setLoading(true);
    const result = await loginWithCredentials(email, password);
    setLoading(false);
    if (!result.success) setLoginError(result.message);
  };

  const handleResetRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resetEmail.trim()) {
      setStatusMessage('Please enter your email to receive the reset code.');
      return;
    }

    const result = await requestPasswordReset(resetEmail.trim());
    setStatusMessage(result.message);
    if (result.success) {
      setAuthStep('otp');
    }
  };

  const handleVerifyOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!otpCode.trim()) {
      setStatusMessage('Please enter the code we emailed you.');
      return;
    }

    setStatusMessage('Code accepted. Please enter your new password.');
    setAuthStep('resetPassword');
  };

  const handlePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setStatusMessage('Please enter and confirm your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage('Passwords do not match. Please try again.');
      return;
    }

    if (!getPasswordStrength(newPassword).isStrong) {
      setStatusMessage('Password must be 8+ characters with upper & lower case letters, a number, and a symbol.');
      return;
    }

    const result = await resetPasswordWithCode(resetEmail.trim(), otpCode.trim(), newPassword.trim());
    setStatusMessage(result.message);
    if (!result.success) return;

    setAuthStep('signin');
    setEmail(resetEmail || email);
    setPassword(newPassword);
    setResetEmail('');
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={() => setIsSignInModalOpen(false)}
    >
      <div
        className="bg-[#0A1E14] border border-white/15 rounded-[28px] max-w-md w-full shadow-[0_25px_70px_rgba(0,0,0,0.6)] overflow-hidden text-white relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#C8FF5E] text-[#0A1E14] flex items-center justify-center font-bold shadow-md shadow-[#C8FF5E]/20">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                {authStep === 'signin'
                  ? 'Sign In to TurfySlot'
                  : authStep === 'resetRequest'
                  ? 'Password Reset'
                  : authStep === 'otp'
                  ? 'Verify OTP'
                  : 'Set New Password'}
              </h3>
              <p className="text-xs text-white/70">
                {authStep === 'signin'
                  ? 'Select your role to enter the workspace'
                  : authStep === 'resetRequest'
                  ? 'Recover your account securely'
                  : authStep === 'otp'
                  ? 'Enter the code sent to your email'
                  : 'Choose a secure new password'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetAuthFlow();
              setIsSignInModalOpen(false);
            }}
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {authStep === 'signin' && (
            <>
              <div>
                <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-2">
                  Select Your Role:
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-white/[0.06] rounded-2xl border border-white/10">
                  {(['player', 'turf_owner', 'staff', 'admin'] as UserRole[]).map((r) => {
                    const isSelected = selectedRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSelectedRole(r)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/30 scale-[1.02]'
                            : 'text-white/70 hover:text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {roleMeta[r].icon}
                        <span className="truncate w-full text-center text-[11px]">{roleMeta[r].label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#C8FF5E]/90 mt-2 text-center font-medium">
                  {roleMeta[selectedRole].subtitle}
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-white/70 block mb-1">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-white/70 block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#C8FF5E]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 font-medium">
                    {loginError}
                  </div>
                )}

                <p className="text-[10px] text-white/40 leading-relaxed">Sign in with the email and password registered for this Turfyslot account.</p>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm transition-all shadow-[0_8px_30px_rgba(200,255,94,0.35)] hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <span>Signing in...</span>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Sign In as {roleMeta[selectedRole].label}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      setAuthStep('resetRequest');
                      setStatusMessage('');
                    }}
                    className="text-xs text-[#C8FF5E] hover:text-[#A8E63E] transition-colors cursor-pointer font-semibold"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            </>
          )}

          {authStep === 'resetRequest' && (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-white/70 block mb-1">Email address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                Send reset OTP
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAuthStep('signin')}
                className="w-full py-2.5 rounded-full border border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
            </form>
          )}

          {authStep === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-2xl border border-[#C8FF5E]/20 bg-[#C8FF5E]/10 p-3">
                <p className="text-[11px] text-[#C8FF5E] font-semibold">Check your inbox</p>
                <p className="text-[11px] text-white/70 mt-1">We emailed a 6-digit code to your address. Enter it below to continue.</p>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-white/70 block mb-1">One-time password</label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  required
                  className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                  placeholder="Enter 6-digit code"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                Verify OTP
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAuthStep('resetRequest')}
                className="w-full py-2.5 rounded-full border border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08] font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCcw className="w-4 h-4" />
                Resend code
              </button>
            </form>
          )}

          {authStep === 'resetPassword' && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-white/70 block mb-1">New password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    placeholder="Enter new password"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-white/70 block mb-1">Confirm password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                Update password
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {statusMessage && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20 text-center text-xs text-white/60">
          {authStep === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => openGetStartedModal(selectedRole === 'turf_owner' ? 'turf_owner' : 'player')}
                className="text-[#C8FF5E] font-bold hover:underline cursor-pointer ml-1"
              >
                Get Started
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => resetAuthFlow()}
              className="text-[#C8FF5E] font-bold hover:underline cursor-pointer"
            >
              Return to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
