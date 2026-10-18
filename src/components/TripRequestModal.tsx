"use client"

import type { MockTrip } from '@/lib/mockBackend'

interface TripRequestModalProps {
  request: MockTrip | null
  onAccept: () => void
  onDecline: () => void
}

export default function TripRequestModal({ request, onAccept, onDecline }: TripRequestModalProps) {
  if (!request) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-950 p-5 sm:p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-300 max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar flex flex-col justify-between">
        <div>
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full p-3.5 sm:p-4 animate-bounce shadow-lg shadow-green-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 20v-6h4v6a1 1 0 0 0 1 1h3a2 2 0 0 0 2-2v-7.5l-9-5.25L2 9.5V19a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1z"/></svg>
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-center mb-2 tracking-tight">New Trip Request!</h2>
          
          <div className="space-y-3.5 mb-5 bg-gray-50 dark:bg-zinc-900/50 p-4 sm:p-5 rounded-2xl text-sm border border-gray-100 dark:border-white/5">
            {request.scheduled_time && (
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-2.5 sm:p-3 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <span className="block text-[10px] uppercase font-black tracking-wider mb-0.5 opacity-80">Scheduled For</span>
                <span className="font-bold text-sm sm:text-base">{new Date(request.scheduled_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Pickup</span>
              <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{request.pickup_location}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Dropoff</span>
              <span className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{request.dropoff_location}</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200/50 dark:border-white/10 pt-2.5">
              <span className="text-gray-500 dark:text-gray-400 text-[10px] uppercase font-bold tracking-wider">Occupants</span>
              <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                {request.passenger_count === 2 ? '👥 2 Riders (Max)' : '👤 1 Rider (Solo)'}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-200/50 dark:border-white/10 pt-3 mt-1">
              <span className="text-gray-500 dark:text-gray-400 text-[10px] uppercase font-bold tracking-wider">Estimated Fare</span>
              <span className="font-black text-xl sm:text-2xl text-green-600 dark:text-green-400">R{request.fare_amount}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button 
            onClick={onDecline}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 py-3.5 sm:py-4 min-h-[48px] rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation flex items-center justify-center text-sm sm:text-base"
          >
            Decline
          </button>
          <button 
            onClick={onAccept}
            className="flex-1 bg-black dark:bg-white text-white dark:text-black py-3.5 sm:py-4 min-h-[48px] rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition shadow-xl touch-manipulation flex items-center justify-center text-sm sm:text-base"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
