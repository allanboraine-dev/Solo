"use client"

import React, { useState, useMemo } from 'react'
import { X, Car, ShieldCheck, MapPin, Navigation, Search, CheckCircle2, Star, ArrowUpDown } from 'lucide-react'
import type { LiveDriver } from '@/lib/mockBackend'

interface OnlineDriversModalProps {
  isOpen: boolean
  onClose: () => void
  drivers: LiveDriver[]
  onSelectDriver?: (driver: LiveDriver) => void
  onLocateOnMap?: (driver: LiveDriver) => void
}

export default function OnlineDriversModal({
  isOpen,
  onClose,
  drivers,
  onSelectDriver,
  onLocateOnMap,
}: OnlineDriversModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'distance' | 'rating'>('distance')

  const filteredAndSortedDrivers = useMemo(() => {
    let list = [...drivers]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((d) => {
        const name = (d.fullName || '').toLowerCase()
        const make = (d.vehicleMake || '').toLowerCase()
        const model = (d.vehicleModel || '').toLowerCase()
        const plate = (d.licensePlate || '').toLowerCase()
        const color = (d.vehicleColor || '').toLowerCase()
        return (
          name.includes(q) ||
          make.includes(q) ||
          model.includes(q) ||
          plate.includes(q) ||
          color.includes(q)
        )
      })
    }

    list.sort((a, b) => {
      if (sortBy === 'distance') {
        const distA = a.distanceKm ?? 9999
        const distB = b.distanceKm ?? 9999
        return distA - distB
      } else {
        const ratA = a.rating ?? 5.0
        const ratB = b.rating ?? 5.0
        return ratB - ratA
      }
    })

    return list
  }, [drivers, searchQuery, sortBy])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-xl max-h-[88vh] sm:max-h-[85vh] bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-drivers-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800/80 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Car size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="online-drivers-title" className="text-lg font-black tracking-tight text-gray-900 dark:text-white">
                  Drivers Online
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {drivers.length} Active
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                Verified SOLO drivers and vehicles ready for booking
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
            aria-label="Close drivers dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search driver, car model, or plate..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl border border-gray-200 dark:border-zinc-800 text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setSortBy('distance')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sortBy === 'distance'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Nearest
              </button>
              <button
                type="button"
                onClick={() => setSortBy('rating')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sortBy === 'rating'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Top Rated
              </button>
            </div>
          </div>
        </div>

        {/* Drivers List */}
        <div className="p-3 sm:p-4 overflow-y-auto overscroll-contain flex-1 space-y-3 custom-scrollbar">
          {filteredAndSortedDrivers.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-14 h-14 bg-gray-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                <Car size={26} />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1">
                {searchQuery ? 'No drivers match your search' : 'No drivers currently online nearby'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
                {searchQuery
                  ? 'Try searching with a different name, car make (e.g. Toyota), or South African license plate number.'
                  : 'Drivers in your service area will be notified via mobile push notification as soon as you place a ride request.'}
              </p>
            </div>
          ) : (
            filteredAndSortedDrivers.map((driver) => {
              const vehicleName = [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || 'Toyota Corolla Quest'
              const vehicleMeta = [driver.vehicleColor, driver.vehicleYear].filter(Boolean).join(' • ')
              const plateNumber = driver.licensePlate || 'NC 482-910'

              return (
                <div
                  key={driver.id}
                  className="p-3.5 sm:p-4 bg-gray-50/80 dark:bg-zinc-900/60 hover:bg-gray-100/80 dark:hover:bg-zinc-900 rounded-2xl border border-gray-200/70 dark:border-white/5 transition-all shadow-xs space-y-3"
                >
                  {/* Driver Profile & Rating Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                          {driver.fullName ? driver.fullName.charAt(0).toUpperCase() : 'D'}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white break-words">
                            {driver.fullName || 'Registered Driver'}
                          </h4>
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                            <ShieldCheck size={12} /> Verified
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          <span>{driver.tripId ? 'Currently on ride' : 'Available for pickup'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Star Rating Badge */}
                    <div className="shrink-0 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-lg text-xs font-bold">
                      <Star size={13} className="text-amber-500 fill-amber-500" />
                      <span>{driver.rating ? driver.rating.toFixed(1) : '5.0'}</span>
                      {driver.ratingCount ? (
                        <span className="text-[10px] text-gray-400 font-normal">({driver.ratingCount})</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Car & Vehicle Information Card */}
                  <div className="p-2.5 sm:p-3 bg-white dark:bg-zinc-950 rounded-xl border border-gray-200/60 dark:border-white/5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 block mb-0.5">
                        Vehicle Details
                      </span>
                      <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                        <Car size={15} className="text-blue-500 shrink-0" />
                        <span className="break-words">{vehicleName}</span>
                      </div>
                      {vehicleMeta && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 pl-5 mt-0.5 font-medium">
                          {vehicleMeta}
                        </div>
                      )}
                    </div>

                    {/* South African License Plate Badge */}
                    <div className="shrink-0 flex flex-col items-end">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
                        License Plate
                      </span>
                      <div className="px-2.5 py-1 bg-amber-300 dark:bg-amber-400 text-black font-mono font-black text-xs tracking-wider rounded-lg border-2 border-black/70 shadow-xs uppercase flex items-center gap-1">
                        <span className="text-[10px] opacity-80">🇿🇦</span>
                        <span>{plateNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* Drive Telematics & Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-200/50 dark:border-white/5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-300">
                      <Navigation size={13} className="text-blue-500 shrink-0" />
                      {driver.distanceKm !== undefined ? (
                        <span>
                          <strong className="text-blue-600 dark:text-blue-400 font-bold">{driver.distanceKm.toFixed(1)} km</strong> away
                          {driver.etaMinutes !== undefined && (
                            <span className="text-gray-400 font-normal"> (~{driver.etaMinutes} min)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-500">Within pickup radius</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {onLocateOnMap && (
                        <button
                          type="button"
                          onClick={() => {
                            onLocateOnMap(driver)
                            onClose()
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-bold text-xs transition"
                          title="View on Map"
                        >
                          <MapPin size={12} className="text-blue-500" />
                          <span>View on Map</span>
                        </button>
                      )}

                      {onSelectDriver && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectDriver(driver)
                            onClose()
                          }}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition active:scale-95"
                        >
                          Book Ride
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info note */}
        <div className="p-3 bg-gray-50 dark:bg-zinc-900/50 border-t border-gray-100 dark:border-zinc-800/80 text-center">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            100% of your fare goes directly to the driver with zero commission taken by SOLO.
          </p>
        </div>
      </div>
    </div>
  )
}
