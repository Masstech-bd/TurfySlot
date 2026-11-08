import React, { useEffect, useState } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';
import { DEFAULT_SUPPORT_SETTINGS, SupportSettings } from '../../types';

export const HelpCenterPage: React.FC = () => {
  const [support, setSupport] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/public/support-settings')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.message || 'Unable to load Help Center information.');
        }
        if (!cancelled) setSupport(result.data as SupportSettings);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load Help Center information.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '')}`;

  return (
    <div className="min-h-screen bg-[#07130c] px-4 py-10 text-slate-100 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0A1E14] shadow-2xl">
        <header className="border-b border-white/10 p-6 sm:p-9">
          <a href="/" className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white/75 transition-colors hover:border-[#C8FF5E]/50 hover:text-[#C8FF5E]">
            <ArrowLeft className="h-4 w-4" /> Back to TurfySlot
          </a>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#C8FF5E]/10 text-[#C8FF5E]"><HelpCircle className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C8FF5E]">TurfySlot support</p>
              <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Help Center &amp; FAQs</h1>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6 sm:p-9">
          {loading && <p role="status" className="text-sm text-slate-300">Loading FAQs…</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
          {!loading && support.faqs.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-[#07130c] p-5 text-sm text-slate-300">There are no FAQs available yet. Contact support if you need help.</p>
          )}
          {support.faqs.map((faq) => (
            <section key={faq.id} className="rounded-xl border border-white/10 bg-[#07130c] p-5">
              <h2 className="text-base font-bold text-white">{faq.question}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{faq.answer}</p>
            </section>
          ))}
          <section aria-labelledby="help-contact-heading" className="space-y-3 border-t border-white/10 pt-5">
            <h2 id="help-contact-heading" className="text-base font-bold text-white">Contact support</h2>
            <a className="block text-sm text-[#C8FF5E] hover:underline" href={`mailto:${support.email}`}>{support.email}</a>
            {[support.phoneOne, support.phoneTwo].map((phone) => (
              <a key={phone} className="block text-sm text-[#C8FF5E] hover:underline" href={telHref(phone)}>{phone}</a>
            ))}
            <p className="text-sm leading-6 text-slate-300">{support.address}</p>
          </section>
        </div>
      </article>
    </div>
  );
};
