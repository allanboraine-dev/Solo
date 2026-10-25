"use client"

import { useEffect } from 'react'
import type { MockTrip } from '@/lib/mockBackend'
import { audioAlert } from '@/utils/audioAlert'

interface TripRequestModalProps {
  request: MockTrip | null
  onAccept: () => void
  onDecline: () => void
}

export default function TripRequestModal({ request, onAccept, onDecline }: TripRequestModalProps) {
  useEffect(() => {
    if (!request) {
      audioAlert.stopTripRingtoneLoop()
      return
    }
    audioAlert.startTripRingtoneLoop()
    return () => {
      audioAlert.stopTripRingtoneLoop()
    }
  }, [request?.id])

  if (!request) return null

  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-[9999] p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-950 p-5 sm:p-6 md:p-7 rounded-3xl max-w-sm sm:max-w-md w-full shadow-2xl border-2 border-gray-200 dark:border-white/15 animate-in zoom-in-95 duration-300 max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800/70 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              Ringing
            </span>
            <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full p-4 animate-bounce shadow-lg shadow-green-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 20v-6h4v6a1 1 0 0 0 1 1h3a2 2 0 0 0 2-2v-7.5l-9-5.25L2 9.5V19a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1z"/></svg>
            </div>
            <button
              type="button"
              onClick={() => {
                audioAlert.unlockMobileAudio(false)
                audioAlert.playAlertSequence()
              }}
              className="text-xs sm:text-sm font-bold px-3.5 py-2 min-h-[40px] rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-zinc-700 active:scale-95 transition touch-manipulation"
            >
              🔊 Sound
            </button>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-center mb-3 tracking-tight">New Trip Request!</h2>
          
          <div className="space-y-4 mb-5 bg-gray-50 dark:bg-zinc-900/60 p-4 sm:p-5 rounded-2xl text-base border border-gray-200/80 dark:border-white/10">
            {request.scheduled_time && (
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-3 rounded-xl border border-blue-200 dark:border-blue-800/60">
                <span className="block text-xs uppercase font-black tracking-wider mb-0.5 opacity-90">Scheduled For</span>
                <span className="font-bold text-base sm:text-lg">{new Date(request.scheduled_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
            <div>
              <span className="text-gray-600 dark:text-gray-400 block text-xs uppercase font-extrabold tracking-wider mb-1">Pickup</span>
              <span className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100 leading-snug break-words">{request.pickup_location}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400 block text-xs uppercase font-extrabold tracking-wider mb-1">Dropoff</span>
              <span className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100 leading-snug break-words">{request.dropoff_location}</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200/70 dark:border-white/10 pt-3">
              <span className="text-gray-600 dark:text-gray-400 text-xs uppercase font-extrabold tracking-wider">Occupants</span>
              <span className="font-bold text-xs sm:text-sm px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                {request.passenger_count === 2 ? '👥 2 Riders (Max)' : '👤 1 Rider (Solo)'}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200/70 dark:border-white/10 pt-3">
              <span className="text-gray-600 dark:text-gray-400 text-xs uppercase font-extrabold tracking-wider">Payment Method</span>
              <span className={`font-bold text-xs sm:text-sm px-3 py-1 rounded-full border ${
                request.payment_method === 'paystack'
                  ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                  : request.payment_method === 'speedpoint'
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800'
              }`}>
                {request.payment_method === 'paystack'
                  ? '💳 Paystack In-App Card'
                  : request.payment_method === 'speedpoint'
                  ? '💳 Speedpoint (Card / Tap)'
                  : '💵 Cash'}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200/70 dark:border-white/10 pt-3.5 mt-1">
              <span className="text-gray-600 dark:text-gray-300 text-xs sm:text-sm uppercase font-extrabold tracking-wider">Estimated Fare</span>
              <span className="font-black text-3xl sm:text-4xl text-green-600 dark:text-green-400">R{request.fare_amount}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button 
            onClick={() => {
              audioAlert.stopTripRingtoneLoop()
              onDecline()
            }}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 py-4 min-h-[56px] rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation flex items-center justify-center text-base sm:text-lg border border-gray-200 dark:border-zinc-700"
          >
            Decline
          </button>
          <button 
            onClick={() => {
              audioAlert.stopTripRingtoneLoop()
              audioAlert.playStatusChime()
              onAccept()
            }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-4 min-h-[56px] rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition shadow-xl shadow-emerald-600/25 touch-manipulation flex items-center justify-center text-base sm:text-lg"
          >
            Accept Ride
          </button>
        </div>
      </div>
    </div>
  )
}
