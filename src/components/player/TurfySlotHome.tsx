import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DEFAULT_SUPPORT_SETTINGS, SupportSettings, Turf, Slot } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  Search,
  MapPin,
  Star,
  Clock,
  CreditCard,
  Ticket,
  Calendar,
  Heart,
  Users,
  ArrowRight,
  Trophy,
  Smartphone,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Building2,
  TrendingUp,
  CircleCheck,
  ShieldCheck,
  Zap,
  PlayCircle,
  Play,
  Headset,
  Lock,
  Flame,
  Crown,
  Crosshair,
  UserPlus,
  Plus,
  Info,
  Navigation,
  Briefcase,
  PlusCircle,
  Coins,
  Ban,
} from 'lucide-react';
import completeTeamActionImg from '../../assets/images/complete_team_action_1788975639446.jpg';
import { ClickableDatePicker, CustomSelect } from '../common/CustomSelect';
import { TurfMap } from '../common/LazyTurfMap';
import { formatBDTimeRange, getBDDateString, getBDNow } from '../../utils/datetime';
import { apiFetch } from '../../utils/apiClient';
import { calculateDisplayedTurfPrice } from '../../../database/pricing.js';

interface SquadMatch {
  id: string;
  turfName: string;
  area: string;
  sport: string;
  date: string;
  time: string;
  hostName: string;
  playersNeeded: number;
  skillLevel: string;
}

interface TurfySlotHomeProps {
  filteredTurfs: Turf[];
  slotsByTurf: Record<string, Slot[]>;
  selectedTurf: Turf | null;
  setSelectedTurf: (turf: Turf | null) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedSport: string;
  setSelectedSport: (sport: string) => void;
  selectedArea: string;
  setSelectedArea: (area: string) => void;
  favorites: string[];
  toggleFavorite: (turfId: string) => void;
  handleSelectSlot: (turf: Turf, slot: Slot) => void;
  selectedBookingSlots: Slot[];
  onContinueBooking: () => void;
  switchRoleDirectly: (role: 'player' | 'turf_owner' | 'staff' | 'admin') => void;
  squadMatches: SquadMatch[];
  joinedSquadIds: string[];
  handleJoinSquad: (id: string) => Promise<void>;
  squadJoinMessage: string;
  setShowSquadModal: (show: boolean) => void;
  setActiveTab: (tab: 'explore' | 'my_bookings' | 'favorites' | 'squads' | 'tournaments') => void;
}

const turfStartingPrice = (turf: Turf) => Math.min(turf.basePricePerHour, ...(turf.pricingRules || []).map((rule) => rule.pricePerHour));

export const TurfySlotHome: React.FC<TurfySlotHomeProps> = ({
  filteredTurfs,
  slotsByTurf,
  selectedTurf,
  setSelectedTurf,
  selectedDate,
  setSelectedDate,
  selectedSport,
  setSelectedSport,
  selectedArea,
  setSelectedArea,
  favorites,
  toggleFavorite,
  handleSelectSlot,
  selectedBookingSlots,
  onContinueBooking,
  switchRoleDirectly,
  squadMatches,
  joinedSquadIds,
  handleJoinSquad,
  squadJoinMessage,
  setShowSquadModal,
  setActiveTab,
}) => {
  const { isAuthenticated, openSignInModal, turfs, currentUser, settings, openMatches, tournaments } = useApp();
  const startingPriceForCard = (turf: Turf) => calculateDisplayedTurfPrice({
    baseAmount: turfStartingPrice(turf),
    platformRate: turf.ownerBillingModel === 'monthly_subscription' || settings.platformFeeEnabled === false ? 0 : settings.platformFeeRate,
    gatewayRate: settings.gatewayFeeEnabled === false ? 0 : settings.gatewayFeeRate,
    showFeeBreakdown: settings.showFeeBreakdown !== false,
  });
  const displayedSlotPrice = (slot: Slot) => {
    const turf = turfs.find((item) => item.id === slot.turfId);
    return calculateDisplayedTurfPrice({
      baseAmount: slot.price,
      platformRate: turf?.ownerBillingModel === 'monthly_subscription' || settings.platformFeeEnabled === false
        ? 0 : settings.platformFeeRate,
      gatewayRate: settings.gatewayFeeEnabled === false ? 0 : settings.gatewayFeeRate,
      showFeeBreakdown: settings.showFeeBreakdown !== false,
    });
  };
  const [currentBDTime, setCurrentBDTime] = useState(getBDNow);
  const [supportSettings, setSupportSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [supportSettingsError, setSupportSettingsError] = useState('');
  const [featuredHomeTurfs, setFeaturedHomeTurfs] = useState<Turf[]>([]);
  const [trendingHomeTurfs, setTrendingHomeTurfs] = useState<Turf[]>([]);
  const [nearbyHomeTurfs, setNearbyHomeTurfs] = useState<Array<Turf & { distanceKm?: number }>>([]);
  const [discoveryTurfs, setDiscoveryTurfs] = useState<Turf[]>([]);
  const [discoveryPage, setDiscoveryPage] = useState(1);
  const [hasMoreDiscoveryTurfs, setHasMoreDiscoveryTurfs] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const urlStateInitialized = useRef(false);
  const restoringUrlState = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/public/support-settings')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.message || 'Unable to load public support contacts.');
        }
        if (!cancelled) setSupportSettings(result.data as SupportSettings);
      })
      .catch(() => {
        if (!cancelled) setSupportSettingsError('Support contact information could not be refreshed.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentBDTime(getBDNow()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const FALLBACK_TURF_IMAGE = 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85';

  // Near You: request browser geolocation permission and compute real distances
  const readCachedCoordinates = () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem('turfyslot:nearby-coordinates') || 'null');
      return Number.isFinite(cached?.lat) && cached.lat >= -90 && cached.lat <= 90 &&
        Number.isFinite(cached?.lng) && cached.lng >= -180 && cached.lng <= 180
        ? { lat: cached.lat as number, lng: cached.lng as number }
        : null;
    } catch {
      return null;
    }
  };
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(readCachedCoordinates);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>(() => readCachedCoordinates() ? 'granted' : 'idle');

  const requestLocation = () => {
    const cached = readCachedCoordinates();
    if (cached) {
      setUserCoords(cached);
      setLocationStatus('granted');
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocationStatus('unsupported');
      return;
    }
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coordinates);
        try { sessionStorage.setItem('turfyslot:nearby-coordinates', JSON.stringify(coordinates)); } catch { /* Location remains available for this page session. */ }
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  useEffect(() => {
    if (settings.featureFlags?.near_you_enabled) requestLocation();
    else {
      setUserCoords(null);
      setNearbyHomeTurfs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.featureFlags?.near_you_enabled]);

  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const visibleSelectedBookingSlots =
    selectedBookingSlots.length > 0
      ? selectedBookingSlots
      : selectedTurf
      ? (slotsByTurf[selectedTurf.id] || []).filter((slot) => slot.status === 'locked' && slot.lockedByUserId === currentUser.id)
      : [];

  const homeTurfs = useMemo(
    () =>
      [...turfs]
        .filter((turf) => turf.status === 'active')
        .sort(
          (a, b) =>
            (b.rating || 0) - (a.rating || 0) ||
            (b.reviewCount || 0) - (a.reviewCount || 0) ||
            turfStartingPrice(b) - turfStartingPrice(a)
        ),
    [turfs]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async <T extends Turf,>(url: string, setter: (rows: T[]) => void, section: string) => {
      try {
        const response = await apiFetch(url);
        const result = await response.json();
        if (!response.ok || result?.success !== true || !Array.isArray(result.data)) throw new Error(result?.message || `Unable to load ${section}.`);
        if (!cancelled) setter(result.data as T[]);
      } catch (error) {
        if (!cancelled) console.error(`Unable to load ${section}:`, error);
      }
    };
    if (settings.featureFlags?.featured_turf_enabled) void load('/api/home/featured-turfs', setFeaturedHomeTurfs, 'featured turfs');
    else setFeaturedHomeTurfs([]);
    if (settings.featureFlags?.trending_enabled) void load('/api/home/trending-turfs', setTrendingHomeTurfs, 'trending turfs');
    else setTrendingHomeTurfs([]);
    if (settings.featureFlags?.near_you_enabled && userCoords) {
      void load(`/api/home/nearby-turfs?lat=${encodeURIComponent(userCoords.lat)}&lng=${encodeURIComponent(userCoords.lng)}`, setNearbyHomeTurfs, 'nearby turfs');
    } else setNearbyHomeTurfs([]);
    return () => { cancelled = true; };
  }, [settings.featureFlags?.featured_turf_enabled, settings.featureFlags?.trending_enabled, settings.featureFlags?.near_you_enabled, userCoords]);

  const featuredTurfsList = useMemo(() => featuredHomeTurfs.map((turf) => ({
    id: `featured-${turf.id}`, name: turf.name, location: `${turf.area}, ${turf.city}`,
    rating: turf.rating, sports: (turf.sportTypes || []).slice(0, 2),
    price: turfStartingPrice(turf), image: turf.photos?.[0] || FALLBACK_TURF_IMAGE,
    badge: 'Featured', targetTurfId: turf.id,
  })), [featuredHomeTurfs]);

  const trendingTurfsList = useMemo(() => trendingHomeTurfs.slice(0, 6).map((turf, index) => ({
    id: `trending-${turf.id}`, name: turf.name, location: `${turf.area}, ${turf.city}`,
    rating: turf.rating, sports: (turf.sportTypes || []).slice(0, 2),
    price: turfStartingPrice(turf), image: turf.photos?.[0] || FALLBACK_TURF_IMAGE,
    badge: index === 0 ? 'Trending' : 'Popular', targetTurfId: turf.id,
  })), [trendingHomeTurfs]);

  const nearbyTurfsList = useMemo(() => nearbyHomeTurfs.slice(0, 6).map((turf) => ({
    id: `nearby-${turf.id}`, name: turf.name, location: `${turf.area}, ${turf.city}`,
    distance: Number.isFinite(turf.distanceKm) ? `${turf.distanceKm.toFixed(1)} km` : '',
    rating: turf.rating, sports: (turf.sportTypes || []).slice(0, 2),
    price: turfStartingPrice(turf), image: turf.photos?.[0] || FALLBACK_TURF_IMAGE,
    badge: 'Nearby', targetTurfId: turf.id,
  })), [nearbyHomeTurfs]);

  // Tournament and All Turfs filter & sorting states
  const [tournamentFilter, setTournamentFilter] = useState<'all' | 'football' | 'futsal' | 'cricket' | 'basketball'>('all');
  const tournamentSliderRef = useRef<HTMLDivElement>(null);
  const [allTurfsSportFilter, setAllTurfsSportFilter] = useState<string>('All Sports');
  const [allTurfsSort, setAllTurfsSort] = useState<string>('relevance');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const [minimumRating, setMinimumRating] = useState('');
  const [showPriceRatingFilters, setShowPriceRatingFilters] = useState(false);
  const [locationMapTurfId, setLocationMapTurfId] = useState<string | null>(null);
  const maxPriceLimit = 30000;
  useEffect(() => {
    if (!userCoords && allTurfsSort === 'distance') setAllTurfsSort('relevance');
  }, [allTurfsSort, userCoords]);

  const activeSearch = selectedArea !== 'All' || selectedSport !== 'All' ||
    (allTurfsSportFilter !== 'All Sports') || minimumPrice !== '' || maximumPrice !== '' || minimumRating !== '';

  const discoveryFiltersKey = [selectedArea, selectedSport, allTurfsSportFilter, allTurfsSort, minimumPrice, maximumPrice, minimumRating, userCoords?.lat, userCoords?.lng].join('|');
  useEffect(() => {
    let cancelled = false;
    const loadFirstPage = async () => {
      setDiscoveryLoading(true);
      setDiscoveryError('');
      setDiscoveryPage(1);
      const params = new URLSearchParams({ page: '1', limit: '12', sort: allTurfsSort });
      if (allTurfsSort === 'distance' && userCoords) {
        params.set('lat', String(userCoords.lat));
        params.set('lng', String(userCoords.lng));
      }
      if (selectedArea !== 'All') params.set('area', selectedArea);
      const sport = allTurfsSportFilter !== 'All Sports' && !['4+ Rating', 'Open Now'].includes(allTurfsSportFilter)
        ? allTurfsSportFilter
        : selectedSport !== 'All' ? selectedSport : '';
      if (sport) params.set('sport', sport);
      if (allTurfsSportFilter === 'Open Now') params.set('open_now', 'true');
      const min = minimumPrice ? Number(minimumPrice) : undefined;
      const max = maximumPrice ? Number(maximumPrice) : undefined;
      const rating = minimumRating ? Number(minimumRating) : allTurfsSportFilter === '4+ Rating' ? 4 : undefined;
      if (min !== undefined) params.set('price_min', String(min));
      if (max !== undefined) params.set('price_max', String(max));
      if (rating !== undefined) params.set('rating_min', String(rating));
      try {
        const response = await apiFetch(`/api/home/all-turfs?${params.toString()}`);
        const result = await response.json();
        if (!response.ok || result?.success !== true || !Array.isArray(result.data?.items)) throw new Error(result?.message || 'Unable to load turfs.');
        if (cancelled) return;
        setDiscoveryTurfs(result.data.items as Turf[]);
        setHasMoreDiscoveryTurfs(Boolean(result.data.pagination?.next));
      } catch (error) {
        if (!cancelled) {
          setDiscoveryTurfs([]);
          setHasMoreDiscoveryTurfs(false);
          setDiscoveryError(error instanceof Error ? error.message : 'Unable to load turfs.');
          console.error('Unable to load public turf discovery:', error);
        }
      } finally {
        if (!cancelled) setDiscoveryLoading(false);
      }
    };
    void loadFirstPage();
    return () => { cancelled = true; };
  }, [discoveryFiltersKey]);

  const loadMoreTurfs = async () => {
    if (discoveryLoading || !hasMoreDiscoveryTurfs) return;
    const nextPage = discoveryPage + 1;
    const params = new URLSearchParams({ page: String(nextPage), limit: '12', sort: allTurfsSort });
    if (allTurfsSort === 'distance' && userCoords) {
      params.set('lat', String(userCoords.lat));
      params.set('lng', String(userCoords.lng));
    }
    if (selectedArea !== 'All') params.set('area', selectedArea);
    const sport = allTurfsSportFilter !== 'All Sports' && !['4+ Rating', 'Open Now'].includes(allTurfsSportFilter)
      ? allTurfsSportFilter
      : selectedSport !== 'All' ? selectedSport : '';
    if (sport) params.set('sport', sport);
    if (allTurfsSportFilter === 'Open Now') params.set('open_now', 'true');
    if (minimumPrice) params.set('price_min', minimumPrice);
    if (maximumPrice) params.set('price_max', maximumPrice);
    if (minimumRating || allTurfsSportFilter === '4+ Rating') params.set('rating_min', minimumRating || '4');
    setDiscoveryLoading(true);
    try {
      const response = await apiFetch(`/api/home/all-turfs?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || result?.success !== true || !Array.isArray(result.data?.items)) throw new Error(result?.message || 'Unable to load more turfs.');
      setDiscoveryTurfs((previous) => [...previous, ...(result.data.items as Turf[])]);
      setDiscoveryPage(nextPage);
      setHasMoreDiscoveryTurfs(Boolean(result.data.pagination?.next));
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Unable to load more turfs.');
      console.error('Unable to load more public turfs:', error);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ['area', 'sport', 'sort', 'price_min', 'price_max', 'rating_min']) params.delete(key);
    if (selectedArea !== 'All') params.set('area', selectedArea);
    const sport = allTurfsSportFilter !== 'All Sports' && !['4+ Rating', 'Open Now'].includes(allTurfsSportFilter)
      ? allTurfsSportFilter
      : selectedSport !== 'All' ? selectedSport : '';
    if (sport) params.set('sport', sport);
    if (allTurfsSort !== 'relevance') params.set('sort', allTurfsSort);
    if (minimumPrice) params.set('price_min', minimumPrice);
    if (maximumPrice) params.set('price_max', maximumPrice);
    if (minimumRating) params.set('rating_min', minimumRating);
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    if (restoringUrlState.current || !urlStateInitialized.current) {
      window.history.replaceState(null, '', next);
      restoringUrlState.current = false;
      urlStateInitialized.current = true;
    } else {
      window.history.pushState(null, '', next);
    }
  }, [selectedArea, selectedSport, allTurfsSportFilter, allTurfsSort, minimumPrice, maximumPrice, minimumRating]);

  useEffect(() => {
    const restoreFiltersFromUrl = () => {
      restoringUrlState.current = true;
      const params = new URLSearchParams(window.location.search);
      setSelectedArea(params.get('area') || 'All');
      setSelectedSport(params.get('sport') || 'All');
      setAllTurfsSort(params.get('sort') || 'relevance');
      setMinimumPrice(params.get('price_min') || '');
      setMaximumPrice(params.get('price_max') || '');
      setMinimumRating(params.get('rating_min') || '');
    };
    window.addEventListener('popstate', restoreFiltersFromUrl);
    return () => window.removeEventListener('popstate', restoreFiltersFromUrl);
  }, [setSelectedArea, setSelectedSport]);

  // Looking for Teammates Community Matches (Section 49)
  const communityMatchesList = settings.featureFlags?.squad_enabled
    ? openMatches.filter((match) => match.status === 'open').slice(0, 6).map((match) => ({
      id: match.id,
      sport: match.sportType,
      skill: match.skillLevel,
      venue: match.turfName,
      date: match.date,
      time: formatBDTimeRange(match.startTime, match.endTime),
      area: match.area,
      playersNeeded: Math.max(0, match.maxPlayers - match.joinedCount),
      captain: match.captainName,
    }))
    : [];
  const homeTournaments = settings.featureFlags?.tournament_enabled
    ? tournaments.filter((tournament) => ['open', 'registration_closed', 'ongoing', 'completed'].includes(tournament.status)).slice(0, 12).map((tournament) => ({
      id: tournament.id,
      title: tournament.name,
      category: tournament.sportType.toLowerCase().includes('futsal') ? 'futsal' : tournament.sportType.toLowerCase(),
      status: tournament.status === 'ongoing' ? 'live' as const : tournament.status === 'open' ? 'registration' as const : tournament.status === 'completed' ? 'completed' as const : 'upcoming' as const,
      sport: tournament.sportType,
      dates: `${tournament.startDate} - ${tournament.endDate}`,
      location: tournament.turfName,
      teams: `${tournament.maxTeams} teams`,
      matches: `${tournament.maxTeams - 1}+ matches`,
      daysLeft: tournament.status === 'open' ? 'Registration open' : tournament.status,
      prize: tournament.prizePoolNote || (tournament.entryFeeAmount ? `Entry ৳${tournament.entryFeeAmount}` : 'Community event'),
      actionLabel: tournament.status === 'open' ? 'Register Now' : 'View Tournament',
      image: FALLBACK_TURF_IMAGE,
    }))
    : [];

  // Helper to open live slot drawer for a venue
  const handleViewSlotsForVenue = (targetTurfId?: string, fallbackName?: string) => {
    const found = turfs.find((t) => t.id === targetTurfId || t.name === fallbackName) || filteredTurfs[0] || turfs[0];
    if (found) {
      setSelectedTurf(found);
      setTimeout(() => {
        const el = document.getElementById('live-slot-picker') || document.getElementById('all-turfs');
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // Scroll tournament slider
  const scrollTournaments = (dir: 'left' | 'right') => {
    if (tournamentSliderRef.current) {
      tournamentSliderRef.current.scrollBy({
        left: dir === 'left' ? -380 : 380,
        behavior: 'smooth',
      });
    }
  };

  // Filter and sort for All Turfs section
  const filteredAndSortedTurfs = discoveryTurfs;

  // Hero Slider Images from User's Design Template
  const heroSlides = [
    'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=2000&q=85',
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=2000&q=85',
  ];
  const [currentSlide, setCurrentSlide] = useState(0);

  // Turf Owner Calculator State
  const [calcRate, setCalcRate] = useState<number>(1500);
  const [calcHours, setCalcHours] = useState<number>(4);
  const [calcDays, setCalcDays] = useState<number>(7);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  return (
    <div className="bg-[#FFFFFF] text-[#1A2E24]">
      {/* ========================================================================= */}
      {/* 1. HERO WITH BACKGROUND SLIDER                                            */}
      {/* ========================================================================= */}
      <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 sm:pt-28 pb-20 bg-[#0A1E14]">
        {/* Background Image Slider with 4 Photos */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {heroSlides.map((slideUrl, idx) => (
            <div
              key={idx}
              className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 transform ${
                idx === currentSlide ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              }`}
              style={{ backgroundImage: `url(${slideUrl})` }}
            />
          ))}
          {/* Dark Gradient Overlay matching user design */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, rgba(10, 30, 20, 0.94) 0%, rgba(10, 30, 20, 0.75) 55%, rgba(10, 30, 20, 0.35) 100%)',
            }}
          />
        </div>

        {/* Slide Navigation Dots */}
        <div className="absolute right-6 sm:right-10 bottom-6 sm:bottom-1/3 z-20 flex flex-row sm:flex-col gap-3">
          {heroSlides.map((_, dotIdx) => (
            <button
              key={dotIdx}
              onClick={() => setCurrentSlide(dotIdx)}
              aria-label={`Go to slide ${dotIdx + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                dotIdx === currentSlide
                  ? 'bg-[#C8FF5E] scale-125 shadow-[0_0_15px_rgba(200,255,94,0.6)]'
                  : 'bg-white/30 hover:bg-white/70'
              }`}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-6">
          {/* Hero Content */}
          <div className="max-w-2xl text-left space-y-6">
            {/* Hero Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C8FF5E]/12 border border-[#C8FF5E]/25 text-[#C8FF5E] text-xs font-semibold uppercase tracking-wider shadow-sm">
              <Zap className="w-3.5 h-3.5 text-[#C8FF5E]" />
              <span>#1 Smart Turf Booking Platform</span>
            </div>

            {/* Hero Main Headline (Playfair Display) */}
            <h1 className="font-playfair text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight">
              Find Your Turf.<br />
              <span className="bg-gradient-to-r from-[#C8FF5E] via-[#A8E63E] to-[#7CFC00] bg-clip-text text-transparent">
                Book Your Game.
              </span>
            </h1>

            {/* Hero Tagline */}
            <p className="text-base sm:text-lg text-white/80 max-w-xl leading-relaxed">
              Discover the best sports turfs around you, check real-time availability, reserve your preferred slot and get instant confirmation — all in one place.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex items-center gap-4 flex-wrap pt-2">
              <button
                onClick={() => {
                  const el = document.getElementById('turfs');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-3.5 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm sm:text-base flex items-center gap-2.5 transition-all shadow-[0_8px_30px_rgba(200,255,94,0.35)] hover:-translate-y-1 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Book a Turf</span>
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-8 py-3.5 rounded-full bg-transparent hover:bg-white/10 text-white border-2 border-white/25 hover:border-[#C8FF5E] font-semibold text-sm sm:text-base flex items-center gap-2.5 transition-all hover:-translate-y-1 cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-white text-[#0A1E14] flex items-center justify-center shrink-0">
                  <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                </span>
                <span>How It Works</span>
              </button>
            </div>

            {/* Hero Stats */}
            <div className="flex items-center gap-8 sm:gap-12 pt-6 border-t border-white/10">
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-black text-white">500+</span>
                <span className="text-xs text-white/70">Active Turfs</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-black text-white">12K+</span>
                <span className="text-xs text-white/70">Happy Players</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-black text-white">98%</span>
                <span className="text-xs text-white/70">Satisfaction Rate</span>
              </div>
            </div>
          </div>

          {/* Hero Search Bar - Wider Glassmorphic Console */}
          <div className="mt-10 sm:mt-12 w-full max-w-5xl">
            <div className="bg-white/[0.08] backdrop-blur-xl border border-white/15 rounded-3xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              {/* Location Selector */}
              <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.10] transition-colors">
                <MapPin className="w-5 h-5 text-[#C8FF5E] shrink-0" />
                <div className="flex flex-col text-left flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Location</span>
                  <CustomSelect
                    ariaLabel="Choose location"
                    tone="dark"
                    value={selectedArea}
                    onChange={setSelectedArea}
                    triggerClassName="bg-transparent py-0.5 text-xs font-semibold sm:text-sm"
                    options={[
                      { value: 'All', label: 'All Locations' }, { value: 'Banani', label: 'Banani, Dhaka' },
                      { value: 'Gulshan', label: 'Gulshan, Dhaka' }, { value: 'Dhanmondi', label: 'Dhanmondi, Dhaka' },
                      { value: 'Uttara', label: 'Uttara, Dhaka' }, { value: 'Mirpur', label: 'Mirpur, Dhaka' },
                      { value: 'Chattogram', label: 'Chattogram, Bangladesh' },
                    ]}
                  />
                </div>
              </div>

              {/* Sport Selector */}
              <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.10] transition-colors">
                <Trophy className="w-5 h-5 text-[#C8FF5E] shrink-0" />
                <div className="flex flex-col text-left flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Sport</span>
                  <CustomSelect
                    ariaLabel="Choose sport"
                    tone="dark"
                    value={selectedSport}
                    onChange={setSelectedSport}
                    triggerClassName="bg-transparent py-0.5 text-xs font-semibold sm:text-sm"
                    options={[
                      { value: 'All', label: 'All Sports' }, { value: 'Football', label: 'Football / Futsal' },
                      { value: 'Cricket', label: 'Box Cricket & Nets' }, { value: 'Futsal', label: 'Indoor Futsal' },
                      { value: 'Badminton', label: 'Badminton Court' },
                      ...[...new Set(turfs.flatMap((turf) => turf.sportTypes || []))]
                        .filter((sport) => !['Football', 'Cricket', 'Futsal', 'Badminton'].includes(sport))
                        .sort((left, right) => left.localeCompare(right))
                        .map((sport) => ({ value: sport, label: sport })),
                    ]}
                  />
                </div>
              </div>

              {/* Date Selector */}
              <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.10] transition-colors">
                <Calendar className="w-5 h-5 text-[#C8FF5E] shrink-0" />
                <div className="flex flex-col text-left flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">Date</span>
                  <ClickableDatePicker value={selectedDate} onChange={setSelectedDate} min={getBDDateString()} showIcon={false} className="py-0.5 text-xs font-semibold text-white sm:text-sm" />
                </div>
              </div>

              {/* Search CTA Button */}
              <button
                onClick={() => {
                  const el = document.getElementById('turfs');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-6 py-3.5 rounded-2xl bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg hover:scale-[1.02] cursor-pointer"
              >
                <Search className="w-4 h-4 text-[#0A1E14]" />
                <span>Search Slots</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. TRUST BAR                                                              */}
      {/* ========================================================================= */}
      <div className="bg-[#FFFFFF] border-y border-[#E2E8E5] py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#4A5A50]">
            <CircleCheck className="w-5 h-5 text-[#6db31e]" />
            <span>Real-time Availability</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#4A5A50]">
            <ShieldCheck className="w-5 h-5 text-[#6db31e]" />
            <span>Secure Booking</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#4A5A50]">
            <Zap className="w-5 h-5 text-[#6db31e]" />
            <span>Instant Confirmation</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#4A5A50]">
            <Smartphone className="w-5 h-5 text-[#6db31e]" />
            <span>Digital Booking Pass</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#4A5A50]">
            <Headset className="w-5 h-5 text-[#6db31e]" />
            <span>24/7 Support</span>
          </div>
        </div>
      </div>


      {/* ========================================================================= */}
      {/* 2.1 FEATURED TURFS (SECTION 53.3)                                         */}
      {/* ========================================================================= */}
      {!activeSearch && settings.featureFlags?.featured_turf_enabled && featuredTurfsList.length > 0 && (
        <section id="featured" className="py-16 bg-gradient-to-b from-white to-[#F8FAF9]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#917106] bg-[#FFD700]/20 border border-[#FFD700]/40 px-3.5 py-1 rounded-full mb-2.5">
                <Star className="w-3.5 h-3.5 fill-[#FFD700] text-[#D4AF37]" /> Sponsored
              </span>
              <h2 className="font-playfair text-3xl sm:text-4xl font-extrabold text-[#0A1E14]">Featured Turfs</h2>
              <p className="text-xs sm:text-sm text-[#5A6A60] mt-1 max-w-xl">
                Premium venues promoted by their owners — hand-picked for quality and top-rated experiences.
              </p>
            </div>
            <a
              href="#all-turfs"
              className="px-5 py-2.5 rounded-full border border-[#D0D7D3] hover:border-[#0A1E14] text-[#0A1E14] text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {featuredTurfsList.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-[#E2E8E5] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_TURF_IMAGE;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0A1E14] text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                    <Crown className="w-3.5 h-3.5 fill-current" />
                    <span>Featured</span>
                  </div>
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                    <Star className="w-3.5 h-3.5 text-[#FFD700] fill-[#FFD700]" />
                    <span>{item.rating}</span>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg text-[#0A1E14] group-hover:text-[#2e690a] transition-colors">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#6A7A70]">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {item.sports.map((sp) => (
                        <span key={sp} className="bg-[#F0F3F1] text-[#4A5A50] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E2E8E5] flex items-center justify-between">
                    <div>
                      <span className="font-black text-lg text-[#0A1E14]">৳{item.price.toLocaleString()}</span>
                      <span className="text-xs text-[#7A8A80]"> / slot</span>
                    </div>
                    <button
                      onClick={() => handleViewSlotsForVenue(item.targetTurfId, item.name)}
                      className="px-4 py-2 rounded-full bg-[#0A1E14] hover:bg-[#143324] text-[#C8FF5E] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <span>View Slots</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2.2 TRENDING THIS WEEK (SECTION 53.4)                                     */}
      {/* ========================================================================= */}
      {!activeSearch && settings.featureFlags?.trending_enabled && trendingTurfsList.length > 0 && (
        <section id="trending" className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#FF6B35] bg-[#FF6B35]/15 border border-[#FF6B35]/30 px-3.5 py-1 rounded-full mb-2.5">
                <Flame className="w-3.5 h-3.5 fill-[#FF6B35]" /> Hot Right Now
              </span>
              <h2 className="font-playfair text-3xl sm:text-4xl font-extrabold text-[#0A1E14]">Trending This Week</h2>
              <p className="text-xs sm:text-sm text-[#5A6A60] mt-1 max-w-xl">
                The most-booked turfs in the last 7 days — based on real confirmed bookings.
              </p>
            </div>
            <a
              href="#all-turfs"
              className="px-5 py-2.5 rounded-full border border-[#D0D7D3] hover:border-[#0A1E14] text-[#0A1E14] text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {trendingTurfsList.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-[#E2E8E5] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_TURF_IMAGE;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 bg-gradient-to-r from-[#FF6B35] to-[#FF3B3B] text-white text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                    <Flame className="w-3.5 h-3.5 fill-white" />
                    <span>Trending</span>
                  </div>
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                    <Star className="w-3.5 h-3.5 text-[#FFD700] fill-[#FFD700]" />
                    <span>{item.rating}</span>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg text-[#0A1E14] group-hover:text-[#2e690a] transition-colors">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#6A7A70]">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {item.sports.map((sp) => (
                        <span key={sp} className="bg-[#F0F3F1] text-[#4A5A50] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E2E8E5] flex items-center justify-between">
                    <div>
                      <span className="font-black text-lg text-[#0A1E14]">৳{item.price.toLocaleString()}</span>
                      <span className="text-xs text-[#7A8A80]"> / slot</span>
                    </div>
                    <button
                      onClick={() => handleViewSlotsForVenue(item.targetTurfId, item.name)}
                      className="px-4 py-2 rounded-full bg-[#0A1E14] hover:bg-[#143324] text-[#C8FF5E] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <span>View Slots</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2.3 NEAR YOU (SECTION 53.5)                                               */}
      {/* ========================================================================= */}
      {!activeSearch && settings.featureFlags?.near_you_enabled && nearbyTurfsList.length > 0 && (
        <section id="nearby" className="py-16 bg-[#F8FAF9]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <div className="inline-flex flex-wrap items-center gap-2 mb-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e5306] bg-[#C8FF5E]/25 border border-[#C8FF5E]/50 px-3.5 py-1 rounded-full">
                  <Crosshair className="w-3.5 h-3.5 text-[#3e780a]" />
                  {locationStatus === 'granted'
                    ? 'Using your live location'
                    : locationStatus === 'requesting'
                    ? 'Detecting your location...'
                    : 'Estimated nearby turfs'}
                </span>
                {locationStatus !== 'granted' && locationStatus !== 'requesting' && locationStatus !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#0A1E14] bg-white border border-[#D0D7D3] hover:border-[#0A1E14] px-3 py-1 rounded-full cursor-pointer transition-colors"
                  >
                    <Crosshair className="w-3 h-3" />
                    Enable Location
                  </button>
                )}
              </div>
              <h2 className="font-playfair text-3xl sm:text-4xl font-extrabold text-[#0A1E14]">Near You</h2>
              <p className="text-xs sm:text-sm text-[#5A6A60] mt-1 max-w-xl">
                {locationStatus === 'granted'
                  ? 'Turfs closest to your current location — perfect for a quick game.'
                  : locationStatus === 'denied'
                  ? 'Location access was denied — showing estimated nearby turfs instead. Enable location in your browser settings for accurate distances.'
                  : 'Turfs closest to your current location — perfect for a quick game.'}
              </p>
            </div>
            <a
              href="#all-turfs"
              className="px-5 py-2.5 rounded-full border border-[#D0D7D3] hover:border-[#0A1E14] text-[#0A1E14] text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {nearbyTurfsList.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-[#E2E8E5] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_TURF_IMAGE;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 bg-gradient-to-r from-[#4A90E2] to-[#357ABD] text-white text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Nearby</span>
                  </div>
                  <div className="absolute bottom-3 left-3 bg-[#0A1E14]/85 backdrop-blur text-[#C8FF5E] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow">
                    <Navigation className="w-3 h-3 text-[#C8FF5E]" />
                    <span>{item.distance}</span>
                  </div>
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                    <Star className="w-3.5 h-3.5 text-[#FFD700] fill-[#FFD700]" />
                    <span>{item.rating}</span>
                  </div>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg text-[#0A1E14] group-hover:text-[#2e690a] transition-colors">
                      {item.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#6A7A70]">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {item.sports.map((sp) => (
                        <span key={sp} className="bg-[#F0F3F1] text-[#4A5A50] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#E2E8E5] flex items-center justify-between">
                    <div>
                      <span className="font-black text-lg text-[#0A1E14]">৳{item.price.toLocaleString()}</span>
                      <span className="text-xs text-[#7A8A80]"> / slot</span>
                    </div>
                    <button
                      onClick={() => handleViewSlotsForVenue(item.targetTurfId, item.name)}
                      className="px-4 py-2 rounded-full bg-[#0A1E14] hover:bg-[#143324] text-[#C8FF5E] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <span>View Slots</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 2.4 LOOKING FOR TEAMMATES? (SECTION 49)                                   */}
      {/* ========================================================================= */}
      {settings.featureFlags?.squad_enabled && !activeSearch && communityMatchesList.length > 0 && (
      <section id="community" className="py-20 bg-gradient-to-b from-white to-[#F0F3F1] border-t border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1e5306] bg-[#C8FF5E]/25 border border-[#C8FF5E]/50 px-3.5 py-1 rounded-full mb-2.5">
                <Users className="w-3.5 h-3.5" /> Community
              </span>
              <h2 className="font-playfair text-3xl sm:text-4xl font-extrabold text-[#0A1E14]">
                Looking for Teammates?
              </h2>
              <p className="text-xs sm:text-sm text-[#5A6A60] mt-1 max-w-xl">
                Join friendly open games or recruit missing players for your squad. Payment is settled directly with the captain — not through TurfySlot.
              </p>
            </div>
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  openSignInModal('player');
                } else {
                  setActiveTab('squads');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="px-5 py-2.5 rounded-full border border-[#D0D7D3] hover:border-[#0A1E14] text-[#0A1E14] text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            >
              <span>View All Squads ({squadMatches.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communityMatchesList.map((m) => {
              const isJoined = joinedSquadIds.includes(m.id);
              return (
              <div
                key={m.id}
                className="bg-white rounded-3xl border border-[#E2E8E5] p-6 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-[#0A1E14]">{m.sport}</span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F0F3F1] text-[#4A5A50]">
                      {m.skill}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-[#0A1E14]">{m.venue}</h3>

                  <div className="space-y-1.5 text-xs text-[#6A7A70]">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-[#3e780a]" />
                      <span>{m.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#3e780a]" />
                      <span>{m.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#3e780a]" />
                      <span>{m.area}</span>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-xs text-[#FF6B35] font-bold bg-[#FF6B35]/10 px-3 py-1 rounded-full">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Needs {m.playersNeeded} player{m.playersNeeded > 1 ? 's' : ''}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E2E8E5] flex items-center justify-between">
                  <span className="text-xs text-[#7A8A80]">Captain: <strong className="text-[#0A1E14]">{m.captain}</strong></span>
                  <button
                    onClick={() => {
                      if (!isAuthenticated) {
                        openSignInModal('player');
                      } else {
                        void handleJoinSquad(m.id);
                      }
                    }}
                    disabled={isJoined || m.playersNeeded === 0}
                    className="px-4 py-2 rounded-full bg-[#0A1E14] hover:bg-[#143324] text-[#C8FF5E] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-default"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isJoined ? 'Joined' : 'Join Match'}</span>
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          {squadJoinMessage && <p role="status" className="mt-4 text-sm text-[#0A1E14]">{squadJoinMessage}</p>}

          {/* Direct Settlement Notice */}
          <div className="mt-8 p-5 bg-white border border-[#E2E8E5] rounded-2xl flex items-start gap-3.5 text-xs text-[#6A7A70] leading-relaxed shadow-sm">
            <Info className="w-5 h-5 text-[#3e780a] shrink-0 mt-0.5" />
            <p>
              <strong className="text-[#0A1E14] font-semibold">Community matches are settled directly. </strong>
              TurfySlot is not a party to any payment between a match captain and participants. The captain is responsible for the booking; participants settle payment with the captain offline.
            </p>
          </div>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* 2.5 LIVE & UPCOMING TOURNAMENTS (SECTION 50)                              */}
      {/* ========================================================================= */}
      {settings.featureFlags?.tournament_enabled && !activeSearch && homeTournaments.length > 0 && (
      <section id="tournaments" className="py-20 bg-[#0A1E14] text-white relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[#C8FF5E]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2.5">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#C8FF5E] bg-[#C8FF5E]/15 border border-[#C8FF5E]/30 px-4 py-1 rounded-full">
              Compete &amp; Win
            </span>
            <h2 className="font-playfair text-3xl sm:text-5xl font-extrabold text-white">
              Live &amp; Upcoming Tournaments
            </h2>
            <p className="text-xs sm:text-sm text-white/70">
              Join exciting tournaments, showcase your skills and compete for amazing prizes.
            </p>

            {/* Filter Tabs */}
            <div className="flex items-center justify-center gap-2 flex-wrap pt-4">
              {(['all', 'football', 'futsal', 'cricket', 'basketball'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTournamentFilter(tab)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer capitalize ${
                    tournamentFilter === tab
                      ? 'bg-[#C8FF5E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                      : 'bg-white/10 hover:bg-white/15 text-white/80'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tournament Slider with Prev/Next Controls */}
          <div className="relative">
            {/* Slider Container */}
            <div
              ref={tournamentSliderRef}
              className="flex gap-6 overflow-x-auto pb-6 scroll-smooth snap-x"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {homeTournaments
                .filter((t) => tournamentFilter === 'all' || t.category === tournamentFilter)
                .map((t) => (
                  <div
                    key={t.id}
                    className="min-w-[300px] sm:min-w-[340px] max-w-[340px] bg-gradient-to-b from-[#173c2b] to-[#0c2117] border border-white/10 rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.28)] flex flex-col justify-between snap-start group hover:-translate-y-1 hover:border-[#C8FF5E]/45 hover:shadow-[0_26px_70px_rgba(0,0,0,0.4)] transition-all duration-300"
                  >
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={t.image}
                        alt={t.title}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_TURF_IMAGE;
                        }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0c2117] via-[#07130c]/10 to-black/45" />
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0c2117]/80 to-transparent" />

                      {/* Status Badge */}
                      <div className="absolute top-3 left-3">
                        {t.status === 'live' ? (
                          <span className="bg-rose-600/95 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-black/20 backdrop-blur-sm">
                            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                            <span>Live Now</span>
                          </span>
                        ) : t.status === 'registration' ? (
                          <span className="bg-orange-500/95 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-full shadow-lg shadow-black/20 backdrop-blur-sm">
                            Registration Open
                          </span>
                        ) : t.status === 'upcoming' ? (
                          <span className="bg-[#C8FF5E] text-[#0A1E14] text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-full shadow-lg shadow-black/20">
                            Upcoming
                          </span>
                        ) : (
                          <span className="bg-black/45 backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-full shadow-lg">
                            Completed
                          </span>
                        )}
                      </div>

                      {/* Sport Badge */}
                      <div className="absolute top-3 right-3 bg-black/45 backdrop-blur-md border border-white/20 px-3 py-2 rounded-xl text-white flex items-center gap-2 shadow-lg">
                        <Trophy className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">{t.sport}</span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <h3 className="font-playfair text-xl sm:text-2xl leading-tight font-bold text-white group-hover:text-[#C8FF5E] transition-colors line-clamp-2 min-h-[3.25rem]">
                          {t.title}
                        </h3>
                        <div className="space-y-2 text-xs text-white/70">
                          <span className="flex items-start gap-2">
                            <Calendar className="w-3.5 h-3.5 mt-0.5 text-[#C8FF5E] shrink-0" /> <span>{t.dates}</span>
                          </span>
                          <span className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 text-[#C8FF5E] shrink-0" /> <span className="line-clamp-1">{t.location}</span>
                          </span>
                        </div>
                      </div>

                      {/* 3 Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl border border-white/[0.06] bg-black/15 px-2 py-3">
                          <span className="text-white/45 block text-[9px] uppercase tracking-wider font-bold">Teams</span>
                          <span className="mt-1 font-bold text-white text-xs">{t.teams}</span>
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-black/15 px-2 py-3">
                          <span className="text-white/45 block text-[9px] uppercase tracking-wider font-bold">Matches</span>
                          <span className="mt-1 font-bold text-white text-xs">{t.matches}</span>
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-black/15 px-2 py-3">
                          <span className="text-white/45 block text-[9px] uppercase tracking-wider font-bold">Status</span>
                          <span className="mt-1 font-bold text-[#C8FF5E] text-xs truncate block">{t.daysLeft}</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-[9px] text-white/50 uppercase block font-bold tracking-wider">
                            {t.status === 'completed' ? 'Award' : 'Prize Pool'}
                          </span>
                          <span title={t.prize} className="mt-1 block max-w-[175px] truncate font-playfair text-base sm:text-lg font-black text-[#C8FF5E]">{t.prize}</span>
                        </div>

                        <button
                          onClick={() => {
                            if (!isAuthenticated) {
                              openSignInModal('player');
                            } else {
                              setActiveTab('tournaments');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={`shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                            t.status === 'completed'
                              ? 'bg-white/10 text-white hover:bg-white/20'
                              : 'bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] shadow-md shadow-[#C8FF5E]/20'
                          }`}
                        >
                          {!isAuthenticated && <Lock className="w-3 h-3" />}
                          <span>{t.actionLabel}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Prev / Next Scroll Buttons */}
            <button
              onClick={() => scrollTournaments('left')}
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#0A1E14]/90 border border-white/20 text-white flex items-center justify-center hover:bg-[#C8FF5E] hover:text-[#0A1E14] transition-all cursor-pointer shadow-xl z-20"
              aria-label="Previous tournaments"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollTournaments('right')}
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#0A1E14]/90 border border-white/20 text-white flex items-center justify-center hover:bg-[#C8FF5E] hover:text-[#0A1E14] transition-all cursor-pointer shadow-xl z-20"
              aria-label="Next tournaments"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  openSignInModal('player');
                } else {
                  setActiveTab('tournaments');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="px-8 py-3.5 rounded-full border-2 border-[#C8FF5E] text-[#C8FF5E] hover:bg-[#C8FF5E] hover:text-[#0A1E14] font-bold text-xs sm:text-sm transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <span>View All Tournaments</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* 2.6 ALL TURFS (SECTION 53.6)                                              */}
      {/* ========================================================================= */}
      <section id="all-turfs" className="py-12 sm:py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <span id="turfs" className="sr-only" />
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <span className="mb-2 inline-flex items-center rounded-full border border-[#C8FF5E]/30 bg-[#C8FF5E]/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#3e780a] sm:mb-2.5 sm:px-4 sm:text-xs">
              Explore Venues
            </span>
            <h2 className="font-playfair text-3xl font-extrabold text-[#0A1E14] sm:text-5xl">
              All Turfs
            </h2>
            <p className="text-xs sm:text-sm text-[#5A6A60] mt-1 max-w-xl">
              Browse the complete catalog of active turfs. Use filters to find your perfect venue.
            </p>
          </div>

          {/* Sort Dropdown */}
          <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[11px] font-semibold text-[#5A6A60] sm:text-xs">Sort turfs by</span>
            <CustomSelect
              ariaLabel="Sort turfs"
              value={allTurfsSort}
              onChange={setAllTurfsSort}
              triggerClassName="w-full border border-[#DCE5DF] bg-white px-4 py-3 text-sm font-bold shadow-sm sm:min-w-48 sm:py-2.5 sm:text-xs"
              options={[
                { value: 'relevance', label: 'Relevance' }, { value: 'price_asc', label: 'Price: Low to High' },
                { value: 'price_desc', label: 'Price: High to Low' }, { value: 'rating_desc', label: 'Rating: High to Low' },
                ...(userCoords ? [{ value: 'distance', label: 'Distance' }] : []), { value: 'newest', label: 'Newest' },
              ]}
            />
          </div>
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-[#E2E8E5] bg-white shadow-sm sm:mb-5">
          <button type="button" aria-expanded={showPriceRatingFilters} aria-controls="price-rating-filters" onClick={() => setShowPriceRatingFilters((open) => !open)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#F8FAF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6db31e] sm:gap-4 sm:px-5 sm:py-4">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#1A2E24]">Price and rating</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[#718078]">Set your hourly budget and minimum rating</span>
            </span>
            <span className="flex max-w-[46%] shrink-0 items-center gap-1.5 text-right text-[11px] font-bold text-[#3e780a] sm:max-w-none sm:gap-2 sm:text-xs">
              <span className="leading-snug">{(minimumPrice || maximumPrice || minimumRating) ? 'Filters applied' : 'Any price · Any rating'}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showPriceRatingFilters ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showPriceRatingFilters && <div id="price-rating-filters" className="grid grid-cols-1 gap-5 border-t border-[#E2E8E5] bg-[#FBFCFB] p-4 sm:p-5 md:grid-cols-3">
          <label className="min-w-0 text-xs font-semibold text-[#5A6A60]">
            <span className="flex items-center justify-between gap-2">Minimum price per hour <span className="font-bold text-[#0A1E14]">{minimumPrice ? `৳${Number(minimumPrice).toLocaleString()}` : 'Any'}</span></span>
            <input aria-label="Minimum price per hour" type="range" min="0" max={maxPriceLimit} step="100" value={minimumPrice === '' ? 0 : Math.min(Number(minimumPrice), maxPriceLimit)} onChange={(event) => {
              const next = Number(event.target.value);
              setMinimumPrice(next === 0 ? '' : String(next));
              if (maximumPrice !== '' && next > Number(maximumPrice)) setMaximumPrice(String(next));
            }} className="mt-4 h-2 w-full cursor-pointer accent-[#6db31e]" />
            <span className="mt-1 flex justify-between text-[10px] font-normal text-[#8A978F]"><span>৳0</span><span>৳{maxPriceLimit.toLocaleString()}</span></span>
          </label>
          <label className="min-w-0 text-xs font-semibold text-[#5A6A60]">
            <span className="flex items-center justify-between gap-2">Maximum price per hour <span className="font-bold text-[#0A1E14]">{maximumPrice ? `৳${Number(maximumPrice).toLocaleString()}` : 'Any'}</span></span>
            <input aria-label="Maximum price per hour" type="range" min="0" max={maxPriceLimit} step="100" value={maximumPrice === '' ? maxPriceLimit : Math.min(Number(maximumPrice), maxPriceLimit)} onChange={(event) => {
              const next = Number(event.target.value);
              setMaximumPrice(next >= maxPriceLimit ? '' : String(next));
              if (minimumPrice !== '' && next < Number(minimumPrice)) setMinimumPrice(String(next));
            }} className="mt-4 h-2 w-full cursor-pointer accent-[#6db31e]" />
            <span className="mt-1 flex justify-between text-[10px] font-normal text-[#8A978F]"><span>৳0</span><span>৳{maxPriceLimit.toLocaleString()} · Any</span></span>
          </label>
          <label className="min-w-0 text-xs font-semibold text-[#5A6A60]">
            <span className="flex items-center justify-between gap-2">Minimum rating <span className="font-bold text-[#0A1E14]">{minimumRating ? `${minimumRating}+ stars` : 'Any rating'}</span></span>
            <input aria-label="Minimum rating" type="range" min="0" max="5" step="0.1" value={minimumRating === '' ? 0 : Math.round(Number(minimumRating) * 10) / 10} onChange={(event) => setMinimumRating(Number(event.target.value) === 0 ? '' : (Math.round(Number(event.target.value) * 10) / 10).toFixed(1))} className="mt-4 h-2 w-full cursor-pointer accent-[#6db31e]" />
            <span className="mt-1 flex justify-between text-[10px] font-normal text-[#8A978F]"><span>Any</span><span>5 stars</span></span>
          </label>
          </div>}
        </div>

        {/* Filter Chips Bar */}
        <div className="-mx-4 mb-7 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-[#E2E8E5] px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mb-10 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-2">
          {['All Sports', 'Football', 'Cricket', 'Futsal', 'Basketball', '4+ Rating', 'Open Now'].map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={allTurfsSportFilter === filter}
              onClick={() => setAllTurfsSportFilter(filter)}
              className={`min-h-11 shrink-0 snap-start rounded-full border px-4 py-2 text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6db31e] focus-visible:ring-offset-2 ${
                allTurfsSportFilter === filter
                  ? 'border-[#0A1E14] bg-[#0A1E14] text-[#C8FF5E] shadow-sm'
                  : 'border-[#E2E8E5] bg-white text-[#1A2E24] hover:border-[#B5C5BA] hover:bg-[#F5F8F6]'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* 3-Column Turf Cards Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-7">
          {filteredAndSortedTurfs.map((turf, idx) => {
            const isFav = favorites.includes(turf.id);
            const turfBadge = idx === 0 ? 'Premium' : idx === 1 ? 'Top Rated' : 'Available Today';
            const cardImage =
              turf.photos?.[0] ||
              'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1000&q=85';

            return (
              <div
                key={turf.id}
                className="bg-white rounded-3xl border border-[#E2E8E5] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                {/* Photo & Badges */}
                <div className="relative h-48 overflow-hidden sm:h-52">
                  <img
                    src={cardImage}
                    alt={turf.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_TURF_IMAGE;
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 bg-[#0A1E14]/80 backdrop-blur text-[#C8FF5E] text-xs font-bold px-3 py-1 rounded-full">
                    {turfBadge}
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <div className="bg-black/60 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-[#FFD700] fill-[#FFD700]" />
                      <span>{turf.rating || 4.8}</span>
                    </div>
                    <button
                      onClick={() => toggleFavorite(turf.id)}
                      className="w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-1 flex-col justify-between space-y-4 p-5 sm:p-6">
                  <div className="space-y-2">
                    <h3 className="font-playfair text-xl font-bold text-[#0A1E14] group-hover:text-[#6db31e] transition-colors">
                      {turf.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#5A6A60]">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{turf.address}, {turf.area}</span>
                    </div>
                    <p className="text-xs text-[#7A8A80] line-clamp-2 leading-relaxed">
                      {turf.description}
                    </p>

                    {/* Sports Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                      {turf.sportTypes?.map((sport) => (
                        <span key={sport} className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F0F3F1] text-[#1A2E24]">
                          {sport}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pricing & CTA */}
                  <div className="pt-4 border-t border-[#E2E8E5] flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#7A8A80] block">Starting from</span>
                      <span className="font-playfair text-xl font-black text-[#0A1E14]">
                        ৳{startingPriceForCard(turf).toLocaleString()}
                      </span>
                      <span className="text-xs text-[#7A8A80]"> / slot</span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTurf(turf);
                        setTimeout(() => {
                          const el = document.getElementById('live-slot-picker');
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                      }}
                      className="px-5 py-2.5 rounded-full bg-[#0A1E14] hover:bg-[#143324] text-[#C8FF5E] text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>View Slots</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {discoveryLoading && discoveryTurfs.length === 0 && <p className="text-center py-8 text-sm text-[#5A6A60]">Loading available turfs…</p>}
        {discoveryError && <p role="alert" className="text-center py-4 text-sm text-rose-700">{discoveryError}</p>}
        {!discoveryLoading && !discoveryError && filteredAndSortedTurfs.length === 0 && (
          <p className="text-center py-8 text-sm text-[#5A6A60]">No turfs match your filters. Try changing or clearing them.</p>
        )}

        {/* Load More Button */}
        {hasMoreDiscoveryTurfs && (
          <div className="mt-12 text-center">
            <button
              onClick={() => void loadMoreTurfs()}
              disabled={discoveryLoading}
              className="px-8 py-3.5 rounded-full border-2 border-[#0A1E14] text-[#0A1E14] hover:bg-[#0A1E14] hover:text-[#C8FF5E] font-bold text-xs sm:text-sm transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span>{discoveryLoading ? 'Loading…' : 'Load More Turfs'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Live Slot Drawer (Interactive reservation with 10-min hold) */}
        {selectedTurf && (
          <div id="live-slot-picker" className="mt-12 p-6 sm:p-8 rounded-3xl bg-[#F8FAF9] border-2 border-[#C8FF5E]/60 shadow-lg space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8E5]">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#6db31e]">Live Availability</span>
                <h3 className="font-playfair text-2xl font-bold text-[#0A1E14]">{selectedTurf.name}</h3>
                <p className="text-xs text-[#5A6A60]">Choose consecutive hours, then complete payment within {settings.bookingHoldMinutes ?? 10} minutes to keep the reservation.</p>
              </div>
              <div className="flex items-center gap-3">
                <ClickableDatePicker value={selectedDate} onChange={setSelectedDate} min={getBDDateString()} className="rounded-xl border border-[#E2E8E5] bg-white px-3.5 py-2 text-xs font-semibold text-[#1A2E24] shadow-sm" />
                <button
                  onClick={() => setSelectedTurf(null)}
                  className="text-xs text-[#7A8A80] hover:text-[#0A1E14] font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-[#E2E8E5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="font-bold text-[#0A1E14]">Turf Location</h4>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[#5A6A60]">
                  <MapPin className="h-4 w-4 shrink-0" /> {selectedTurf.address}, {selectedTurf.area}, {selectedTurf.city}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocationMapTurfId((current) => current === selectedTurf.id ? null : selectedTurf.id)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#6db31e]/40 bg-[#C8FF5E]/20 px-4 py-2 text-sm font-bold text-[#0A1E14] hover:bg-[#C8FF5E]/40"
              >
                <MapPin className="h-4 w-4" /> {locationMapTurfId === selectedTurf.id ? 'Hide Map' : 'Map'}
              </button>
            </div>
            {locationMapTurfId === selectedTurf.id && (
              <TurfMap latitude={selectedTurf.latitude} longitude={selectedTurf.longitude} className="h-64" />
            )}

            {/* Slots Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {(slotsByTurf[selectedTurf.id] || []).slice(0, 12).map((slot) => {
                const isAvail = slot.status === 'available';
                const isLocked = slot.status === 'locked';
                const isOwnedLockedSlot = isLocked && slot.lockedByUserId === currentUser.id;
                const isSelected = selectedBookingSlots.some((selectedSlot) => selectedSlot.id === slot.id);
                const [startHour, startMinute] = slot.startTime.split(':').map(Number);
                const [endHour, endMinute] = slot.endTime.split(':').map(Number);
                const today = `${currentBDTime.getFullYear()}-${String(currentBDTime.getMonth() + 1).padStart(2, '0')}-${String(currentBDTime.getDate()).padStart(2, '0')}`;
                const currentMinutes = currentBDTime.getHours() * 60 + currentBDTime.getMinutes();
                const isPast = slot.date < today || (slot.date === today && endHour * 60 + endMinute <= currentMinutes);
                const hasStarted = slot.date < today || (slot.date === today && startHour * 60 + startMinute <= currentMinutes);
                const isClickable = !hasStarted && (isAvail || isOwnedLockedSlot);

                return (
                  <button
                    key={slot.id}
                    disabled={!isClickable}
                    onClick={() => handleSelectSlot(selectedTurf, slot)}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col justify-between ${
                      isPast
                        ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60'
                        : isSelected
                        ? 'bg-[#C8FF5E]/15 border-[#6db31e] shadow-md cursor-pointer'
                        : isAvail
                        ? 'bg-white border-[#E2E8E5] hover:border-[#6db31e] hover:shadow-md cursor-pointer group'
                        : isOwnedLockedSlot
                        ? 'bg-amber-50 border-amber-200 cursor-pointer opacity-90'
                        : isLocked
                        ? 'bg-amber-50 border-amber-200 cursor-not-allowed opacity-80'
                        : 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60'
                    }`}
                  >
                      <span className={`text-xs font-bold ${isPast ? 'text-slate-500' : 'text-[#1A2E24] group-hover:text-[#6db31e]'}`}>
                      {formatBDTimeRange(slot.startTime, slot.endTime)}
                    </span>
                    <div className="mt-2">
                      <span className="text-xs font-black text-[#0A1E14]">৳{displayedSlotPrice(slot).toLocaleString()}</span>
                      {slot.pricingLabel && <span className="mt-1 text-[9px] font-semibold text-[#5A6A60]">{slot.pricingLabel}</span>}
                      <span className={`block text-[10px] font-semibold mt-1 uppercase ${
                        isPast ? 'text-slate-500' : isSelected ? 'text-[#6db31e]' : isAvail ? 'text-[#6db31e]' : isOwnedLockedSlot ? 'text-amber-600' : isLocked ? 'text-amber-600' : 'text-slate-500'
                      }`}>
                        {isPast ? 'Time Passed' : hasStarted ? 'In Progress' : isOwnedLockedSlot ? 'Click to Unlock' : isSelected ? 'Selected' : isAvail ? 'Available' : isLocked ? 'Locked' : 'Booked'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {visibleSelectedBookingSlots.length > 0 && (
              <div className="mt-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-[#C8FF5E]/40 bg-[#F2FFBE] p-4 shadow-[0_12px_40px_rgba(200,255,94,0.18)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A60]">Selected Booking</div>
                      <div className="mt-1 text-sm font-bold text-[#0A1E14]">
                        {formatBDTimeRange(visibleSelectedBookingSlots[0].startTime, visibleSelectedBookingSlots[visibleSelectedBookingSlots.length - 1].endTime)}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-[#5A6A60]">
                        {new Intl.DateTimeFormat('en-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date(`${visibleSelectedBookingSlots[0].date}T12:00:00+06:00`))}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-xs font-bold text-[#0A1E14] sm:mt-0">
                      <span className="rounded-full bg-[#0A1E14] px-2 py-1 text-[#C8FF5E]">
                        {visibleSelectedBookingSlots.length} hour{visibleSelectedBookingSlots.length > 1 ? 's' : ''}
                      </span>
                      <span className="rounded-full bg-white/60 px-2 py-1 text-[#0A1E14]">
                        ৳{visibleSelectedBookingSlots.reduce((sum, slot) => sum + displayedSlotPrice(slot), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onContinueBooking}
                    className="mt-3 inline-flex items-center justify-center rounded-full bg-[#0A1E14] px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.08em] text-[#C8FF5E] transition hover:bg-[#1A2E24] sm:mt-0"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 4. FEATURES SECTION                                                       */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 bg-[#F8FAF9] border-y border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#6db31e] bg-[#C8FF5E]/15 px-4 py-1.5 rounded-full">
              Built for Players
            </span>
            <h2 className="font-playfair text-3xl sm:text-5xl font-extrabold text-[#0A1E14]">
              Everything You Need to Play Better
            </h2>
            <p className="text-sm sm:text-base text-[#5A6A60] leading-relaxed">
              A simple booking experience for players and powerful management tools for turf owners.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] text-center hover:-translate-y-1 hover:shadow-md hover:border-[#A8E63E] transition-all space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#C8FF5E]/15 mx-auto flex items-center justify-center text-[#6db31e]">
                <Clock className="w-7 h-7" />
              </div>
              <h4 className="font-playfair text-lg font-bold text-[#0A1E14]">Live Slot Availability</h4>
              <p className="text-xs sm:text-sm text-[#6A7A70] leading-relaxed">
                See available, booked and unavailable slots in real time before making your reservation.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] text-center hover:-translate-y-1 hover:shadow-md hover:border-[#A8E63E] transition-all space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#C8FF5E]/15 mx-auto flex items-center justify-center text-[#6db31e]">
                <CreditCard className="w-7 h-7" />
              </div>
              <h4 className="font-playfair text-lg font-bold text-[#0A1E14]">Easy Payments</h4>
              <p className="text-xs sm:text-sm text-[#6A7A70] leading-relaxed">
                Support online payment (bKash/Nagad/Cards) and 0 TK gateway fee counter cash bookings.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] text-center hover:-translate-y-1 hover:shadow-md hover:border-[#A8E63E] transition-all space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#C8FF5E]/15 mx-auto flex items-center justify-center text-[#6db31e]">
                <Ticket className="w-7 h-7" />
              </div>
              <h4 className="font-playfair text-lg font-bold text-[#0A1E14]">Digital Booking Pass</h4>
              <p className="text-xs sm:text-sm text-[#6A7A70] leading-relaxed">
                Get a booking reference and digital pass with QR code you can show at the venue for instant check-in.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] text-center hover:-translate-y-1 hover:shadow-md hover:border-[#A8E63E] transition-all space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#C8FF5E]/15 mx-auto flex items-center justify-center text-[#6db31e]">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h4 className="font-playfair text-lg font-bold text-[#0A1E14]">Trusted Venues</h4>
              <p className="text-xs sm:text-sm text-[#6A7A70] leading-relaxed">
                Discover organized, verified and professionally managed sports facilities with FIFA grade turf.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. HOW IT WORKS                                                           */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#6db31e] bg-[#C8FF5E]/15 px-4 py-1.5 rounded-full">
            Simple Process
          </span>
          <h2 className="font-playfair text-3xl sm:text-5xl font-extrabold text-[#0A1E14]">
            Book Your Game in 3 Steps
          </h2>
          <p className="text-sm sm:text-base text-[#5A6A60] leading-relaxed">
            From finding a turf to playing your game — we've made it seamless.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
          {/* Step 1 */}
          <div className="text-center space-y-4 relative">
            <div className="w-16 h-16 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-playfair font-black text-2xl flex items-center justify-center mx-auto shadow-lg">
              01
            </div>
            <h4 className="font-playfair text-xl font-bold text-[#0A1E14]">Find a Turf</h4>
            <p className="text-sm text-[#6A7A70] max-w-xs mx-auto leading-relaxed">
              Search by location, sport and date to discover a suitable venue with the best floodlights and amenities.
            </p>
          </div>

          {/* Step 2 */}
          <div className="text-center space-y-4 relative">
            <div className="w-16 h-16 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-playfair font-black text-2xl flex items-center justify-center mx-auto shadow-lg">
              02
            </div>
            <h4 className="font-playfair text-xl font-bold text-[#0A1E14]">Choose a Slot</h4>
            <p className="text-sm text-[#6A7A70] max-w-xs mx-auto leading-relaxed">
              Check the live schedule, select your preferred time, and our engine will hold it for {settings.bookingHoldMinutes ?? 10} minutes while you check out.
            </p>
          </div>

          {/* Step 3 */}
          <div className="text-center space-y-4 relative">
            <div className="w-16 h-16 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-playfair font-black text-2xl flex items-center justify-center mx-auto shadow-lg">
              03
            </div>
            <h4 className="font-playfair text-xl font-bold text-[#0A1E14]">Confirm &amp; Play</h4>
            <p className="text-sm text-[#6A7A70] max-w-xs mx-auto leading-relaxed">
              Complete your booking and arrive at the ground with your digital QR booking reference for contactless entry.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. FOR TURF OWNERS: LIST YOUR TURF (TURN EMPTY HOURS INTO CONSISTENT REVENUE) */}
      {/* ========================================================================= */}
      <section id="list-your-turf" className="relative py-24 sm:py-28 overflow-hidden bg-gradient-to-br from-[#0A1E14] via-[#0D2619] to-[#143324] text-white">
        {/* Subtle background texture and radial glow */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=2000&q=80')` }}
        />
        <div className="absolute -top-[30%] -right-[10%] w-1/2 h-[160%] bg-[radial-gradient(ellipse,rgba(200,255,94,0.08)_0%,transparent_60%)] pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
            {/* LEFT: Copy & Benefits */}
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 bg-[#C8FF5E]/[0.12] border border-[#C8FF5E]/25 px-4.5 py-2 rounded-full text-[#C8FF5E] text-xs font-bold uppercase tracking-wider">
                <Briefcase className="w-3.5 h-3.5" />
                <span>For Turf Owners</span>
              </span>

              <h2 className="font-playfair text-3xl sm:text-5xl lg:text-[54px] font-black leading-[1.1] text-white tracking-tight">
                Turn Empty Hours<br className="hidden sm:inline" /> Into{' '}
                <span className="bg-gradient-to-r from-[#C8FF5E] to-[#7CFC00] bg-clip-text text-transparent">
                  Consistent Revenue
                </span>
              </h2>

              <p className="text-base sm:text-[17px] text-[#A3B8AC] leading-[1.8] max-w-[520px]">
                List your turf on TurfySlot and reach thousands of players in your area. Manage bookings, track earnings, and get paid — all from one dashboard.
              </p>

              <ul className="flex flex-col gap-3.5 pt-1">
                <li className="flex items-center gap-3 text-[15px] font-medium text-white/95">
                  <CircleCheck className="w-[18px] h-[18px] text-[#C8FF5E] shrink-0" />
                  <span>Free turf listing after admin approval</span>
                </li>
                <li className="flex items-center gap-3 text-[15px] font-medium text-white/95">
                  <CircleCheck className="w-[18px] h-[18px] text-[#C8FF5E] shrink-0" />
                  <span>Real-time booking dashboard &amp; calendar</span>
                </li>
                <li className="flex items-center gap-3 text-[15px] font-medium text-white/95">
                  <CircleCheck className="w-[18px] h-[18px] text-[#C8FF5E] shrink-0" />
                  <span>Secure online payments</span>
                </li>
                <li className="flex items-center gap-3 text-[15px] font-medium text-white/95">
                  <CircleCheck className="w-[18px] h-[18px] text-[#C8FF5E] shrink-0" />
                  <span>Transparent commission — no hidden fees</span>
                </li>
              </ul>

              <div className="pt-3 flex flex-wrap items-center gap-4">
                <button
                  id="list-your-turf-btn"
                  onClick={() => openSignInModal('turf_owner')}
                  className="px-8 py-3.5 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-bold text-sm sm:text-base transition-all shadow-lg hover:scale-105 inline-flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>List Your Turf Now</span>
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('how-it-works');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-7 py-3.5 rounded-full bg-transparent hover:bg-white/10 text-white border border-white/30 font-semibold text-sm sm:text-base transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Learn More</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* RIGHT: Revenue Simulator Card */}
            <div>
              <div className="bg-white/[0.05] backdrop-blur-xl border border-[#C8FF5E]/20 rounded-[32px] p-6 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.40)]">
                <div className="flex items-center gap-3.5 pb-6 mb-6 border-b border-white/[0.08]">
                  <div className="w-12 h-12 rounded-xl bg-[#C8FF5E]/15 flex items-center justify-center text-[#C8FF5E] shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-playfair text-lg font-bold text-white">Revenue Simulator</h4>
                    <p className="text-xs text-[#A3B8AC]">Estimate your monthly earnings</p>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  {/* Hourly Rate Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-[#A3B8AC]">
                      <span>Hourly Rate (৳)</span>
                      <strong className="text-[#C8FF5E] text-sm font-bold">৳{calcRate.toLocaleString('en-IN')}</strong>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={5000}
                      step={100}
                      value={calcRate}
                      onChange={(e) => setCalcRate(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full bg-white/10 accent-[#C8FF5E] cursor-pointer"
                    />
                  </div>

                  {/* Booked Hours Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-[#A3B8AC]">
                      <span>Booked Hours / Day</span>
                      <strong className="text-[#C8FF5E] text-sm font-bold">{calcHours} hour{calcHours > 1 ? 's' : ''}</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={calcHours}
                      onChange={(e) => setCalcHours(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full bg-white/10 accent-[#C8FF5E] cursor-pointer"
                    />
                  </div>

                  {/* Operating Days Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-medium text-[#A3B8AC]">
                      <span>Operating Days / Week</span>
                      <strong className="text-[#C8FF5E] text-sm font-bold">{calcDays} day{calcDays > 1 ? 's' : ''}</strong>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={7}
                      step={1}
                      value={calcDays}
                      onChange={(e) => setCalcDays(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full bg-white/10 accent-[#C8FF5E] cursor-pointer"
                    />
                  </div>

                  {/* Simulator Result Box */}
                  <div className="mt-2 bg-gradient-to-br from-[#C8FF5E]/[0.12] to-[#C8FF5E]/[0.05] border border-[#C8FF5E]/25 rounded-2xl p-5 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-[#A3B8AC]">
                      <Coins className="w-3.5 h-3.5 text-[#C8FF5E]" />
                      <span>Estimated Monthly Revenue</span>
                    </div>
                    <div className="font-playfair text-3xl sm:text-4xl font-black text-[#C8FF5E] tracking-tight">
                      ৳{Math.round(calcRate * calcHours * calcDays * 4.33).toLocaleString('en-IN')}
                    </div>
                    <p className="text-[11px] text-[#A3B8AC]/80 leading-relaxed max-w-xs mx-auto">
                      Before platform commission. Actual earnings depend on bookings and occupancy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. TESTIMONIALS                                                           */}
      {/* ========================================================================= */}
      <section id="testimonials" className="py-20 bg-[#F8FAF9] border-y border-[#E2E8E5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-[#6db31e] bg-[#C8FF5E]/15 px-4 py-1.5 rounded-full">
              Testimonials
            </span>
            <h2 className="font-playfair text-3xl sm:text-5xl font-extrabold text-[#0A1E14]">
              What Players Say
            </h2>
            <p className="text-sm sm:text-base text-[#5A6A60] leading-relaxed">
              Real feedback from real players who found their perfect turf.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
            {/* Testimonial 1 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex text-[#FFD700] gap-1 text-sm">
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <blockquote className="text-sm text-[#3A4A40] italic leading-relaxed">
                  "TurfySlot made it so easy to book a turf for our weekly matches. No more calling around — just a few taps and we're confirmed!"
                </blockquote>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-11 h-11 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-bold text-sm flex items-center justify-center">
                  RA
                </div>
                <div>
                  <h5 className="text-sm font-bold text-[#1A2E24]">Rafiq Ahmed</h5>
                  <span className="text-xs text-[#7A8A80]">Football Player, 5+ bookings</span>
                </div>
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex text-[#FFD700] gap-1 text-sm">
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <blockquote className="text-sm text-[#3A4A40] italic leading-relaxed">
                  "As a turf owner, managing bookings has never been easier. The platform is intuitive and my players love the digital pass feature."
                </blockquote>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-11 h-11 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-bold text-sm flex items-center justify-center">
                  MH
                </div>
                <div>
                  <h5 className="text-sm font-bold text-[#1A2E24]">Minhaz Hossain</h5>
                  <span className="text-xs text-[#7A8A80]">Turf Owner, Green Arena</span>
                </div>
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-[#FFFFFF] p-8 rounded-2xl border border-[#E2E8E5] shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex text-[#FFD700] gap-1 text-sm">
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <blockquote className="text-sm text-[#3A4A40] italic leading-relaxed">
                  "I love how I can see real-time availability. No more wasted trips to the turf. Absolutely game-changing for our community."
                </blockquote>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="w-11 h-11 rounded-full bg-[#0A1E14] text-[#C8FF5E] font-bold text-sm flex items-center justify-center">
                  SN
                </div>
                <div>
                  <h5 className="text-sm font-bold text-[#1A2E24]">Sabrina Nahar</h5>
                  <span className="text-xs text-[#7A8A80]">Futsal Enthusiast</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. CTA SECTION - FULL WIDTH WITH BACKGROUND IMAGE                         */}
      {/* ========================================================================= */}
      <section id="cta-section" className="relative w-full overflow-hidden pt-28 pb-32 sm:pt-36 sm:pb-40 text-white">
        {/* Full-width Background Image */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={completeTeamActionImg}
            alt="Turf Stadium Action Background"
            className="w-full h-full object-cover object-center"
          />
          {/* Clean balanced overlay so the photo is clearly visible while keeping text legible */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A1E14]/40 via-black/45 to-[#0A1E14]/65" />
          <div className="absolute inset-0 bg-[#0A1E14]/20" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-7">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0A1E14]/85 backdrop-blur-md border border-[#C8FF5E]/30 text-[#C8FF5E] text-xs sm:text-sm font-semibold tracking-wide shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C8FF5E] animate-pulse" />
            <span>Instant Slot Reservation • Guaranteed 10-Minute Hold</span>
          </div>

          <h2 className="font-playfair text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight drop-shadow-xl">
            Your Next Match Is Just a Few Clicks Away
          </h2>

          <p className="text-base sm:text-lg lg:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed drop-shadow-md">
            Stop calling multiple venues to find a free slot. Search, compare and book your turf online with a guaranteed payment hold.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              id="cta-find-turf-btn"
              onClick={() => {
                const el = document.getElementById('turfs');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto px-10 py-4.5 rounded-full bg-[#C8FF5E] hover:bg-[#A8E63E] text-[#0A1E14] font-extrabold text-base sm:text-lg transition-all shadow-2xl hover:scale-105 inline-flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Find a Turf Now</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="inline-flex items-center gap-2 px-6 py-4 rounded-full bg-[#0A1E14]/80 backdrop-blur-md border border-white/20 text-white text-xs sm:text-sm font-semibold shadow-lg">
              <ShieldCheck className="w-4 h-4 text-[#C8FF5E]" />
              <span>100% Verified Bangladesh Venues</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 10. FOOTER                                                                */}
      {/* ========================================================================= */}
      <footer className="bg-[#050D08] text-white pt-16 pb-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-white/10">
            {/* Brand */}
            <div className="space-y-4 md:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-[#C8FF5E] flex items-center justify-center text-[#0A1E14] font-black text-base">
                  ⚽
                </span>
                <span className="font-playfair text-2xl font-black tracking-tight text-white">
                  Turfy<span className="text-[#C8FF5E]">Slot</span>
                </span>
              </div>
              <p className="text-xs text-[#7A8A80] leading-relaxed">
                Smart turf booking and management platform for players, turf owners and sports communities across Bangladesh.
              </p>
            </div>

            {/* Platform */}
            <div className="space-y-3">
              <h5 className="text-sm font-bold text-white tracking-wider">Platform</h5>
              <ul className="space-y-2 text-xs text-[#7A8A80]">
                <li><a href="#turfs" className="hover:text-[#C8FF5E] transition-colors">Find Turf</a></li>
                <li><a href="#features" className="hover:text-[#C8FF5E] transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-[#C8FF5E] transition-colors">How It Works</a></li>
                <li><button onClick={() => setActiveTab('my_bookings')} className="hover:text-[#C8FF5E] transition-colors text-left cursor-pointer">My Bookings</button></li>
              </ul>
            </div>

            {/* For Owners */}
            <div className="space-y-3">
              <h5 className="text-sm font-bold text-white tracking-wider">For Owners</h5>
              <ul className="space-y-2 text-xs text-[#7A8A80]">
                <li><button onClick={() => switchRoleDirectly('turf_owner')} className="hover:text-[#C8FF5E] transition-colors text-left cursor-pointer">Owner Portal</button></li>
                <li><button onClick={() => switchRoleDirectly('staff')} className="hover:text-[#C8FF5E] transition-colors text-left cursor-pointer">Staff Counter POS</button></li>
                <li><button onClick={() => switchRoleDirectly('admin')} className="hover:text-[#C8FF5E] transition-colors text-left cursor-pointer">System Admin</button></li>
                <li><span className="text-white/40">Zero POS Gateway Fees</span></li>
              </ul>
            </div>

            {/* Support */}
            <div className="space-y-3">
              <h5 className="text-sm font-bold text-white tracking-wider">Support</h5>
              <ul className="space-y-2 text-xs text-[#7A8A80]">
                <li><a href="/help-center" className="text-white/60 hover:text-[#C8FF5E]">Help Center &amp; FAQs</a></li>
                <li><a href={`mailto:${supportSettings.email}`} className="text-white/60 hover:text-[#C8FF5E]">{supportSettings.email}</a></li>
                <li className="flex flex-col items-start gap-1">
                  {[supportSettings.phoneOne, supportSettings.phoneTwo].map((phone) => (
                    <a key={phone} href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="text-white/60 hover:text-[#C8FF5E]">{phone}</a>
                  ))}
                </li>
                <li><span className="text-white/60">{supportSettings.address}</span></li>
                {supportSettingsError && <li role="status" className="text-[10px] text-amber-300">{supportSettingsError}</li>}
              </ul>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5A6A60]">
            <p>&copy; 2026 TurfySlot. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="/terms-of-service" className="hover:text-white">Terms of Service</a>
              <a href="/privacy-policy" className="hover:text-white">Privacy Policy</a>
              <a href="/refund-policy" className="hover:text-white">Refund Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
