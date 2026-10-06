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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[5000] p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-950 p-6 rounded-3xl max-w-sm w-full shadow-2xl border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-300">
        <div className="flex justify-center mb-4">
          <div className="bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full p-4 animate-bounce shadow-lg shadow-green-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 20v-6h4v6a1 1 0 0 0 1 1h3a2 2 0 0 0 2-2v-7.5l-9-5.25L2 9.5V19a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1z"/></svg>
          </div>
        </div>
        <h2 className="text-2xl font-black text-center mb-2 tracking-tight">New Trip Request!</h2>
        
        <div className="space-y-4 mb-6 bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl text-sm border border-gray-100 dark:border-white/5">
          {request.scheduled_time && (
            <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-3 rounded-xl border border-blue-100 dark:border-blue-800/50">
              <span className="block text-[10px] uppercase font-black tracking-wider mb-1 opacity-80">Scheduled For</span>
              <span className="font-bold text-base">{new Date(request.scheduled_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Pickup</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{request.pickup_location}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Dropoff</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{request.dropoff_location}</span>
          </div>
          <div className="flex justify-between items-center border-t border-gray-200/50 dark:border-white/10 pt-4 mt-2">
            <span className="text-gray-500 dark:text-gray-400 text-[10px] uppercase font-bold tracking-wider">Estimated Fare</span>
            <span className="font-black text-2xl text-green-600 dark:text-green-400">R{request.fare_amount}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={onDecline}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 py-4 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition active:scale-95"
          >
            Decline
          </button>
          <button 
            onClick={onAccept}
            className="flex-1 bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition shadow-xl"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
