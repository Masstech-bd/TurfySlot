import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { OwnerBillingModel, UserRole } from '../../types';
import { getPasswordStrength } from '../../utils/passwordStrength';
import { formatBangladeshMobileInput, normalizeBangladeshMobile } from '../../utils/bangladeshPhone';
import {
  X,
  UserPlus,
  Trophy,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Lock,
  Mail,
  Phone,
  User as UserIcon,
  CreditCard,
  FileText,
  ShieldCheck,
  Check,
} from 'lucide-react';

export const GetStartedModal: React.FC = () => {
  const {
    isGetStartedModalOpen,
    setIsGetStartedModalOpen,
    openSignInModal,
    registerNewUser,
  } = useApp();

  const [role, setRole] = useState<'player' | 'turf_owner'>('player');
  const [step, setStep] = useState<1 | 2>(1);

  // Common credentials
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Turf Owner fields
  const [businessName, setBusinessName] = useState('');
  const [nidOrTradeLicense, setNidOrTradeLicense] = useState('');
  const [tradeLicenseFile, setTradeLicenseFile] = useState<File | null>(null);
  const [supportingBusinessFiles, setSupportingBusinessFiles] = useState<File[]>([]);
  const [registrationError, setRegistrationError] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank_account'>('bkash');
  const [accountNumber, setAccountNumber] = useState('');
  const [billingModel, setBillingModel] = useState<OwnerBillingModel | ''>('');
  const [monthlySubscriptionAmount, setMonthlySubscriptionAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const passwordStrength = getPasswordStrength(password);

  React.useEffect(() => {
    if (!isGetStartedModalOpen) return;
    fetch('/api/public/billing-options').then((response) => response.json()).then((result) => {
      if (result?.success) setMonthlySubscriptionAmount(Number(result.data?.monthlySubscriptionAmount || 0));
    }).catch(() => setMonthlySubscriptionAmount(0));
  }, [isGetStartedModalOpen]);

  if (!isGetStartedModalOpen) return null;

  const handleClose = () => {
    setIsGetStartedModalOpen(false);
    setStep(1);
  };

  const handleRoleSelect = (selectedRole: 'player' | 'turf_owner') => {
    setRole(selectedRole);
    setStep(1);
  };

  const handleNextStep = (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setRegistrationError('Enter your name, contact email, and phone number to continue.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setRegistrationError('Enter a valid contact email address.');
      return;
    }
    if (!normalizeBangladeshMobile(phone)) {
      setRegistrationError('Enter a valid Bangladesh mobile number, such as 01712345678 or +8801712345678.');
      return;
    }
    setRegistrationError('');
    if (!getPasswordStrength(password).isStrong) {
      setPasswordError('Password must be 8+ characters with upper & lower case letters, a number, and a symbol.');
      return;
    }
    setPasswordError('');
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role === 'turf_owner' && step === 1) {
      handleNextStep();
      return;
    }

    if (!getPasswordStrength(password).isStrong) {
      setPasswordError('Password must be 8+ characters with upper & lower case letters, a number, and a symbol.');
      return;
    }
    if (role === 'turf_owner') {
      if (!billingModel) {
        setRegistrationError('Choose a billing model for your turf owner account.');
        return;
      }
      if (!businessName.trim() || !nidOrTradeLicense.trim()) {
        setRegistrationError('Enter your business name and trade license number.');
        return;
      }
      if (!tradeLicenseFile) {
        setRegistrationError('Upload a copy of your trade license for admin review.');
        return;
      }
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(tradeLicenseFile.type)) {
        setRegistrationError('Trade license must be a PDF, JPG, PNG, or WEBP file.');
        return;
      }
      if (tradeLicenseFile.size > 10 * 1024 * 1024) {
        setRegistrationError('Trade license file must be 10 MB or smaller.');
        return;
      }
      const invalidSupportingFile = supportingBusinessFiles.find((file) =>
        !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024
      );
      if (invalidSupportingFile) {
        setRegistrationError('Each supporting document must be a PDF, JPG, PNG, or WEBP file no larger than 10 MB.');
        return;
      }
    }
    setPasswordError('');
    setRegistrationError('');

    setIsLoading(true);
    const finishRegistration = async (documentDataUrls: string[]) => {
      const businessVerificationDocuments = [
        ...(tradeLicenseFile ? [{ file: tradeLicenseFile, documentType: 'trade_license' as const }] : []),
        ...supportingBusinessFiles.map((file) => ({ file, documentType: 'supporting_business_document' as const })),
      ].map(({ file, documentType }, index) => ({
        fileName: file.name,
        mimeType: file.type,
        dataUrl: documentDataUrls[index],
        documentType,
      }));
      try {
        await registerNewUser({
          name: name.trim(),
          email: email.trim(),
          phone: normalizeBangladeshMobile(phone)!,
          role: role as UserRole,
          businessName: role === 'turf_owner' ? businessName.trim() : undefined,
          nidOrTradeLicense: role === 'turf_owner' ? nidOrTradeLicense.trim() : undefined,
          businessVerificationDocuments: role === 'turf_owner' ? businessVerificationDocuments : undefined,
          payoutMethod: role === 'turf_owner' ? payoutMethod : undefined,
          accountNumber: role === 'turf_owner' ? (accountNumber.trim() || '01712-345678') : undefined,
          billingModel: role === 'turf_owner' ? billingModel as OwnerBillingModel : undefined,
          password: password.trim() || undefined,
        });
      } catch (error) {
        setRegistrationError(error instanceof Error ? error.message : 'Unable to create the account.');
      } finally {
        setIsLoading(false);
      }
    };

    if (role === 'turf_owner' && tradeLicenseFile) {
      const files = [tradeLicenseFile, ...supportingBusinessFiles];
      Promise.all(files.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      })))
        .then(finishRegistration)
        .catch(() => {
          setIsLoading(false);
          setRegistrationError('Could not read the selected business documents. Please try again.');
        });
    } else {
      setTimeout(() => finishRegistration([]), 300);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={handleClose}
    >
      <div
        className="bg-[#0A1E14] border border-white/15 rounded-[28px] max-w-xl w-full shadow-[0_25px_70px_rgba(0,0,0,0.6)] overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#C8FF5E] text-[#0A1E14] flex items-center justify-center shadow-md shadow-[#C8FF5E]/20 font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold tracking-tight text-white">Get Started with TurfySlot</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C8FF5E]/15 text-[#C8FF5E] border border-[#C8FF5E]/30">
                  New Account
                </span>
              </div>
              <p className="text-xs text-white/70">Join the smart sports turf network</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator (Only for Turf Owner) */}
        {role === 'turf_owner' && (
          <div className="px-6 pt-4 pb-1">
            <div className="flex items-center gap-2">
              {/* Step 1 Indicator */}
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex items-center gap-2 flex-1 px-3 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                  step === 1
                    ? 'border-[#C8FF5E]/50 bg-[#C8FF5E]/15 text-[#C8FF5E]'
                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    step > 1
                      ? 'bg-[#C8FF5E] text-[#0A1E14]'
                      : step === 1
                      ? 'bg-[#C8FF5E] text-[#0A1E14]'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  {step > 1 ? <Check className="w-3 h-3 stroke-[3]" /> : '1'}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold leading-tight truncate">Account Login</div>
                  <div className="text-[9px] text-white/50 leading-tight">Credentials</div>
                </div>
              </button>

              <div className="w-3 h-0.5 bg-white/15 shrink-0" />

              {/* Step 2 Indicator */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className={`flex items-center gap-2 flex-1 px-3 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                  step === 2
                    ? 'border-[#C8FF5E]/50 bg-[#C8FF5E]/15 text-[#C8FF5E]'
                    : 'border-white/10 bg-white/[0.03] text-white/50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    step === 2 ? 'bg-[#C8FF5E] text-[#0A1E14]' : 'bg-white/10 text-white/60'
                  }`}
                >
                  2
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold leading-tight truncate">Venue & Payout</div>
                  <div className="text-[9px] text-white/50 leading-tight">Business Setup</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Form Body - Compact & No Scrolling */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* STEP 1: Role & Account Details */}
          {(role === 'player' || step === 1) && (
            <div className="space-y-4 animate-fadeIn">
              {/* Role Choice */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-white/70 block mb-2">
                  I want to join as:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRoleSelect('player')}
                    className={`p-3 rounded-2xl border text-left transition-all relative cursor-pointer ${
                      role === 'player'
                        ? 'border-[#C8FF5E] bg-[#C8FF5E]/10 ring-1 ring-[#C8FF5E]/40'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`p-1.5 rounded-xl ${
                          role === 'player' ? 'bg-[#C8FF5E] text-[#0A1E14]' : 'bg-white/10 text-white/60'
                        }`}
                      >
                        <Trophy className="w-4 h-4" />
                      </div>
                      {role === 'player' && <CheckCircle2 className="w-4 h-4 text-[#C8FF5E]" />}
                    </div>
                    <div className="mt-2">
                      <div className="text-sm font-bold text-white leading-snug">Player / Team</div>
                      <div className="text-[10px] text-white/60 mt-0.5">Book turfs & join squads</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleSelect('turf_owner')}
                    className={`p-3 rounded-2xl border text-left transition-all relative cursor-pointer ${
                      role === 'turf_owner'
                        ? 'border-[#C8FF5E] bg-[#C8FF5E]/10 ring-1 ring-[#C8FF5E]/40'
                        : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`p-1.5 rounded-xl ${
                          role === 'turf_owner' ? 'bg-[#C8FF5E] text-[#0A1E14]' : 'bg-white/10 text-white/60'
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      {role === 'turf_owner' && <CheckCircle2 className="w-4 h-4 text-[#C8FF5E]" />}
                    </div>
                    <div className="mt-2">
                      <div className="text-sm font-bold text-white leading-snug">Turf Facility Owner</div>
                      <div className="text-[10px] text-white/60 mt-0.5">List ground & receive bookings</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Personal Credentials */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-white/70 mb-1 block">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={role === 'player' ? 'e.g. Fahim Chowdhury' : 'e.g. Tanvir Ahmed'}
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@domain.com"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">Mobile Number</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatBangladeshMobileInput(e.target.value))}
                        placeholder="01XXXXXXXXX or +8801XXXXXXXXX"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/70 mb-1 block">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError('');
                      }}
                      placeholder="8+ chars, upper & lower case, number & symbol"
                      required
                      className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    />
                  </div>
                  {password && (
                    <div className="mt-1.5 space-y-1">
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((segment) => (
                          <div
                            key={segment}
                            className="h-1 rounded-full transition-colors"
                            style={{
                              backgroundColor: segment < passwordStrength.score ? passwordStrength.color : 'rgba(255,255,255,0.1)',
                            }}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] font-semibold" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                  {passwordError && <p className="mt-1 text-[10px] font-semibold text-rose-400">{passwordError}</p>}
                </div>
              </div>

              {role === 'turf_owner' && registrationError && <p className="text-xs font-semibold text-rose-400">{registrationError}</p>}

              {/* Action Buttons for Step 1 */}
              <div className="pt-2">
                {role === 'turf_owner' ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="w-full py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm rounded-full transition-all shadow-[0_8px_30px_rgba(200,255,94,0.35)] hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Next: Business Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm rounded-full transition-all shadow-[0_8px_30px_rgba(200,255,94,0.35)] hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <span>Setting up workspace...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Create Account & Get Started</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Turf Facility Owner Venue & Payout Setup */}
          {role === 'turf_owner' && step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <Building2 className="w-4 h-4 text-[#C8FF5E]" />
                  <div className="text-xs font-semibold text-white/90">
                  Business Details & Verification
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-white/70 mb-2 block">Billing Model</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button type="button" onClick={() => setBillingModel('commission')} className={`rounded-xl border p-3 text-left transition-colors ${billingModel === 'commission' ? 'border-[#C8FF5E] bg-[#C8FF5E]/10' : 'border-white/15 bg-white/[0.04]'}`}>
                      <span className="block text-xs font-bold text-white">Commission Based</span>
                      <span className="mt-1 block text-[10px] text-white/60">Current booking fee model</span>
                    </button>
                    <button type="button" disabled={monthlySubscriptionAmount <= 0} onClick={() => setBillingModel('monthly_subscription')} className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${billingModel === 'monthly_subscription' ? 'border-[#C8FF5E] bg-[#C8FF5E]/10' : 'border-white/15 bg-white/[0.04]'}`}>
                      <span className="block text-xs font-bold text-white">Monthly Subscription</span>
                      <span className="mt-1 block text-[10px] text-white/60">{monthlySubscriptionAmount > 0 ? `৳${monthlySubscriptionAmount.toLocaleString()} per month; no booking platform fee` : 'Not currently available'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Arena 7 Futsal Dhaka"
                      className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">
                      Trade License Number
                    </label>
                    <div className="relative">
                      <FileText className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={nidOrTradeLicense}
                        onChange={(e) => setNidOrTradeLicense(e.target.value)}
                        placeholder="e.g. 198826749102"
                        className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/70 mb-1 block">Upload Trade License</label>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setTradeLicenseFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#C8FF5E] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0A1E14]"
                  />
                  <p className="mt-1 text-[10px] text-white/50">PDF, JPG, PNG, or WEBP · up to 10 MB. Admin will review this document before approving your account.</p>
                  {tradeLicenseFile && <p className="mt-1 text-[10px] text-[#C8FF5E]">Selected: {tradeLicenseFile.name}</p>}
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/70 mb-1 block">Supporting Business Documents</label>
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setSupportingBusinessFiles(Array.from(e.target.files || []))}
                    className="w-full px-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
                  />
                  <p className="mt-1 text-[10px] text-white/50">Upload any other business verification documents you want the admin to review. The platform does not define an additional document checklist.</p>
                  {supportingBusinessFiles.length > 0 && <p className="mt-1 text-[10px] text-white/70">Selected: {supportingBusinessFiles.map((file) => file.name).join(', ')}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">
                      Payout Method
                    </label>
                    <select
                      value={payoutMethod}
                      onChange={(e) => setPayoutMethod(e.target.value as any)}
                      className="w-full px-3 py-2.5 bg-[#0A1E14] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-[#C8FF5E] cursor-pointer"
                    >
                      <option value="bkash">bKash Personal / Merchant</option>
                      <option value="nagad">Nagad Personal / Merchant</option>
                      <option value="rocket">Rocket Mobile Banking</option>
                      <option value="bank_account">Commercial Bank Account</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/70 mb-1 block">
                      Payout Account / Phone
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="017... or Account Number"
                        className="w-full pl-9 pr-3 py-2.5 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
                      />
                    </div>
                  </div>
                </div>

                {/* Notice Banner */}
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#C8FF5E]/10 border border-[#C8FF5E]/20 text-[11px] text-[#C8FF5E]">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-tight text-white/80">
                    Your contact email and trade license will be reviewed by an admin. Full owner panel access is enabled only after approval.
                  </span>
                </div>
              </div>

              {registrationError && <p className="text-xs font-semibold text-rose-400">{registrationError}</p>}

              {/* Action Buttons for Step 2 */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-3 rounded-full border border-white/20 bg-white/[0.05] hover:bg-white/10 text-white font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm rounded-full transition-all shadow-[0_8px_30px_rgba(200,255,94,0.35)] hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <span>Registering Venue...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Complete Registration</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-black/20 text-center text-xs text-white/60">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => {
              handleClose();
              openSignInModal(role);
            }}
            className="text-[#C8FF5E] font-bold hover:underline cursor-pointer ml-1"
          >
            Sign In here
          </button>
        </div>
      </div>
    </div>
  );
};
