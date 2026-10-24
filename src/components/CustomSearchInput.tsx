"use client"

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  searchPlaces,
  searchLocalPlaces,
  SearchResultPlace,
  KIMBERLEY_POPULAR_PLACES,
  parseHouseNumberFromQuery,
  reverseGeocode,
} from '@/utils/mapService'
import { calculateDistanceKm } from '@/utils/geo'
import {
  MapPin,
  Building2,
  Home,
  X,
  Sparkles,
  Plane,
  ShoppingBag,
  GraduationCap,
  HeartPulse,
  ArrowLeft,
  Search,
  LocateFixed,
  ChevronRight,
  ArrowUpRight,
  Car,
  Clock,
  Trash2,
  Map as MapIcon,
  Trees,
} from 'lucide-react'

type CategoryFilter = 'all' | 'malls' | 'hospitals' | 'schools' | 'parks' | 'transport' | 'streets' | 'suburbs';

const RECENT_SEARCHES_KEY = 'solo_recent_searches_v2';

function highlightMatch(text: string, query: string) {
  if (!query || query.trim().length === 0) return <span>{text}</span>;
  const qClean = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(qClean);
  if (idx === -1) {
    const firstToken = qClean.split(/[\s,]+/)[0];
    if (firstToken && firstToken.length >= 2) {
      const tokenIdx = lower.indexOf(firstToken);
      if (tokenIdx !== -1) {
        return (
          <span>
            {text.slice(0, tokenIdx)}
            <span className="font-extrabold text-blue-600 dark:text-blue-400 underline decoration-blue-400/40">
              {text.slice(tokenIdx, tokenIdx + firstToken.length)}
            </span>
            {text.slice(tokenIdx + firstToken.length)}
          </span>
        );
      }
    }
    return <span>{text}</span>;
  }
  return (
    <span>
      {text.slice(0, idx)}
      <span className="font-extrabold text-blue-600 dark:text-blue-400 underline decoration-blue-400/40">
        {text.slice(idx, idx + qClean.length)}
      </span>
      {text.slice(idx + qClean.length)}
    </span>
  );
}

function getStoredRecentSearches(): SearchResultPlace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredRecentSearch(place: SearchResultPlace) {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredRecentSearches();
    const filtered = current.filter(
      (p) =>
        p.id !== place.id &&
        p.name.toLowerCase() !== place.name.toLowerCase() &&
        Math.abs(p.lat - place.lat) > 0.0005
    );
    const updated = [place, ...filtered].slice(0, 6);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage quota errors
  }
}

function clearStoredRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore errors
  }
}

function parseCoordinatesOrGoogleUrl(input: string): { lat: number; lng: number } | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  // 1. Google Maps URL with @lat,lng
  const atMatch = trimmed.match(/@([-+]?\d{1,2}\.\d+),([-+]?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 2. Google Maps URL with ?q=lat,lng or query=lat,lng
  const qParamMatch = trimmed.match(/[?&](?:q|query|ll)=([-+]?\d{1,2}\.\d+)[,+]([-+]?\d{1,3}\.\d+)/);
  if (qParamMatch) {
    const lat = parseFloat(qParamMatch[1]);
    const lng = parseFloat(qParamMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 3. Direct decimal coordinates (e.g. -28.7415, 24.7670)
  const coordMatch = trimmed.match(/^([-+]?\d{1,2}\.\d+)[,\s]+([-+]?\d{1,3}\.\d+)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

interface CustomSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: SearchResultPlace) => void;
  placeholder: string;
  label?: string;
  proximityCoords?: { lat: number; lng: number } | null;
  hasRightAction?: boolean;
  onGetCurrentLocation?: () => void;
  onSelectOnMap?: () => void;
}

export default function CustomSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
  label,
  proximityCoords,
  hasRightAction = false,
  onGetCurrentLocation,
  onSelectOnMap,
}: CustomSearchInputProps) {
  const [results, setResults] = useState<SearchResultPlace[]>([])
  const [recentSearches, setRecentSearches] = useState<SearchResultPlace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [hasSearched, setHasSearched] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')

  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const suppressNextSearchRef = useRef(false)
  const isUserTypingRef = useRef(false)

  // Track mobile viewport (<768px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getStoredRecentSearches())
  }, [])

  // Auto-focus mobile input when modal opens
  useEffect(() => {
    if (isMobileModalOpen) {
      const timer = setTimeout(() => {
        mobileInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isMobileModalOpen])

  // Parse house number & street remainder from currently typed input
  const { houseNumber: currentHouseNo, remainder: currentRemainder } = parseHouseNumberFromQuery(value || '')
  const pastedGoogleCoords = useMemo(() => parseCoordinatesOrGoogleUrl(value || ''), [value])

  // 1. Instant, zero-latency local search & category filtering (0ms response as user types)
  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    const instantLocal = searchLocalPlaces(value, proximityCoords, activeCategory)
    setResults(instantLocal)
    setHasSearched(Boolean(value && value.trim().length > 0))

    if (!value || value.trim().length < 2) {
      setIsLoading(false)
      return
    }

    // 2. Debounced multi-provider geocoding (Google Places, Mapbox & Nominatim) to enrich results
    setIsLoading(true)
    const delayDebounceFn = setTimeout(async () => {
      try {
        const remotePlaces = await searchPlaces(value, proximityCoords)
        if (remotePlaces && remotePlaces.length > 0) {
          const filtered = activeCategory === 'all'
            ? remotePlaces
            : remotePlaces.filter((p) => {
                const pName = p.name.toLowerCase()
                if (activeCategory === 'streets') return p.category === 'address'
                if (activeCategory === 'malls') {
                  return (
                    p.category === 'building' &&
                    (pName.includes('mall') ||
                      pName.includes('shop') ||
                      pName.includes('centre') ||
                      pName.includes('center') ||
                      pName.includes('spar') ||
                      pName.includes('checkers'))
                  )
                }
                if (activeCategory === 'hospitals') {
                  return pName.includes('hospital') || pName.includes('clinic') || pName.includes('mediclinic')
                }
                if (activeCategory === 'schools') {
                  return (
                    pName.includes('school') ||
                    pName.includes('skool') ||
                    pName.includes('college') ||
                    pName.includes('high') ||
                    pName.includes('primary') ||
                    pName.includes('university') ||
                    pName.includes('spu')
                  )
                }
                if (activeCategory === 'parks') {
                  return (
                    pName.includes('park') ||
                    pName.includes('stadium') ||
                    pName.includes('ground') ||
                    pName.includes('field') ||
                    pName.includes('oval')
                  )
                }
                if (activeCategory === 'transport') {
                  return (
                    p.category === 'poi' ||
                    pName.includes('taxi') ||
                    pName.includes('airport') ||
                    pName.includes('station')
                  )
                }
                if (activeCategory === 'suburbs') return p.category === 'area'
                return true
              })
          setResults(filtered.length > 0 ? filtered : remotePlaces)
        }
      } catch (err) {
        console.warn('Geocoding search notice:', err)
      } finally {
        setIsLoading(false)
      }
    }, 150)

    return () => clearTimeout(delayDebounceFn)
  }, [value, proximityCoords?.lat, proximityCoords?.lng, activeCategory])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  const handleSelect = (place: SearchResultPlace) => {
    isUserTypingRef.current = false
    suppressNextSearchRef.current = true
    saveStoredRecentSearch(place)
    setRecentSearches(getStoredRecentSearches())
    onSelect(place)
    setIsOpen(false)
    setIsMobileModalOpen(false)
    setActiveIndex(-1)
  }

  const handleClearHistory = () => {
    clearStoredRecentSearches()
    setRecentSearches([])
  }

  // Autofill text into the input so the user can easily append house numbers or edit
  const handleAutofill = (text: string) => {
    isUserTypingRef.current = true
    onChange(text)
    const instant = searchLocalPlaces(text, proximityCoords, activeCategory)
    setResults(instant)
    if (!isMobile) {
      setIsOpen(true)
    }
  }

  // Top candidate for smart 1-tap autofill
  const topMatch = useMemo(() => {
    if (!value || value.trim().length < 1 || results.length === 0) return null
    const first = results[0]
    if (first.name.toLowerCase().trim() === value.toLowerCase().trim()) return null
    return first
  }, [value, results])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab key auto-fills top suggested match
    if (e.key === 'Tab' && topMatch) {
      e.preventDefault()
      handleAutofill(topMatch.name)
      return
    }

    const list = results
    if (!isOpen || list.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < list.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : list.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && list[activeIndex]) {
        handleSelect(list[activeIndex])
      } else if (topMatch) {
        handleAutofill(topMatch.name)
      } else {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  const getCategoryIcon = (place: SearchResultPlace) => {
    const text = `${place.name} ${place.buildingName || ''} ${place.display_name}`.toLowerCase()
    if (
      text.includes('park') ||
      text.includes('stadium') ||
      text.includes('oval') ||
      text.includes('field') ||
      text.includes('ground') ||
      text.includes('garden') ||
      text.includes('pool')
    ) {
      return <Trees size={16} className="text-emerald-600 dark:text-emerald-400" />
    }
    if (text.includes('airport') || text.includes('aerodrome')) {
      return <Plane size={16} className="text-sky-600 dark:text-sky-400" />
    }
    if (
      text.includes('mall') ||
      text.includes('shopping') ||
      text.includes('centre') ||
      text.includes('center') ||
      text.includes('spar') ||
      text.includes('shoprite') ||
      text.includes('checkers') ||
      text.includes('food')
    ) {
      return <ShoppingBag size={16} className="text-amber-600 dark:text-amber-400" />
    }
    if (
      text.includes('hospital') ||
      text.includes('clinic') ||
      text.includes('mediclinic') ||
      text.includes('doctor')
    ) {
      return <HeartPulse size={16} className="text-rose-600 dark:text-rose-400" />
    }
    if (
      text.includes('university') ||
      text.includes('spu') ||
      text.includes('college') ||
      text.includes('school') ||
      text.includes('high') ||
      text.includes('primary')
    ) {
      return <GraduationCap size={16} className="text-indigo-600 dark:text-indigo-400" />
    }
    if (text.includes('taxi') || text.includes('rank') || text.includes('station')) {
      return <Car size={16} className="text-orange-600 dark:text-orange-400" />
    }
    if (place.category === 'building' || place.buildingName) {
      return <Building2 size={16} className="text-blue-600 dark:text-blue-400" />
    }
    if (place.houseNumber || place.category === 'address') {
      return <Home size={16} className="text-teal-600 dark:text-teal-400" />
    }
    return <MapPin size={16} className="text-gray-500 dark:text-gray-400" />
  }

  // Category filter tabs data
  const CATEGORIES: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: 'All Places' },
    { id: 'malls', label: '🛍️ Malls & Shops' },
    { id: 'hospitals', label: '🏥 Hospitals' },
    { id: 'schools', label: '🎓 Schools & Uni' },
    { id: 'parks', label: '🌳 Parks & Sports' },
    { id: 'transport', label: '🚖 Transport' },
    { id: 'streets', label: '📍 Streets & Erfs' },
    { id: 'suburbs', label: '🏘️ Suburbs' },
  ]

  // Detect whether current query looks like a street without a house number
  const isStreetWithoutNumber = useMemo(() => {
    if (!value || currentHouseNo) return false
    const qLower = value.toLowerCase().trim()
    return KIMBERLEY_POPULAR_PLACES.some(
      (p) => p.category === 'address' && (p.name.toLowerCase().includes(qLower) || qLower.includes(p.name.toLowerCase()))
    )
  }, [value, currentHouseNo])

  // Popular Kimberley shortcut destinations
  const popularHubs = useMemo(() => [
    { name: 'Diamond Pavilion Mall', query: 'Diamond Pavilion Mall' },
    { name: 'Sol Plaatje University', query: 'Sol Plaatje University' },
    { name: 'Robert Sobukwe Hospital', query: 'Robert Sobukwe Hospital' },
    { name: 'Kimberley Airport', query: 'Kimberley Airport' },
    { name: 'North Cape Mall', query: 'North Cape Mall' },
  ], [])

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onClick={() => {
            setIsOpen(true)
          }}
          onChange={(e) => {
            isUserTypingRef.current = true
            onChange(e.target.value)
            setIsOpen(true)
            const instant = searchLocalPlaces(e.target.value, proximityCoords, activeCategory)
            setResults(instant)
          }}
          onFocus={() => {
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          placeholder={placeholder}
          className={`w-full p-3 md:p-4 bg-transparent outline-none font-medium text-base sm:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${
            hasRightAction ? 'pr-20' : 'pr-10'
          }`}
        />
        {isLoading ? (
          <div className={`absolute ${hasRightAction ? 'right-12' : 'right-4'} top-1/2 -translate-y-1/2 pointer-events-none`}>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              isUserTypingRef.current = false
              onChange('')
              const defaultList = searchLocalPlaces('', proximityCoords, activeCategory)
              setResults(defaultList)
              setActiveIndex(-1)
            }}
            className={`absolute ${
              hasRightAction ? 'right-12' : 'right-3.5'
            } top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full transition`}
            title="Clear address"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {/* Instant Suggestions Dropdown (Desktop & Mobile Unified) */}
      {isOpen && (
        <div
          ref={listRef}
          className="flex absolute top-full mt-1.5 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[60vh] sm:max-h-[460px] flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Quick Actions Header: Current Location & Choose on Map */}
          {(!value || value.trim().length === 0) && (
            <div className="p-2.5 bg-gray-50/90 dark:bg-zinc-800/80 border-b border-gray-200/80 dark:border-zinc-800 flex items-center gap-2 shrink-0">
              {onGetCurrentLocation && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onGetCurrentLocation()
                    setIsOpen(false)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 text-xs font-bold transition border border-blue-200/60 dark:border-blue-800/50"
                >
                  <LocateFixed size={14} className="shrink-0" />
                  <span>Use Current GPS</span>
                </button>
              )}
              {onSelectOnMap && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectOnMap()
                    setIsOpen(false)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 text-xs font-bold transition border border-emerald-200/60 dark:border-emerald-800/50"
                >
                  <MapIcon size={14} className="shrink-0" />
                  <span>Choose on Map</span>
                </button>
              )}
            </div>
          )}

          {/* Category Tabs Header */}
          <div className="px-3 py-2 bg-gray-50/60 dark:bg-zinc-800/50 border-b border-gray-200/70 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={`desk-cat-${cat.id}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    activeCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200/60 dark:border-zinc-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-1.5 py-0.5 rounded shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Recent Searches Section (when input is empty) */}
          {(!value || value.trim().length === 0) && recentSearches.length > 0 && (
            <div className="border-b border-gray-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shrink-0">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Clock size={12} className="text-blue-500" /> Recent Locations
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClearHistory}
                  className="text-gray-400 hover:text-red-500 text-[10px] font-semibold lowercase flex items-center gap-1"
                >
                  <Trash2 size={10} /> clear
                </button>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-zinc-800/40">
                {recentSearches.map((item, idx) => (
                  <div
                    key={`desk-recent-${item.id}-${idx}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(item)}
                    className="px-3.5 py-2 cursor-pointer flex items-center justify-between hover:bg-blue-50/50 dark:hover:bg-zinc-800/60 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{item.display_name}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-blue-600 font-bold shrink-0">Select</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Popular Hubs Quick Pill Row */}
          {(!value || value.trim().length === 0) && (
            <div className="px-3 py-1.5 bg-gray-50/40 dark:bg-zinc-900/50 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Popular:</span>
              {popularHubs.map((hub) => (
                <button
                  key={`desk-hub-${hub.name}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAutofill(hub.query)}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-zinc-800 border border-gray-200/70 dark:border-zinc-700 hover:bg-blue-50 hover:text-blue-600 text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0 transition"
                >
                  {hub.name}
                </button>
              ))}
            </div>
          )}

          {/* Detected Google Maps Pin or GPS Coordinates (Desktop) */}
          {pastedGoogleCoords && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              onClick={async () => {
                let resolved = `${pastedGoogleCoords.lat.toFixed(4)}, ${pastedGoogleCoords.lng.toFixed(4)}`;
                try {
                  const addr = await reverseGeocode(pastedGoogleCoords.lat, pastedGoogleCoords.lng);
                  if (addr) resolved = addr;
                } catch {}
                handleSelect({
                  id: `google-paste-${Date.now()}`,
                  name: `Google Maps Pin (${pastedGoogleCoords.lat.toFixed(4)}, ${pastedGoogleCoords.lng.toFixed(4)})`,
                  display_name: resolved,
                  lat: pastedGoogleCoords.lat,
                  lon: pastedGoogleCoords.lng,
                  category: 'poi',
                });
              }}
              className="p-3 m-2 bg-gradient-to-r from-red-500/10 to-amber-500/10 border border-red-500/30 rounded-xl flex items-center justify-between cursor-pointer hover:bg-red-500/20 transition shrink-0"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <MapPin size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Use Pinned Google Maps Location</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                    {pastedGoogleCoords.lat.toFixed(5)}, {pastedGoogleCoords.lng.toFixed(5)}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">Select Pin →</span>
            </div>
          )}

          {/* Smart Auto-fill Banner as user types */}
          {topMatch && (
            <div className="px-3.5 py-2 bg-blue-50/90 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/50 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={14} className="text-blue-600 shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  Auto-fill: <strong className="text-blue-700 dark:text-blue-300 font-bold">{topMatch.name}</strong>
                </span>
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAutofill(topMatch.name)}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shrink-0 active:scale-95 transition"
              >
                Auto-fill ⇥
              </button>
            </div>
          )}

          {/* Quick House Number Chips (e.g. user typed "Memorial Road") */}
          {isStreetWithoutNumber && (
            <div className="px-3 py-1.5 bg-gray-50/80 dark:bg-zinc-900/60 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
                Add House #:
              </span>
              {['1', '5', '10', '12', '14', '20', '25', '50'].map((num) => (
                <button
                  key={`desk-num-${num}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAutofill(`${num} ${value.trim()}`)}
                  className="px-2 py-0.5 rounded-md text-xs font-semibold bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-blue-50 text-gray-800 dark:text-gray-200 shrink-0"
                >
                  #{num}
                </button>
              ))}
            </div>
          )}

          {/* Options Results Scroll Container */}
          <div className="overflow-y-auto overscroll-contain flex-1 divide-y divide-gray-100 dark:divide-zinc-800/60 custom-scrollbar">
            {results.length > 0 ? (
              results.map((place, index) => {
                const isSelected = index === activeIndex
                const subLabel = [place.street, place.suburb, place.city].filter(Boolean).join(', ')
                const distKm = proximityCoords
                  ? calculateDistanceKm(proximityCoords.lat, proximityCoords.lng, place.lat, place.lon)
                  : calculateDistanceKm(-28.7282, 24.7623, place.lat, place.lon)
                const distLabel = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`

                return (
                  <div
                    key={`desk-${place.id}-${index}`}
                    ref={(el) => {
                      itemRefs.current[index] = el
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(place)}
                    className={`p-3 md:p-3.5 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-blue-50/60 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 shadow-2xs">
                        {getCategoryIcon(place)}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 leading-snug">
                            {highlightMatch(place.name, value)}
                          </span>
                          {place.houseNumber && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                              #{place.houseNumber}
                            </span>
                          )}
                          {place.category === 'address' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                              Street Address
                            </span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded ml-auto">
                            {distLabel}
                          </span>
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-1 leading-relaxed">
                          {place.display_name || subLabel}
                        </span>
                      </div>
                    </div>

                    {/* Quick Autofill Arrow Button */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAutofill(place.name)
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100/60 dark:hover:bg-zinc-700 transition shrink-0"
                      title={`Autofill "${place.name}"`}
                      aria-label="Autofill this location"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                )
              })
            ) : hasSearched && !isLoading ? (
              <div className="p-5 text-center flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                {currentHouseNo && currentRemainder && currentRemainder.trim().length >= 2 ? (
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      handleSelect({
                        id: `custom-house-${Date.now()}`,
                        name: `${currentHouseNo} ${currentRemainder.trim()}`,
                        display_name: `${currentHouseNo} ${currentRemainder.trim()}, Kimberley, Northern Cape, South Africa`,
                        lat: proximityCoords?.lat || -28.7282,
                        lon: proximityCoords?.lng || 24.7623,
                        houseNumber: currentHouseNo,
                        street: currentRemainder.trim(),
                        city: 'Kimberley',
                        category: 'address',
                      })
                    }
                    className="w-full text-left p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/60 hover:bg-blue-100/70 transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-500 text-white shrink-0">
                        <Home size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-blue-900 dark:text-blue-100">
                          Use &ldquo;{currentHouseNo} {currentRemainder.trim()}&rdquo;
                        </p>
                        <p className="text-[11px] text-blue-700 dark:text-blue-300">
                          Direct pin for House #{currentHouseNo}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Select →</span>
                  </div>
                ) : (
                  <>
                    <MapPin size={24} className="text-gray-300 dark:text-gray-600 mb-1" />
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      No matching location found
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-xs">
                      Try searching with a house number and street (e.g. &ldquo;14 Memorial Road&rdquo; or &ldquo;12 Carrington Road&rdquo;).
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Dedicated Full-Screen Mobile Search Overlay */}
      {isMobileModalOpen && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col md:hidden animate-in fade-in duration-150">
          {/* Mobile Top Navigation Bar */}
          <div className="pt-safe px-4 py-3 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shrink-0">
            <button
              type="button"
              onClick={() => setIsMobileModalOpen(false)}
              className="p-2 -ml-2 rounded-full text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-zinc-800 transition"
              aria-label="Back to map"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {label || (hasRightAction ? 'Pickup Location' : 'Destination / Dropoff')}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {currentHouseNo
                  ? `Enter street name for House #${currentHouseNo}`
                  : 'Enter house number, street name, or building'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileModalOpen(false)}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg active:bg-blue-50 dark:active:bg-blue-950/50"
            >
              Done
            </button>
          </div>

          {/* Mobile Search Input Header */}
          <div className="p-3.5 border-b border-gray-100 dark:border-zinc-800/80 bg-gray-50/70 dark:bg-zinc-900/50 space-y-2.5 shrink-0">
            <div className="relative flex items-center bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-2xl shadow-sm">
              <Search size={18} className="absolute left-3.5 text-gray-400 shrink-0" />
              <input
                ref={mobileInputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  isUserTypingRef.current = true
                  onChange(e.target.value)
                  const instant = searchLocalPlaces(e.target.value, proximityCoords, activeCategory)
                  setResults(instant)
                  setIsOpen(true)
                }}
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                placeholder={placeholder}
                className="w-full py-3.5 pl-11 pr-10 bg-transparent text-base font-semibold text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
              />
              {isLoading ? (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : value ? (
                <button
                  type="button"
                  onClick={() => {
                    isUserTypingRef.current = false
                    onChange('')
                    const defaultList = searchLocalPlaces('', proximityCoords, activeCategory)
                    setResults(defaultList)
                    setActiveIndex(-1)
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full"
                  title="Clear input"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            {/* Quick Action Buttons on Mobile: Current Location & Set on Map */}
            <div className="grid grid-cols-2 gap-2">
              {onGetCurrentLocation && (
                <button
                  type="button"
                  onClick={() => {
                    onGetCurrentLocation()
                    setIsMobileModalOpen(false)
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/40 active:scale-[0.98] transition text-xs font-bold"
                >
                  <LocateFixed size={15} className="text-blue-600" />
                  <span>Use Current GPS</span>
                </button>
              )}
              {onSelectOnMap && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectOnMap()
                    setIsMobileModalOpen(false)
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40 active:scale-[0.98] transition text-xs font-bold"
                >
                  <MapIcon size={15} className="text-emerald-600" />
                  <span>Choose on Map</span>
                </button>
              )}
            </div>

            {/* Category Filter Horizontal Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={`mob-cat-${cat.id}`}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                    activeCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Detected Google Maps Pin or GPS Coordinates (Mobile) */}
            {pastedGoogleCoords && (
              <div
                onClick={async () => {
                  let resolved = `${pastedGoogleCoords.lat.toFixed(4)}, ${pastedGoogleCoords.lng.toFixed(4)}`;
                  try {
                    const addr = await reverseGeocode(pastedGoogleCoords.lat, pastedGoogleCoords.lng);
                    if (addr) resolved = addr;
                  } catch {}
                  handleSelect({
                    id: `mob-google-paste-${Date.now()}`,
                    name: `Google Maps Pin (${pastedGoogleCoords.lat.toFixed(4)}, ${pastedGoogleCoords.lng.toFixed(4)})`,
                    display_name: resolved,
                    lat: pastedGoogleCoords.lat,
                    lon: pastedGoogleCoords.lng,
                    category: 'poi',
                  });
                }}
                className="p-3 bg-gradient-to-r from-red-500/10 to-amber-500/10 border border-red-500/30 rounded-xl flex items-center justify-between cursor-pointer active:bg-red-500/20 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Use Pinned Google Maps Location</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                      {pastedGoogleCoords.lat.toFixed(5)}, {pastedGoogleCoords.lng.toFixed(5)}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Select Pin →</span>
              </div>
            )}

            {/* Smart 1-Tap Auto-fill Banner on Mobile */}
            {topMatch && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles size={15} className="text-blue-600 shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-200 truncate">
                    Auto-fill: <strong className="text-blue-700 dark:text-blue-300 font-bold">{topMatch.name}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAutofill(topMatch.name)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0 active:scale-95 transition"
                >
                  Auto-fill ⇥
                </button>
              </div>
            )}

            {/* Quick House Number Chips (if street is active) */}
            {isStreetWithoutNumber && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-0.5">
                  Add House #:
                </span>
                {['1', '5', '10', '12', '14', '20', '25', '50'].map((num) => (
                  <button
                    key={`mob-num-${num}`}
                    type="button"
                    onClick={() => handleAutofill(`${num} ${value.trim()}`)}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 active:bg-blue-50"
                  >
                    #{num}
                  </button>
                ))}
              </div>
            )}

            {/* House Number Quick Street Suggestion Chips (when user types e.g. "14") */}
            {currentHouseNo && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-0.5">
                  Quick #{currentHouseNo}:
                </span>
                {['Memorial Rd', 'Carrington Rd', 'Du Toitspan', 'Lennox St', 'Barkly Rd', 'Oliver Rd'].map((st) => (
                  <button
                    key={`mob-chip-${st}`}
                    type="button"
                    onClick={() => handleAutofill(`${currentHouseNo} ${st}`)}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 active:bg-blue-50"
                  >
                    {currentHouseNo} {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Results / Suggestion List */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain pb-safe divide-y divide-gray-100 dark:divide-zinc-800/60 custom-scrollbar"
            style={{ touchAction: 'pan-y' }}
          >
            {/* Recent Searches on Mobile (when empty input) */}
            {(!value || value.trim().length === 0) && recentSearches.length > 0 && (
              <div className="bg-gray-50/50 dark:bg-zinc-900/60 pb-1">
                <div className="px-4 py-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-blue-500" /> Recent Searches
                  </span>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-gray-400 hover:text-red-500 text-[10px] font-semibold lowercase flex items-center gap-1"
                  >
                    <Trash2 size={10} /> clear
                  </button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-zinc-800/60">
                  {recentSearches.map((item, idx) => (
                    <div
                      key={`mob-recent-${item.id}-${idx}`}
                      onClick={() => handleSelect(item)}
                      className="px-4 py-2.5 flex items-center justify-between hover:bg-blue-50 dark:hover:bg-zinc-800/60 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Clock size={14} className="text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{item.display_name}</p>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List Header */}
            <div className="px-4 py-2 bg-gray-50/90 dark:bg-zinc-900/80 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" />
                {!value || value.trim().length === 0
                  ? 'Popular Kimberley Destinations'
                  : currentHouseNo
                  ? `Suggested Addresses for #${currentHouseNo}`
                  : 'Matching Locations'}
              </span>
              <span className="text-[10px] text-gray-400 font-semibold lowercase">
                {results.length} {results.length === 1 ? 'place' : 'options'}
              </span>
            </div>

            {results.length > 0 ? (
              results.map((place, index) => {
                const subLabel = [place.street, place.suburb, place.city].filter(Boolean).join(', ')
                const distKm = proximityCoords
                  ? calculateDistanceKm(proximityCoords.lat, proximityCoords.lng, place.lat, place.lon)
                  : calculateDistanceKm(-28.7282, 24.7623, place.lat, place.lon)
                const distLabel = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`

                return (
                  <div
                    key={`mob-${place.id}-${index}`}
                    onClick={() => handleSelect(place)}
                    className="p-4 flex items-center justify-between gap-3 active:bg-blue-50 dark:active:bg-zinc-800/80 transition cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="p-2.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 shadow-2xs">
                        {getCategoryIcon(place)}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-snug">
                            {highlightMatch(place.name, value)}
                          </span>
                          {place.houseNumber && (
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                              #{place.houseNumber}
                            </span>
                          )}
                          {place.category === 'address' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              Street Address
                            </span>
                          )}
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded ml-auto">
                            {distLabel}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                          {place.display_name || subLabel}
                        </span>
                      </div>
                    </div>

                    {/* Dedicated Autofill Arrow Icon + Selection Chevron */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAutofill(place.name)
                        }}
                        className="p-2.5 rounded-xl text-gray-400 active:text-blue-600 active:bg-blue-100 dark:active:bg-zinc-800 transition"
                        title={`Autofill "${place.name}"`}
                        aria-label="Autofill this location"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                      <ChevronRight size={18} className="text-gray-300 dark:text-gray-600" />
                    </div>
                  </div>
                )
              })
            ) : hasSearched && !isLoading ? (
              <div className="p-6 text-center flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
                {currentHouseNo && currentRemainder && currentRemainder.trim().length >= 2 ? (
                  <div
                    onClick={() => {
                      handleSelect({
                        id: `mob-custom-house-${Date.now()}`,
                        name: `${currentHouseNo} ${currentRemainder.trim()}`,
                        display_name: `${currentHouseNo} ${currentRemainder.trim()}, Kimberley, Northern Cape, South Africa`,
                        lat: proximityCoords?.lat || -28.7282,
                        lon: proximityCoords?.lng || 24.7623,
                        houseNumber: currentHouseNo,
                        street: currentRemainder.trim(),
                        city: 'Kimberley',
                        category: 'address',
                      })
                    }}
                    className="w-full text-left p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 active:bg-blue-100 transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0">
                        <Home size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                          Use &ldquo;{currentHouseNo} {currentRemainder.trim()}&rdquo;
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Direct pin for House #{currentHouseNo} on this street
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Select →</span>
                  </div>
                ) : (
                  <>
                    <MapPin size={28} className="text-gray-300 dark:text-gray-600 mb-1" />
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      No matching location found
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                      Try typing a house number followed by a street name (e.g. &ldquo;14 Memorial Road&rdquo; or &ldquo;12 Carrington Road&rdquo;).
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
