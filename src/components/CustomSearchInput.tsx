"use client"

import { useState, useEffect, useRef } from 'react'
import { searchPlaces, SearchResultPlace } from '@/utils/mapService'
import { MapPin, Building2, Home, X } from 'lucide-react'

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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const suppressNextSearchRef = useRef(false)

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    if (!value || value.trim().length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const delayDebounceFn = setTimeout(async () => {
      try {
        const places = await searchPlaces(value, proximityCoords)
        setResults(places)
        setIsOpen(places.length > 0)
      } catch (err) {
        console.error('Commercial geocoding lookup failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 280)

    return () => clearTimeout(delayDebounceFn)
  }, [value, proximityCoords?.lat, proximityCoords?.lng])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getCategoryIcon = (place: SearchResultPlace) => {
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
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          className={`w-full p-4 bg-transparent outline-none font-medium text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100 ${
            hasRightAction ? 'pr-20' : 'pr-10'
          }`}
        />
        {isLoading ? (
          <div className={`absolute ${hasRightAction ? 'right-12' : 'right-4'} top-1/2 -translate-y-1/2`}>
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setResults([])
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

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto custom-scrollbar flex flex-col">
          {results.map((place) => {
            const subLabel = [place.street, place.suburb, place.city]
              .filter(Boolean)
              .join(', ');
            return (
              <div
                key={place.id}
                className="p-3.5 hover:bg-blue-50/60 dark:hover:bg-zinc-800/70 cursor-pointer border-b border-gray-100 dark:border-zinc-800/60 last:border-0 flex items-start gap-3 transition-colors"
                onClick={() => {
                  suppressNextSearchRef.current = true
                  onSelect(place)
                  setIsOpen(false)
                  setResults([])
                }}
              >
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                  {getCategoryIcon(place)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-snug">
                      {place.name}
                    </span>
                    {place.houseNumber && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                        #{place.houseNumber}
                      </span>
                    )}
                    {place.buildingName && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                        Building / POI
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {place.display_name || subLabel}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
