const consentStorageKey = 'turfy_tracking_consent_v2';
const pixelScriptId = 'meta-pixel-script';
const googleTagScriptId = 'google-tag-script';
type TrackingEvent = 'PageView' | 'ViewContent' | 'Search' | 'InitiateCheckout' | 'Purchase';
type MetaPixelFunction = ((...args: string[]) => void) & { queue?: string[][]; callMethod?: (...args: string[]) => void; pixelId?: string };
type GoogleTagFunction = (...args: unknown[]) => void;

export interface GoogleTrackingConfig {
  analyticsId?: string;
  adsConversionId?: string;
  adsConversionLabel?: string;
}

let activeGoogleTrackingConfig: GoogleTrackingConfig | null = null;
let initializedGoogleConfigKey: string | null = null;

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    dataLayer?: unknown[][];
    gtag?: GoogleTagFunction;
  }
}

export const hasTrackingConsent = () => {
  return getTrackingConsentChoice() === 'accepted';
};

export const getTrackingConsentChoice = (): 'accepted' | 'rejected' | null => {
  if (typeof window === 'undefined') return null;
  try {
    const choice = window.localStorage.getItem(consentStorageKey);
    return choice === 'accepted' || choice === 'rejected' ? choice : null;
  } catch {
    return null;
  }
};

export const saveTrackingConsent = (accepted: boolean) => {
  try {
    window.localStorage.setItem(consentStorageKey, accepted ? 'accepted' : 'rejected');
  } catch {
    return false;
  }
  if (!accepted && window.fbq) window.fbq('consent', 'revoke');
  return true;
};

export const initializeMetaPixel = (pixelId: string) => {
  if (typeof window === 'undefined' || !hasTrackingConsent() || !/^\d{5,20}$/.test(pixelId)) return;
  if (window.fbq?.pixelId === pixelId) {
    window.fbq('consent', 'grant');
    window.fbq('track', 'PageView');
    return;
  }

  const fbq = ((...args: string[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else (fbq.queue ||= []).push(args);
  }) as MetaPixelFunction;
  fbq.queue = [];
  fbq.pixelId = pixelId;
  window.fbq = fbq;
  window._fbq = fbq;
  fbq('init', pixelId);
  fbq('consent', 'grant');

  if (!document.getElementById(pixelScriptId)) {
    const script = document.createElement('script');
    script.id = pixelScriptId;
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  fbq('track', 'PageView');
};

export const initializeGoogleTracking = (config: GoogleTrackingConfig) => {
  if (typeof window === 'undefined' || !hasTrackingConsent()) return;
  const analyticsId = config.analyticsId && /^G-[A-Z0-9]{6,20}$/i.test(config.analyticsId) ? config.analyticsId : '';
  const adsConversionId = config.adsConversionId && /^AW-\d{6,20}$/i.test(config.adsConversionId) ? config.adsConversionId : '';
  const adsConversionLabel = config.adsConversionLabel && /^[A-Z0-9_-]{1,100}$/i.test(config.adsConversionLabel) ? config.adsConversionLabel : '';
  const validAdsConversionId = adsConversionId && adsConversionLabel ? adsConversionId : '';
  const scriptId = analyticsId || validAdsConversionId;
  if (!scriptId) return;

  const configKey = `${analyticsId}|${validAdsConversionId}|${validAdsConversionId ? adsConversionLabel : ''}`;
  if (initializedGoogleConfigKey === configKey) return;
  activeGoogleTrackingConfig = {
    analyticsId: analyticsId || undefined,
    adsConversionId: validAdsConversionId || undefined,
    adsConversionLabel: validAdsConversionId ? adsConversionLabel : undefined,
  };
  initializedGoogleConfigKey = configKey;

  window.dataLayer ||= [];
  window.gtag ||= ((...args: unknown[]) => {
    window.dataLayer?.push(args);
  });
  window.gtag('consent', 'update', {
    analytics_storage: analyticsId ? 'granted' : 'denied',
    ad_storage: validAdsConversionId ? 'granted' : 'denied',
    ad_user_data: validAdsConversionId ? 'granted' : 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  if (analyticsId) {
    window.gtag('config', analyticsId, { send_page_view: false });
    window.gtag('event', 'page_view');
  }
  if (validAdsConversionId) window.gtag('config', validAdsConversionId, { send_page_view: false });

  if (!document.getElementById(googleTagScriptId)) {
    const script = document.createElement('script');
    script.id = googleTagScriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(scriptId)}`;
    document.head.appendChild(script);
  }
};

const googleEventName: Record<TrackingEvent, string> = {
  PageView: 'page_view',
  ViewContent: 'view_item',
  Search: 'search',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
};

export const trackAnalyticsEvent = (event: TrackingEvent) => {
  if (!hasTrackingConsent()) return;
  if (window.fbq) window.fbq('track', event);
  if (window.gtag && activeGoogleTrackingConfig?.analyticsId) {
    window.gtag('event', googleEventName[event]);
  }
  if (event === 'Purchase' && window.gtag && activeGoogleTrackingConfig?.adsConversionId && activeGoogleTrackingConfig.adsConversionLabel) {
    window.gtag('event', 'conversion', {
      send_to: `${activeGoogleTrackingConfig.adsConversionId}/${activeGoogleTrackingConfig.adsConversionLabel}`,
    });
  }
};
