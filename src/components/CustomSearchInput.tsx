"use client"

import { useState, useEffect, useRef } from 'react'
import {
  searchPlaces,
  SearchResultPlace,
  KIMBERLEY_POPULAR_PLACES,
  parseHouseNumberFromQuery,
} from '@/utils/mapService'
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
} from 'lucide-react'

interface CustomSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: SearchResultPlace) => void;
  placeholder: string;
  label?: string;
  proximityCoords?: { lat: number; lng: number } | null;
  hasRightAction?: boolean;
  onGetCurrentLocation?: () => void;
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
}: CustomSearchInputProps) {
  const [results, setResults] = useState<SearchResultPlace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [hasSearched, setHasSearched] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
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

  // Parse house number & street remainder from currently typed input
  const { houseNumber: currentHouseNo, remainder: currentRemainder } = parseHouseNumberFromQuery(value || '')

  // When value is short/empty, show top Kimberley destinations as quick-picks
  const isQueryShort = !value || value.trim().length < 2
  const activePlacesList = isQueryShort ? KIMBERLEY_POPULAR_PLACES.slice(0, 6) : results

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      setIsOpen(false)
      return
    }

    // Only run debounced network search if the user is actively typing in the input
    if (!isUserTypingRef.current) {
      setIsLoading(false)
      return
    }

    if (!value || value.trim().length < 2) {
      setResults([])
      setIsLoading(false)
      setHasSearched(false)
      setActiveIndex(-1)
      return
    }

    setIsLoading(true)
    const delayDebounceFn = setTimeout(async () => {
      try {
        const places = await searchPlaces(value, proximityCoords)
        setResults(places)
        setHasSearched(true)
        setIsOpen(true)
        setActiveIndex(-1)
      } catch (err) {
        console.error('Commercial geocoding lookup failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 250)

    return () => clearTimeout(delayDebounceFn)
  }, [value, proximityCoords?.lat, proximityCoords?.lng])

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
    onSelect(place)
    setIsOpen(false)
    setIsMobileModalOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const list = activePlacesList
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
      // Only select if user actively highlighted an item from the list
      if (activeIndex >= 0 && list[activeIndex]) {
        handleSelect(list[activeIndex])
      } else {
        // If no item is highlighted, Enter simply closes the suggestions and retains current value
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
    if (text.includes('airport') || text.includes('aerodrome')) {
      return <Plane size={16} />
    }
    if (text.includes('mall') || text.includes('shopping') || text.includes('centre') || text.includes('center')) {
      return <ShoppingBag size={16} />
    }
    if (text.includes('hospital') || text.includes('clinic') || text.includes('mediclinic')) {
      return <HeartPulse size={16} />
    }
    if (text.includes('university') || text.includes('spu') || text.includes('college') || text.includes('school')) {
      return <GraduationCap size={16} />
    }
    if (place.category === 'building' || place.buildingName) {
      return <Building2 size={16} />
    }
    if (place.houseNumber) {
      return <Home size={16} />
    }
    return <MapPin size={16} />
  }

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onClick={() => {
            if (isMobile) {
              setIsMobileModalOpen(true)
            }
          }}
          onChange={(e) => {
            isUserTypingRef.current = true
            onChange(e.target.value)
            if (isMobile) {
              setIsMobileModalOpen(true)
            } else {
              setIsOpen(true)
            }
          }}
          onFocus={() => {
            if (isMobile) {
              setIsMobileModalOpen(true)
            } else {
              setIsOpen(true)
            }
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
              setResults([])
              setActiveIndex(-1)
              setIsOpen(false)
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

      {/* Desktop Suggestions Dropdown (md+ screens) */}
      {isOpen && !isMobile && (
        <div
          ref={listRef}
          className="hidden md:flex absolute top-full mt-1.5 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto overscroll-contain custom-scrollbar flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50/90 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 z-10">
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-500" />
              {isQueryShort
                ? 'Popular Destinations'
                : currentHouseNo
                ? `Suggested Addresses for #${currentHouseNo}`
                : 'Matching Locations'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-zinc-700"
            >
              Done ✕
            </button>
          </div>

          {activePlacesList.length > 0 ? (
            activePlacesList.map((place, index) => {
              const isSelected = index === activeIndex
              const subLabel = [place.street, place.suburb, place.city]
                .filter(Boolean)
                .join(', ')

              return (
                <div
                  key={place.id}
                  ref={(el) => {
                    itemRefs.current[index] = el
                  }}
                  className={`p-3 md:p-3.5 cursor-pointer border-b border-gray-100 dark:border-zinc-800/60 last:border-0 flex items-start gap-2.5 md:gap-3 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-blue-50/60 dark:hover:bg-zinc-800/70 active:bg-blue-100/60 dark:active:bg-zinc-800'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelect(place);
                  }}
                  onClick={() => handleSelect(place)}
                >
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                    {getCategoryIcon(place)}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 leading-snug">
                        {place.name}
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
                      {place.buildingName && !place.houseNumber && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                          POI
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                      {place.display_name || subLabel}
                    </span>
                  </div>
                </div>
              )
            })
          ) : hasSearched && !isLoading ? (
            <div className="p-4 text-center flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
              {currentHouseNo && currentRemainder && currentRemainder.trim().length >= 2 ? (
                <div
                  className="w-full text-left p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/60 hover:bg-blue-100/70 transition cursor-pointer flex items-center justify-between"
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
                        Direct custom pin for House #{currentHouseNo}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Select →</span>
                </div>
              ) : (
                <>
                  <MapPin size={22} className="text-gray-300 dark:text-gray-600 mb-1" />
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
      )}

      {/* Dedicated Full-Screen Mobile Search Overlay (only active on mobile when user taps search) */}
      {isMobileModalOpen && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col md:hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Mobile Top Navigation Bar */}
          <div className="pt-safe px-4 py-3 border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setIsMobileModalOpen(false)}
              className="p-2 -ml-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
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
              className="text-xs font-bold text-blue-600 dark:text-blue-400 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/50"
            >
              Done
            </button>
          </div>

          {/* Mobile Search Input Header */}
          <div className="p-3.5 border-b border-gray-100 dark:border-zinc-800/80 bg-gray-50/70 dark:bg-zinc-900/50 space-y-2.5">
            <div className="relative flex items-center bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-2xl shadow-sm">
              <Search size={18} className="absolute left-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={value}
                onChange={(e) => {
                  isUserTypingRef.current = true;
                  onChange(e.target.value);
                  setIsOpen(true);
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
                    isUserTypingRef.current = false;
                    onChange('');
                    setResults([]);
                    setActiveIndex(-1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>

            {/* Quick Action: Use Current Location (GPS) button */}
            {onGetCurrentLocation && (
              <button
                type="button"
                onClick={() => {
                  onGetCurrentLocation();
                  setIsMobileModalOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 active:scale-[0.99] transition"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-600 text-white">
                    <LocateFixed size={15} />
                  </div>
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-100">
                    Use Current GPS Location
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Locate Me →</span>
              </button>
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
                    onClick={() => {
                      isUserTypingRef.current = true;
                      onChange(`${currentHouseNo} ${st}`);
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-200 active:bg-blue-50"
                  >
                    {currentHouseNo} {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Results / Suggestion List */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-safe divide-y divide-gray-100 dark:divide-zinc-800/60 custom-scrollbar">
            {/* List Header */}
            <div className="px-4 py-2 bg-gray-50/80 dark:bg-zinc-900/60 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" />
                {isQueryShort
                  ? 'Popular Kimberley Destinations'
                  : currentHouseNo
                  ? `Suggested Addresses for #${currentHouseNo}`
                  : 'Matching Locations'}
              </span>
              <span className="text-[10px] text-gray-400 lowercase">
                {activePlacesList.length} {activePlacesList.length === 1 ? 'place' : 'places'}
              </span>
            </div>

            {activePlacesList.length > 0 ? (
              activePlacesList.map((place) => {
                const subLabel = [place.street, place.suburb, place.city].filter(Boolean).join(', ');

                return (
                  <div
                    key={`mob-${place.id}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleSelect(place);
                    }}
                    onClick={() => handleSelect(place)}
                    className="p-4 flex items-start gap-3.5 active:bg-blue-50 dark:active:bg-zinc-800/80 transition cursor-pointer"
                  >
                    <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                      {getCategoryIcon(place)}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-snug">
                          {place.name}
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
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        {place.display_name || subLabel}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0 mt-2" />
                  </div>
                );
              })
            ) : hasSearched && !isLoading ? (
              <div className="p-6 text-center flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
                {currentHouseNo && currentRemainder && currentRemainder.trim().length >= 2 ? (
                  <div
                    className="w-full text-left p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 active:bg-blue-100 transition cursor-pointer flex items-center justify-between"
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
                      });
                    }}
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

