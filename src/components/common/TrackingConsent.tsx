import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import {
  getTrackingConsentChoice,
  hasTrackingConsent,
  initializeGoogleTracking,
  initializeMetaPixel,
  saveTrackingConsent,
} from '../../utils/tracking';

interface PublicTrackingProviderConfig {
  enabled: boolean;
  pixelId?: string;
  measurementId?: string;
  conversionId?: string;
  conversionLabel?: string;
}

interface PublicTrackingConfig {
  metaPixel: PublicTrackingProviderConfig;
  googleAnalytics: PublicTrackingProviderConfig;
  googleAds: PublicTrackingProviderConfig;
}

export const TrackingConsent: React.FC = () => {
  const [config, setConfig] = useState<PublicTrackingConfig | null>(null);
  const [consent, setConsent] = useState<'accepted' | 'rejected' | null>(getTrackingConsentChoice);
  const [consentError, setConsentError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/public/tracking-config')
      .then(async (response) => {
        const result = await response.json();
        const data = result?.data;
        if (!response.ok || result?.success !== true ||
            typeof data?.metaPixel?.enabled !== 'boolean' ||
            typeof data?.googleAnalytics?.enabled !== 'boolean' ||
            typeof data?.googleAds?.enabled !== 'boolean') return;
        if (!cancelled) setConfig({
          metaPixel: {
            enabled: data.metaPixel.enabled,
            pixelId: typeof data.metaPixel.pixelId === 'string' ? data.metaPixel.pixelId : undefined,
          },
          googleAnalytics: {
            enabled: data.googleAnalytics.enabled,
            measurementId: typeof data.googleAnalytics.measurementId === 'string' ? data.googleAnalytics.measurementId : undefined,
          },
          googleAds: {
            enabled: data.googleAds.enabled,
            conversionId: typeof data.googleAds.conversionId === 'string' ? data.googleAds.conversionId : undefined,
            conversionLabel: typeof data.googleAds.conversionLabel === 'string' ? data.googleAds.conversionLabel : undefined,
          },
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!config || consent !== 'accepted' || !hasTrackingConsent()) return;
    if (config.metaPixel.enabled && config.metaPixel.pixelId) initializeMetaPixel(config.metaPixel.pixelId);
    initializeGoogleTracking({
      analyticsId: config.googleAnalytics.enabled ? config.googleAnalytics.measurementId : undefined,
      adsConversionId: config.googleAds.enabled ? config.googleAds.conversionId : undefined,
      adsConversionLabel: config.googleAds.enabled ? config.googleAds.conversionLabel : undefined,
    });
  }, [config, consent]);

  if (!config || !Object.values(config).some((provider) => provider.enabled)) return null;

  const updateConsent = (accepted: boolean) => {
    if (!saveTrackingConsent(accepted)) {
      setConsentError('Your browser did not save this choice. Tracking will remain off until consent can be saved.');
      return;
    }
    setConsentError('');
    setConsent(accepted ? 'accepted' : 'rejected');
  };

  if (consent) return null;
  const providers = [
    config.metaPixel.enabled ? 'Meta' : '',
    config.googleAnalytics.enabled ? 'Google Analytics' : '',
    config.googleAds.enabled ? 'Google Ads' : '',
  ].filter(Boolean).join(' and ');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracking-consent-title"
        className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0A1E14] p-4 text-white shadow-2xl"
      >
        <p id="tracking-consent-title" className="text-sm font-bold">Help us improve TurfySlot</p>
        <p className="mt-1 text-xs leading-relaxed text-white/70">
          With your permission, {providers} may receive page, turf-view, search, and booking-funnel events. We do not send your identity, booking details, or payment amounts.
        </p>
        {consentError && <p role="alert" className="mt-2 text-xs text-rose-300">{consentError}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => updateConsent(false)} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white/80">
            Reject
          </button>
          <button type="button" onClick={() => updateConsent(true)} className="rounded-lg bg-[#C8FF5E] px-4 py-2 text-xs font-bold text-[#0A1E14]">
            Accept
          </button>
        </div>
      </aside>
    </div>
  );
};
