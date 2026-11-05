"use client"

import { useEffect, useState, useRef } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import {
  calculatePickupWaitingFare,
  PICKUP_GRACE_PERIOD_SECONDS,
  WAITING_FEE_PER_MINUTE_ZAR,
  type PickupWaitingFeeStatus,
} from '@/utils/mapService'
import { saveTrip, type MockTrip } from '@/lib/mockBackend'

interface PickupWaitingTimerBannerProps {
  trip: MockTrip
  role: 'rider' | 'driver'
  onWaitingFareIncreased?: (updatedTrip: MockTrip) => void
}

export default function PickupWaitingTimerBanner({
  trip,
  role,
  onWaitingFareIncreased,
}: PickupWaitingTimerBannerProps) {
  const fallbackArrivedRef = useRef<string>(
    trip.arrived_at || trip.updated_at || new Date().toISOString()
  )

  useEffect(() => {
    if (trip.arrived_at) {
      fallbackArrivedRef.current = trip.arrived_at
    }
  }, [trip.arrived_at])

  const effectiveArrivedAt = trip.arrived_at || fallbackArrivedRef.current
  const baseFare =
    trip.base_agreed_fare ??
    Math.max(22, trip.fare_amount - (trip.waiting_fee_amount || 0))

  const [waitingState, setWaitingState] = useState<PickupWaitingFeeStatus>(() =>
    calculatePickupWaitingFare(baseFare, effectiveArrivedAt, Date.now())
  )
  const lastPersistedFeeRef = useRef<number>(trip.waiting_fee_amount || 0)

  useEffect(() => {
    if (trip.status !== 'arrived') return

    const tick = () => {
      const currentBase =
        trip.base_agreed_fare ??
        Math.max(22, trip.fare_amount - (trip.waiting_fee_amount || 0))
      const nextStatus = calculatePickupWaitingFare(
        currentBase,
        effectiveArrivedAt,
        Date.now()
      )
      setWaitingState(nextStatus)

      // Automatically increase agreed trip price once the 2-minute grace period expires
      if (
        nextStatus.isGracePeriodExpired &&
        nextStatus.waitingFeeZar > lastPersistedFeeRef.current
      ) {
        lastPersistedFeeRef.current = nextStatus.waitingFeeZar
        const updatedTrip: MockTrip = {
          ...trip,
          arrived_at: effectiveArrivedAt,
          base_agreed_fare: nextStatus.baseAgreedFareZar,
          waiting_fee_amount: nextStatus.waitingFeeZar,
          waiting_seconds_charged: nextStatus.overtimeSeconds,
          fare_amount: nextStatus.adjustedTotalFareZar,
          updated_at: new Date().toISOString(),
        }
        saveTrip(updatedTrip).catch(() => {})
        if (onWaitingFareIncreased) {
          onWaitingFareIncreased(updatedTrip)
        }
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [
    trip.id,
    trip.status,
    trip.fare_amount,
    trip.base_agreed_fare,
    trip.waiting_fee_amount,
    effectiveArrivedAt,
  ])

  if (trip.status !== 'arrived') return null

  const progressPercent = waitingState.isGracePeriodExpired
    ? 100
    : Math.min(
        100,
        Math.round(
          ((PICKUP_GRACE_PERIOD_SECONDS - waitingState.remainingGraceSeconds) /
            PICKUP_GRACE_PERIOD_SECONDS) *
            100
        )
      )

  return (
    <div
      className={`mt-3 p-3.5 rounded-2xl border transition-all ${
        waitingState.isGracePeriodExpired
          ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-700/70 text-red-950 dark:text-red-100'
          : 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-950 dark:text-indigo-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {waitingState.isGracePeriodExpired ? (
            <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0 animate-bounce" />
          ) : (
            <Clock size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse" />
          )}
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-black leading-snug">
              {waitingState.isGracePeriodExpired
                ? `2-Min Grace Period Ended (+R${waitingState.waitingFeeZar} Wait Fee)`
                : '2-Minute Free Pickup Grace Period'}
            </p>
            <p className="text-[11px] sm:text-xs font-semibold opacity-85 leading-snug mt-0.5">
              {waitingState.isGracePeriodExpired
                ? `Agreed trip price increased from R${waitingState.baseAgreedFareZar} to R${waitingState.adjustedTotalFareZar} (+R${WAITING_FEE_PER_MINUTE_ZAR}/min)`
                : role === 'rider'
                  ? `Board within ${waitingState.formattedCountdown} before agreed trip price increases (+R${WAITING_FEE_PER_MINUTE_ZAR}/min)`
                  : `Rider has ${waitingState.formattedCountdown} left before trip fare auto-increases (+R${WAITING_FEE_PER_MINUTE_ZAR}/min)`}
            </p>
          </div>
        </div>

        <div
          className={`shrink-0 font-mono font-black text-sm sm:text-base px-3 py-1.5 rounded-xl border shadow-2xs ${
            waitingState.isGracePeriodExpired
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
          }`}
        >
          {waitingState.formattedCountdown}
        </div>
      </div>

      {/* Countdown Progress Bar */}
      <div className="mt-2.5 w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            waitingState.isGracePeriodExpired ? 'bg-red-600' : 'bg-indigo-600 dark:bg-indigo-400'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}
