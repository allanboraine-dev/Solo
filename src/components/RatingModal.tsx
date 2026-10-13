"use client"

import React, { useState } from 'react'
import { Star, CheckCircle, MessageSquare } from 'lucide-react'
import type { MockTrip } from '@/lib/mockBackend'

interface RatingModalProps {
  isOpen: boolean
  trip: MockTrip | null
  driverName?: string
  driverVehicle?: string
  onSubmit: (data: { stars: number; tags: string[]; comment: string }) => void
  onSkip: () => void
}

const COMPLIMENT_TAGS = [
  "Clean Vehicle",
  "Polite & Friendly",
  "Smooth & Safe Driving",
  "Great Route",
  "Great Music",
  "Comfortable Ride"
]

const STAR_LABELS: Record<number, string> = {
  1: "Needs Improvement",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent!"
}

export default function RatingModal({
  isOpen,
  trip,
  driverName = "Your Driver",
  driverVehicle,
  onSubmit,
  onSkip
}: RatingModalProps) {
  const [stars, setStars] = useState<number>(5)
  const [hoveredStars, setHoveredStars] = useState<number | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  if (!isOpen || !trip) return null

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
    setTimeout(() => {
      onSubmit({
        stars,
        tags: selectedTags,
        comment: comment.trim()
      })
      setIsSubmitted(false)
    }, 600)
  }

  const activeRating = hoveredStars !== null ? hoveredStars : stars

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[5000] p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-zinc-950 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-white/10 animate-in zoom-in-95 duration-300 relative">
        {isSubmitted ? (
          <div className="text-center py-10 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={36} />
            </div>
            <h3 className="text-2xl font-black mb-2">Thank You!</h3>
            <p className="text-gray-500 text-sm">Your feedback helps keep SOLO drivers exceptional.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="text-center mb-6">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                Trip Completed
              </span>
              <h2 className="text-2xl font-black mt-3 tracking-tight">Rate Your Trip</h2>
              <p className="text-sm text-gray-500 mt-1">
                How was your ride with <span className="font-bold text-gray-900 dark:text-gray-100">{driverName}</span>?
              </p>
              {driverVehicle && (
                <p className="text-xs text-gray-400 mt-0.5">{driverVehicle}</p>
              )}
            </div>

            {/* Interactive Stars */}
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="flex gap-2 mb-2">
                {[1, 2, 3, 4, 5].map((starValue) => {
                  const isFilled = starValue <= activeRating
                  return (
                    <button
                      type="button"
                      key={starValue}
                      onClick={() => setStars(starValue)}
                      onMouseEnter={() => setHoveredStars(starValue)}
                      onMouseLeave={() => setHoveredStars(null)}
                      className="p-1 transition-transform hover:scale-125 active:scale-95 focus:outline-none"
                    >
                      <Star
                        size={36}
                        className={`transition-colors ${
                          isFilled
                            ? 'text-amber-400 fill-amber-400 filter drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'
                            : 'text-gray-300 dark:text-zinc-700'
                        }`}
                      />
                    </button>
                  )
                })}
              </div>
              <span className="text-sm font-bold text-amber-500 h-5">
                {STAR_LABELS[activeRating] || ""}
              </span>
            </div>

            {/* Quick Compliment Tags */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2.5">
                What went well?
              </label>
              <div className="flex flex-wrap gap-2">
                {COMPLIMENT_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag)
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => handleTagToggle(tag)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 scale-[1.02]'
                          : 'bg-gray-50 dark:bg-zinc-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/5 hover:border-gray-300'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Written Comment / Feedback */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Leave a Note (Optional)
              </label>
              <div className="relative">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share details about your experience..."
                  rows={3}
                  className="w-full text-sm p-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-white/10 outline-none focus:border-blue-500 dark:focus:border-blue-500 transition-colors resize-none"
                />
                <MessageSquare className="absolute right-3 bottom-3 text-gray-300 dark:text-zinc-700 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                type="submit"
                className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black text-sm tracking-wide hover:scale-[1.01] active:scale-[0.98] transition-all shadow-xl"
              >
                Submit Rating
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 py-2 transition-colors text-center"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
