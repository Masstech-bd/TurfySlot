import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Mail, ShieldCheck, X } from 'lucide-react';

export const EmailVerificationModal: React.FC = () => {
  const { currentUser, isAuthenticated, verifyActivationCode, resendActivationCode, updateUnverifiedEmail } = useApp();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [emailDraft, setEmailDraft] = useState(currentUser.email);
  const [savingEmail, setSavingEmail] = useState(false);

  // Reset the dismiss state whenever the logged-in account changes.
  useEffect(() => {
    setDismissed(false);
    setCode('');
    setMessage('');
    setIsError(false);
    setEmailDraft(currentUser.email);
    setShowEmailEditor(false);
  }, [currentUser.id]);

  useEffect(() => { setEmailDraft(currentUser.email); }, [currentUser.email]);

  const shouldShow =
    isAuthenticated &&
    currentUser.emailVerified === false &&
    (currentUser.role === 'player' || currentUser.role === 'turf_owner' || currentUser.role === 'staff') &&
    !dismissed;

  if (!shouldShow) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await verifyActivationCode(code);
    setMessage(result.message);
    setIsError(!result.success);
    if (result.success) {
      setCode('');
    }
  };

  const handleResend = async () => {
    const result = await resendActivationCode();
    setMessage(result.message);
    setIsError(!result.success);
  };

  const handleEmailCorrection = async () => {
    setSavingEmail(true);
    const result = await updateUnverifiedEmail(emailDraft);
    setMessage(result.message);
    setIsError(!result.success);
    if (result.emailUpdated) {
      setShowEmailEditor(false);
      setCode('');
    }
    setSavingEmail(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0A1E14] border border-white/15 rounded-[28px] max-w-sm w-full shadow-[0_25px_70px_rgba(0,0,0,0.6)] overflow-hidden text-white relative">
        <div className="p-6 pb-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#C8FF5E] text-[#0A1E14] flex items-center justify-center font-bold shadow-md shadow-[#C8FF5E]/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white tracking-tight">Verify Your Email</h3>
              <p className="text-[11px] text-white/60">Verification address: {currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Verify later"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleVerify} className="p-6 space-y-4">
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#C8FF5E]/10 border border-[#C8FF5E]/20 text-[11px] text-white/80">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#C8FF5E]" />
            <span>Enter the 6-digit code sent to this address to verify the account.</span>
          </div>

          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            placeholder="Enter 6-digit code"
            className="w-full px-3 py-3 text-center tracking-[0.4em] font-bold bg-white/[0.05] border border-white/15 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#C8FF5E]"
          />

          {message && (
            <div className={`text-[11px] font-semibold ${isError ? 'text-rose-400' : 'text-[#C8FF5E]'}`}>{message}</div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm transition-all shadow-md cursor-pointer"
          >
            Verify & Activate
          </button>

          {!showEmailEditor ? (
            <div className="flex items-center justify-between text-xs pt-1">
              <button type="button" onClick={handleResend} className="text-[#C8FF5E] font-semibold hover:underline cursor-pointer">
                Resend code
              </button>
              {currentUser.role === 'player' && <button type="button" onClick={() => { setEmailDraft(currentUser.email); setShowEmailEditor(true); setMessage(''); }} className="text-[#C8FF5E] font-semibold hover:underline cursor-pointer">
                Wrong email? Change it
              </button>}
              <button type="button" onClick={() => setDismissed(true)} className="text-white/60 hover:text-white cursor-pointer">
                Verify later
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <label htmlFor="correct-verification-email" className="block text-[11px] text-white/70">Enter the correct email address for this account:</label>
              <input id="correct-verification-email" type="email" autoComplete="email" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleEmailCorrection(); } }} maxLength={255} className="w-full px-3 py-2 bg-white/[0.05] border border-white/15 rounded-lg text-sm text-white focus:outline-none focus:border-[#C8FF5E]" />
              <div className="flex justify-end gap-3 text-xs">
                <button type="button" disabled={savingEmail} onClick={() => setShowEmailEditor(false)} className="text-white/60 hover:text-white disabled:opacity-50">Cancel</button>
                <button type="button" disabled={savingEmail || !emailDraft.trim()} onClick={() => void handleEmailCorrection()} className="text-[#C8FF5E] font-semibold hover:underline disabled:opacity-50">{savingEmail ? 'Updating?' : 'Update & send new code'}</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
