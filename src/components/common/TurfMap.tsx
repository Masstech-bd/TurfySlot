import { useEffect, useRef, useState, type FC, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface TurfMapProps {
  latitude: number;
  longitude: number;
  editable?: boolean;
  onLocationChange?: (latitude: number, longitude: number) => void;
  className?: string;
}

type PlaceResult = { id: string; name: string; longitude: number; latitude: number };

const markerIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:#5b8f16;box-shadow:0 1px 5px #0008"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const TurfMap: FC<TurfMapProps> = ({
  latitude,
  longitude,
  editable = false,
  onLocationChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const [searchQuery, setSearchQuery] = useState('');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current).setView([latitude, longitude], 13);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const marker = L.marker([latitude, longitude], { draggable: editable, icon: markerIcon }).addTo(map);
    mapRef.current = map;
    markerRef.current = marker;
    map.whenReady(() => setMapLoaded(true));
    tiles.on('tileerror', () => setMapError('OpenStreetMap tiles could not be loaded. Check your connection.'));

    if (editable) {
      map.on('click', (event) => {
        marker.setLatLng(event.latlng);
        onLocationChangeRef.current?.(event.latlng.lat, event.latlng.lng);
      });
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        onLocationChangeRef.current?.(position.lat, position.lng);
      });
    }

    return () => {
      map.remove();
      setMapLoaded(false);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [editable]);

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const position: L.LatLngExpression = [latitude, longitude];
    markerRef.current?.setLatLng(position);
    mapRef.current?.setView(position, mapRef.current.getZoom(), { animate: true });
  }, [latitude, longitude]);

  const searchPlaces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 3 || isSearching) return;

    setIsSearching(true);
    setSearchError('');
    setPlaces([]);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', countrycodes: 'bd' }).toString();
      const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!response.ok) throw new Error('Location search failed. Try again.');
      const results = await response.json() as Array<{ place_id: number; display_name: string; lon: string; lat: string }>;
      const matches = results.map((place) => ({
        id: String(place.place_id),
        name: place.display_name,
        longitude: Number(place.lon),
        latitude: Number(place.lat),
      }));
      setPlaces(matches);
      if (!matches.length) setSearchError('No matching places found.');
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Location search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectPlace = (place: PlaceResult) => {
    const position: L.LatLngExpression = [place.latitude, place.longitude];
    markerRef.current?.setLatLng(position);
    mapRef.current?.setView(position, 15, { animate: true });
    onLocationChangeRef.current?.(place.latitude, place.longitude);
    setSearchQuery(place.name);
    setPlaces([]);
  };

  return (
    <div className={`relative w-full ${className}`}>
      {editable && (
        <div className="absolute inset-x-3 top-3 z-10">
          <form onSubmit={(event) => void searchPlaces(event)} className="flex gap-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search for a place or address"
              aria-label="Search for a turf location"
              className="min-w-0 flex-1 px-2 py-1 text-sm text-slate-900 outline-none"
            />
            <button type="submit" disabled={isSearching || searchQuery.trim().length < 3} className="rounded-md bg-[#5b8f16] px-3 py-1 text-xs font-bold text-white disabled:opacity-50">
              {isSearching ? 'Searching' : 'Search'}
            </button>
          </form>
          {places.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {places.map((place) => (
                <li key={place.id}>
                  <button type="button" onClick={() => selectPlace(place)} className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100">
                    {place.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searchError && <p role="status" className="mt-1 rounded bg-white/95 px-2 py-1 text-xs text-red-700">{searchError}</p>}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl" aria-label={editable ? 'Select turf location on map' : 'Turf location map'} />
      {!mapLoaded && !mapError && <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100/90 text-sm text-slate-600">Loading map...</div>}
      {mapError && <div className="absolute inset-x-3 bottom-3 rounded-lg bg-white/95 p-2 text-xs text-red-700 shadow">{mapError}</div>}
    </div>
  );
};
