"use client"

import { useState } from 'react'
import { MapPin, Plus, Trash2, CheckCircle2, Route, Sparkles, X } from 'lucide-react'
import CustomSearchInput from './CustomSearchInput'
import {
  getRouteDirections,
  calculateTripWithStopsAdjustment,
  STOP_SURCHARGE_ZAR,
  type SearchResultPlace,
  type TripStop,
} from '@/utils/mapService'
import { saveTrip, saveMessage, type MockTrip } from '@/lib/mockBackend'
import { generateUuid } from '@/utils/session'

interface TripStopsManagerProps {
  trip: MockTrip
  role: 'rider' | 'driver'
  onTripUpdated: (updatedTrip: MockTrip, summaryText?: string) => void
}

function formatStopPlaceLabel(feature: SearchResultPlace): string {
  const parts: string[] = []
  if (feature.name) parts.push(feature.name.trim())
  if (feature.suburb && !parts.some((p) => p.toLowerCase().includes(feature.suburb!.toLowerCase()))) {
    parts.push(feature.suburb.trim())
  }
  if (feature.city && !parts.some((p) => p.toLowerCase().includes(feature.city!.toLowerCase()))) {
    parts.push(feature.city.trim())
  }
  if (parts.length >= 2) {
    return parts.join(', ')
  }
  const displaySegments = (feature.display_name || feature.name || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
  return displaySegments.join(', ') || feature.name
}

export default function TripStopsManager({ trip, role, onTripUpdated }: TripStopsManagerProps) {
  const [isAddingStop, setIsAddingStop] = useState(false)
  const [stopQuery, setStopQuery] = useState('')
  const [pendingStop, setPendingStop] = useState<{
    address: string
    lat: number
    lng: number
    previewFare: number
    fareDelta: number
    totalDistanceKm: number
  } | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)

  const currentStops: TripStop[] = Array.isArray(trip.stops) ? trip.stops : []
  const canModifyStops =
    trip.status === 'requested' ||
    trip.status === 'accepted' ||
    trip.status === 'arrived' ||
    trip.status === 'in_progress'

  const recalculateAndApplyStops = async (
    nextStops: TripStop[],
    actionDescription: string
  ) => {
    setIsCalculating(true)
    try {
      const waypoints = nextStops.map((s) => ({ lat: s.lat, lng: s.lng }))
      const routeDetails = await getRouteDirections(
        trip.pickup_lng,
        trip.pickup_lat,
        trip.dropoff_lng,
        trip.dropoff_lat,
        waypoints
      )

      const adjustment = calculateTripWithStopsAdjustment({
        pickup: { lat: trip.pickup_lat, lng: trip.pickup_lng },
        dropoff: { lat: trip.dropoff_lat, lng: trip.dropoff_lng },
        stops: waypoints,
        occupantCount: trip.passenger_count || 1,
        atTime: trip.scheduled_time ? new Date(trip.scheduled_time) : new Date(),
        routeDistanceKm: routeDetails?.distanceKm,
        routeDurationMinutes: routeDetails?.durationMinutes,
        waitingFeeZar: trip.waiting_fee_amount || 0,
      })

      const previousFare = trip.fare_amount
      const updatedTrip: MockTrip = {
        ...trip,
        stops: nextStops,
        base_agreed_fare: adjustment.adjustedRouteFareZar,
        stops_fare_adjustment: adjustment.stopsAdjustmentZar,
        fare_amount: adjustment.finalTotalFareZar,
        updated_at: new Date().toISOString(),
      }

      await saveTrip(updatedTrip)

      const actorLabel = role === 'driver' ? 'Driver' : 'Rider'
      const summaryMsg = `📍 ${actorLabel} ${actionDescription} • Automatic fare adjustment: R${previousFare} → R${updatedTrip.fare_amount} (${nextStops.length} ${nextStops.length === 1 ? 'stop' : 'stops'})`

      await saveMessage({
        id: generateUuid(),
        trip_id: trip.id,
        sender: role,
        text: summaryMsg,
        timestamp: Date.now(),
      })

      setStatusBanner(`Fare automatically adjusted: R${previousFare} → R${updatedTrip.fare_amount}`)
      setTimeout(() => setStatusBanner(null), 5000)

      onTripUpdated(updatedTrip, summaryMsg)
    } finally {
      setIsCalculating(false)
    }
  }

  const handleSelectCandidateStop = async (feature: SearchResultPlace) => {
    const lat = Number(feature.lat)
    const lng = Number(feature.lon)
    const address = formatStopPlaceLabel(feature)
    setStopQuery(address)
    setIsCalculating(true)

    try {
      const candidateStops = [...currentStops, { id: 'preview', address, lat, lng }]
      const waypoints = candidateStops.map((s) => ({ lat: s.lat, lng: s.lng }))
      const routeDetails = await getRouteDirections(
        trip.pickup_lng,
        trip.pickup_lat,
        trip.dropoff_lng,
        trip.dropoff_lat,
        waypoints
      )

      const adjustment = calculateTripWithStopsAdjustment({
        pickup: { lat: trip.pickup_lat, lng: trip.pickup_lng },
        dropoff: { lat: trip.dropoff_lat, lng: trip.dropoff_lng },
        stops: waypoints,
        occupantCount: trip.passenger_count || 1,
        atTime: trip.scheduled_time ? new Date(trip.scheduled_time) : new Date(),
        routeDistanceKm: routeDetails?.distanceKm,
        routeDurationMinutes: routeDetails?.durationMinutes,
        waitingFeeZar: trip.waiting_fee_amount || 0,
      })

      const previewFare = Math.max(trip.fare_amount + STOP_SURCHARGE_ZAR, adjustment.finalTotalFareZar)
      const fareDelta = previewFare - trip.fare_amount

      setPendingStop({
        address,
        lat,
        lng,
        previewFare,
        fareDelta,
        totalDistanceKm: adjustment.multiStopDistanceKm,
      })
    } finally {
      setIsCalculating(false)
    }
  }

  const handleConfirmAddStop = async () => {
    if (!pendingStop) return
    const newStop: TripStop = {
      id: generateUuid(),
      address: pendingStop.address,
      lat: pendingStop.lat,
      lng: pendingStop.lng,
      addedBy: role,
      addedAt: new Date().toISOString(),
      completed: false,
    }

    const nextStops = [...currentStops, newStop]
    setPendingStop(null)
    setStopQuery('')
    setIsAddingStop(false)

    await recalculateAndApplyStops(nextStops, `added stop "${newStop.address}"`)
  }

  const handleRemoveStop = async (stopId: string) => {
    const target = currentStops.find((s) => s.id === stopId)
    const nextStops = currentStops.filter((s) => s.id !== stopId)
    await recalculateAndApplyStops(
      nextStops,
      `removed stop "${target?.address || 'Stop'}"`
    )
  }

  const handleToggleStopCompleted = async (stopId: string) => {
    const nextStops = currentStops.map((s) =>
      s.id === stopId ? { ...s, completed: !s.completed } : s
    )
    const updatedTrip: MockTrip = {
      ...trip,
      stops: nextStops,
      updated_at: new Date().toISOString(),
    }
    await saveTrip(updatedTrip)
    onTripUpdated(updatedTrip)
  }

  return (
    <div className="mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-800/40 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Route size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs sm:text-sm font-extrabold text-gray-800 dark:text-gray-100">
            Trip Stops ({currentStops.length})
          </span>
          {trip.stops_fare_adjustment ? (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60">
              +R{trip.stops_fare_adjustment} Auto-Adjusted
            </span>
          ) : null}
        </div>

        {canModifyStops && !isAddingStop && (
          <button
            type="button"
            onClick={() => {
              setIsAddingStop(true)
              setPendingStop(null)
              setStopQuery('')
            }}
            className="inline-flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800/60 transition active:scale-95"
          >
            <Plus size={14} />
            <span>Add a Stop</span>
          </button>
        )}
      </div>

      {statusBanner && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Sparkles size={14} className="text-emerald-600 shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Existing Intermediate Stops List */}
      {currentStops.length > 0 && (
        <div className="space-y-1.5">
          {currentStops.map((stop, idx) => (
            <div
              key={stop.id || idx}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs sm:text-sm transition ${
                stop.completed
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/50'
                  : 'bg-white/90 dark:bg-zinc-900/90 border-amber-200/80 dark:border-amber-800/50'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold break-words ${stop.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {stop.address}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                    Stop #{idx + 1} {stop.addedBy ? `• Added by ${stop.addedBy}` : ''} {stop.completed ? '• Completed' : ''}
                  </p>
                </div>
              </div>

              {canModifyStops && (
                <div className="flex items-center gap-1 shrink-0">
                  {role === 'driver' && (
                    <button
                      type="button"
                      onClick={() => handleToggleStopCompleted(stop.id)}
                      className={`p-1.5 rounded-lg border text-xs font-bold transition ${
                        stop.completed
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700'
                      }`}
                      title={stop.completed ? 'Stop completed' : 'Mark stop as reached'}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveStop(stop.id)}
                    disabled={isCalculating}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    title="Remove stop and recalculate fare"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Inline Add Stop Search & Automatic Fare Adjustment Preview */}
      {isAddingStop && (
        <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border-2 border-blue-500/40 dark:border-blue-500/40 shadow-md space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <MapPin size={14} />
              <span>Add Stop #{currentStops.length + 1} (Auto Fare Adjustment)</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAddingStop(false)
                setPendingStop(null)
                setStopQuery('')
              }}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative z-40 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-white/15 rounded-xl">
            <CustomSearchInput
              label={`Stop #${currentStops.length + 1} Location`}
              placeholder="Search street, house #, or landmark for stop..."
              value={stopQuery}
              onChange={(val) => {
                setStopQuery(val)
                if (pendingStop && val !== pendingStop.address) {
                  setPendingStop(null)
                }
              }}
              proximityCoords={{ lat: trip.pickup_lat, lng: trip.pickup_lng }}
              onSelect={handleSelectCandidateStop}
            />
          </div>

          {isCalculating && (
            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2 py-1">
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Recalculating multi-stop route &amp; automatic fare adjustment...</span>
            </div>
          )}

          {pendingStop && (
            <div className="p-3 rounded-xl bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{pendingStop.address}</p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">
                    Total route: {pendingStop.totalDistanceKm.toFixed(1)} km • +R{pendingStop.fareDelta} stop &amp; distance adjustment
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs line-through text-gray-400 block">R{trip.fare_amount}</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    R{pendingStop.previewFare}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmAddStop}
                disabled={isCalculating}
                className="w-full py-2.5 px-4 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus size={16} />
                <span>Confirm Stop &amp; Update Fare to R{pendingStop.previewFare}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
