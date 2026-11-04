import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';

export type LegalPageSlug = 'privacy-policy' | 'terms-of-service' | 'refund-policy';

interface RefundTier {
  minHoursSinceBooking: number;
  maxHoursSinceBooking: number | null;
  refundPercentage: number;
}

interface LegalPageData {
  title: string;
  content: string | null;
  published: boolean;
  refundTiers?: RefundTier[];
}

const pageSlugs: LegalPageSlug[] = ['privacy-policy', 'terms-of-service', 'refund-policy'];

const renderContent = (content: string) => content.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
  const heading = block.match(/^#{1,3}\s+(.+)$/);
  if (heading) return <h2 key={index} className="pt-3 text-lg font-bold text-white">{heading[1]}</h2>;
  if (block.startsWith('STARTER DRAFT')) {
    return <p key={index} className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm font-bold text-amber-100">{block}</p>;
  }
  return <p key={index} className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{block}</p>;
});

export const LegalPage: React.FC<{ slug: LegalPageSlug }> = ({ slug }) => {
  const [page, setPage] = useState<LegalPageData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      try {
        const response = await fetch(`/api/public/legal-pages/${slug}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          throw new Error('This page is temporarily unavailable. Please try again later.');
        }
        const result = await response.json();
        if (!response.ok || !result?.success || !result?.data) {
          throw new Error(result?.message || 'Unable to load this page.');
        }
        if (!cancelled) setPage(result.data as LegalPageData);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load this page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadPage();
    return () => { cancelled = true; };
  }, [slug]);

  const backHref = `${window.location.origin}/`;

  return (
    <div className="min-h-screen bg-[#07130c] px-4 py-10 text-slate-100 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0A1E14] shadow-2xl">
        <header className="border-b border-white/10 p-6 sm:p-9">
          <a href={backHref} className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white/75 transition-colors hover:border-[#C8FF5E]/50 hover:text-[#C8FF5E]">
            <ArrowLeft className="h-4 w-4" /> Back to TurfySlot
          </a>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#C8FF5E]/10 text-[#C8FF5E]"><FileText className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C8FF5E]">TurfySlot information</p>
              <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{page?.title || 'Loading…'}</h1>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-6 sm:p-9">
          {loading && <p role="status" className="text-sm text-slate-300">Loading page…</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
          {!loading && !error && page && !page.published && (
            <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              This page is being prepared. For help, contact <a className="font-bold underline" href="mailto:masstech.ctg@gmail.com">masstech.ctg@gmail.com</a>.
            </p>
          )}
          {!loading && !error && page?.published && page.content && renderContent(page.content)}
          {!loading && !error && slug === 'refund-policy' && page?.published && (
            <section aria-labelledby="refund-matrix-heading" className="pt-3">
              <h2 id="refund-matrix-heading" className="mb-3 text-lg font-bold text-white">Current global default refund matrix</h2>
              <p className="mb-4 text-xs leading-5 text-slate-400">Tiers are measured from booking creation. Turf- or owner-specific policy assignments may change the percentage for an individual booking; the policy recorded for that booking is authoritative.</p>
              {page.refundTiers?.length ? (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[380px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-xs uppercase tracking-wide text-slate-400">
                      <tr><th className="px-4 py-3">Time since booking</th><th className="px-4 py-3">Refund percentage</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {page.refundTiers.map((tier) => (
                        <tr key={`${tier.minHoursSinceBooking}-${tier.maxHoursSinceBooking ?? 'open'}`}>
                          <td className="px-4 py-3 text-slate-200">{tier.maxHoursSinceBooking === null ? `${tier.minHoursSinceBooking}+ hours` : `${tier.minHoursSinceBooking}–<${tier.maxHoursSinceBooking} hours`}</td>
                          <td className="px-4 py-3 font-bold text-[#C8FF5E]">{tier.refundPercentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-400">The default cancellation policy is not available right now.</p>}
            </section>
          )}
          <nav aria-label="Legal pages" className="flex flex-wrap gap-2 border-t border-white/10 pt-5">
            {pageSlugs.filter((item) => item !== slug).map((item) => (
              <a key={item} href={`/${item}`} className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-[#C8FF5E]/40 hover:text-[#C8FF5E]">
                {item === 'privacy-policy' ? 'Privacy Policy' : item === 'terms-of-service' ? 'Terms of Service' : 'Refund Policy'}
              </a>
            ))}
          </nav>
        </div>
      </article>
    </div>
  );
};
