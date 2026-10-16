"use client"

import { useState, useEffect, useRef } from 'react'
import { searchPlaces, SearchResultPlace, KIMBERLEY_POPULAR_PLACES } from '@/utils/mapService'
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
} from 'lucide-react'

interface CustomSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: SearchResultPlace) => void;
  placeholder: string;
  proximityCoords?: { lat: number; lng: number } | null;
  hasRightAction?: boolean;
}

export default function CustomSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
  proximityCoords,
  hasRightAction = false,
}: CustomSearchInputProps) {
  const [results, setResults] = useState<SearchResultPlace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [hasSearched, setHasSearched] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const suppressNextSearchRef = useRef(false)

  // When value is short/empty, show top Kimberley destinations as quick-picks
  const isQueryShort = !value || value.trim().length < 2
  const activePlacesList = isQueryShort ? KIMBERLEY_POPULAR_PLACES.slice(0, 6) : results

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
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
    suppressNextSearchRef.current = true
    onSelect(place)
    setIsOpen(false)
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
      const selected = activeIndex >= 0 ? list[activeIndex] : list[0]
      if (selected) {
        handleSelect(selected)
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
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
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
          className={`w-full p-3.5 md:p-4 bg-transparent outline-none font-medium text-base sm:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${
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

      {isOpen && (
        <div
          ref={listRef}
          className="absolute top-full mt-1.5 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-60 md:max-h-72 overflow-y-auto overscroll-contain custom-scrollbar flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {isQueryShort && (
            <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50/90 dark:bg-zinc-800/60 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" />
                Popular Destinations
              </span>
              <span className="text-[10px] lowercase text-gray-400 font-normal">Kimberley</span>
            </div>
          )}

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
            <div className="p-5 text-center flex flex-col items-center justify-center gap-1 text-gray-500 dark:text-gray-400">
              <MapPin size={22} className="text-gray-300 dark:text-gray-600 mb-1" />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                No matching location found
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-xs">
                Try searching by street name (e.g. &ldquo;dutoitspan&rdquo; or &ldquo;memorial&rdquo;) or a Kimberley landmark.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

