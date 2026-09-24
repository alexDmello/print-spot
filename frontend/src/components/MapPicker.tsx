'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  ExternalLink,
  RotateCw,
  Compass,
} from 'lucide-react';

interface MapPickerProps {
  latitude: number;
  longitude: number;
  address?: string;
  onChange: (coords: { latitude: number; longitude: number; address?: string }) => void;
}

export const MapPicker: React.FC<MapPickerProps> = ({
  latitude,
  longitude,
  address,
  onChange,
}) => {
  const [lat, setLat] = useState<number>(latitude || 28.6912);
  const [lng, setLng] = useState<number>(longitude || 77.2089);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Synchronize internal state when props change
  useEffect(() => {
    if (latitude && longitude) {
      const numLat = parseFloat(Number(latitude).toFixed(6));
      const numLng = parseFloat(Number(longitude).toFixed(6));
      setLat(numLat);
      setLng(numLng);

      if (markerRef.current && leafletMapRef.current) {
        markerRef.current.setLatLng([numLat, numLng]);
        leafletMapRef.current.panTo([numLat, numLng], { animate: true });
      }
    }
  }, [latitude, longitude]);

  // Reverse geocoding helper using Nominatim
  const reverseGeocode = async (latitudeVal: number, longitudeVal: number) => {
    setIsReverseGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitudeVal}&lon=${longitudeVal}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        onChange({
          latitude: latitudeVal,
          longitude: longitudeVal,
          address: data.display_name,
        });
      }
    } catch (err) {
      console.warn('Reverse geocoding error:', err);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // Initialize Interactive Leaflet Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return;

      // Ensure Leaflet CSS is loaded in document head
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const L = (await import('leaflet')).default;

      if (!isMounted || !mapContainerRef.current) return;

      // Clean up previous map if exists
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const initialLat = lat || 28.6912;
      const initialLng = lng || 77.2089;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom vibrant SVG Pin Marker
      const customPinIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
            <div style="width: 36px; height: 36px; border-radius: 50%; background-color: #0e7490; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(14,116,144,0.4); display: flex; align-items: center; justify-content: center; cursor: grab;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: #0e7490; opacity: 0.5; margin-top: -2px;"></div>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 42],
      });

      // Draggable Marker Instance
      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
        icon: customPinIcon,
        title: 'Drag me to adjust shop location',
      }).addTo(map);

      // Listen for marker drag end
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        const newLat = parseFloat(position.lat.toFixed(6));
        const newLng = parseFloat(position.lng.toFixed(6));
        setLat(newLat);
        setLng(newLng);
        onChange({ latitude: newLat, longitude: newLng });
        reverseGeocode(newLat, newLng);
      });

      // Click anywhere on map to move pin
      map.on('click', (e: any) => {
        const newLat = parseFloat(e.latlng.lat.toFixed(6));
        const newLng = parseFloat(e.latlng.lng.toFixed(6));
        marker.setLatLng([newLat, newLng]);
        setLat(newLat);
        setLng(newLng);
        onChange({ latitude: newLat, longitude: newLng });
        reverseGeocode(newLat, newLng);
      });

      leafletMapRef.current = map;
      markerRef.current = marker;

      // Invalidate map size after render to fix any container sizing glitches
      setTimeout(() => {
        if (map) map.invalidateSize();
      }, 300);
    }

    initMap();

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Handle GPS location detection
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const newLat = parseFloat(pos.coords.latitude.toFixed(6));
        const newLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(newLat);
        setLng(newLng);

        if (markerRef.current && leafletMapRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
          leafletMapRef.current.setView([newLat, newLng], 16, { animate: true });
        }

        onChange({ latitude: newLat, longitude: newLng });
        reverseGeocode(newLat, newLng);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('Could not retrieve current location. Please verify GPS permissions.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Search address using OpenStreetMap Nominatim
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=4`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setSearchResults(data);
      } else {
        alert('No locations found matching your query.');
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: any) => {
    const newLat = parseFloat(parseFloat(result.lat).toFixed(6));
    const newLng = parseFloat(parseFloat(result.lon).toFixed(6));
    setLat(newLat);
    setLng(newLng);
    setSearchResults([]);
    setSearchQuery(result.display_name);

    if (markerRef.current && leafletMapRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
      leafletMapRef.current.setView([newLat, newLng], 16, { animate: true });
    }

    onChange({
      latitude: newLat,
      longitude: newLng,
      address: result.display_name,
    });
  };

  const presets = [
    { name: 'Delhi Univ (North)', lat: 28.6912, lng: 77.2089 },
    { name: 'IIT Delhi (South)', lat: 28.545, lng: 77.1926 },
    { name: 'Koramangala Bangalore', lat: 12.9352, lng: 77.6245 },
    { name: 'Powai Mumbai', lat: 19.1176, lng: 72.906 },
  ];

  return (
    <div className="space-y-3.5">
      {/* Search Bar & Auto-Locate */}
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <form onSubmit={handleSearch} className="flex-1 relative w-full">
          <input
            type="text"
            placeholder="Search landmark, street, or university..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-20 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-1.5 top-1.5 px-3 py-1.5 rounded-lg bg-[#0e7490] hover:bg-[#0891b2] text-white text-[11px] font-bold transition-all disabled:opacity-50"
          >
            {isSearching ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : 'Find'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleDetectLocation}
          disabled={isLocating}
          className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 shadow-xs transition-colors"
        >
          {isLocating ? (
            <RotateCw className="w-3.5 h-3.5 text-[#0e7490] animate-spin" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-[#0e7490]" />
          )}
          <span>Use Current GPS</span>
        </button>
      </div>

      {/* Search Results Dropdown */}
      {searchResults.length > 0 && (
        <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-md space-y-1 z-20 relative">
          <span className="text-[10px] font-bold text-slate-400 uppercase px-2 block">
            Suggested Matching Locations
          </span>
          {searchResults.map((res, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectSearchResult(res)}
              className="w-full text-left p-2 rounded-lg hover:bg-slate-50 text-xs text-slate-700 flex items-start gap-2 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0e7490] shrink-0 mt-0.5" />
              <span className="truncate">{res.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Truly Draggable & Placeable Leaflet Map Container */}
      <div className="relative w-full h-72 sm:h-80 rounded-2xl overflow-hidden border-2 border-slate-200 shadow-inner bg-slate-100">
        <div
          ref={mapContainerRef}
          className="w-full h-full z-0"
          style={{ minHeight: '280px' }}
        />

        {/* Top Floating Help Indicator */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
          <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-xs flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#0e7490]" />
            <span>Drag pin or click anywhere to position</span>
            {isReverseGeocoding && (
              <RotateCw className="w-3 h-3 text-[#0e7490] animate-spin ml-1" />
            )}
          </div>

          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto bg-white/95 hover:bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#0e7490] shadow-xs flex items-center gap-1 transition-colors"
          >
            <span>Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Quick Presets for Instant Setup */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Quick Preset Locations:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setLat(p.lat);
                setLng(p.lng);
                if (markerRef.current && leafletMapRef.current) {
                  markerRef.current.setLatLng([p.lat, p.lng]);
                  leafletMapRef.current.setView([p.lat, p.lng], 16, { animate: true });
                }
                onChange({ latitude: p.lat, longitude: p.lng, address: p.name });
              }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                Math.abs(lat - p.lat) < 0.001 && Math.abs(lng - p.lng) < 0.001
                  ? 'bg-[#ecfeff] text-[#0e7490] border-[#a5f3fc]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Numerical Coordinate Fine-Tuning */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase">
            Latitude
          </label>
          <input
            type="number"
            step="0.000001"
            value={lat}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setLat(val);
              if (markerRef.current && leafletMapRef.current) {
                markerRef.current.setLatLng([val, lng]);
                leafletMapRef.current.panTo([val, lng]);
              }
              onChange({ latitude: val, longitude: lng });
            }}
            className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase">
            Longitude
          </label>
          <input
            type="number"
            step="0.000001"
            value={lng}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              setLng(val);
              if (markerRef.current && leafletMapRef.current) {
                markerRef.current.setLatLng([lat, val]);
                leafletMapRef.current.panTo([lat, val]);
              }
              onChange({ latitude: lat, longitude: val });
            }}
            className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
          />
        </div>
      </div>
    </div>
  );
};
