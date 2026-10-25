"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { isPlatformOwner, isOwnerPassword } from '@/utils/owner'
import { setSafeLocalStorageItem } from '@/utils/session'
import Link from 'next/link'

export default function DriverLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    const supabase = createClient()
    const cleanEmail = email.trim().toLowerCase()

    // Support platform owner login with owner master password (13579)
    if (isPlatformOwner(cleanEmail)) {
      if (isOwnerPassword(password)) {
        try {
          const { data: supaData } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          })
          if (supaData?.user) {
            setSafeLocalStorageItem('driver_id', supaData.user.id)
            router.push('/driver')
            return
          }
        } catch {
          // Fall through to local profile
        }

        // Cache founder profile locally so Driver Portal recognizes Allan Boraine immediately
        const founderProfile = {
          id: 'owner-allan-boraine',
          fullName: 'Allan Boraine (Founder)',
          email: cleanEmail,
          phone: '0829245136',
          vehicleMake: 'Kia',
          vehicleModel: 'Sportage',
          vehicleColor: 'Blue',
          licensePlate: 'CWT 143 NC',
          prdpNumber: 'PRDP-FOUNDER-001',
          hasLicense: true,
          hasPrdp: true,
          hasRoadworthy: true,
          isVerified: true,
          subscriptionActive: true,
          subscriptionPlan: 'owner',
        }
        setSafeLocalStorageItem('driver_id', founderProfile.id)
        setSafeLocalStorageItem('mock_driver_profile', JSON.stringify(founderProfile))
        router.push('/driver')
        return
      }

      // If owner email is used with a different password, try Supabase first
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (!authError && data?.user) {
          setSafeLocalStorageItem('driver_id', data.user.id)
          router.push('/driver')
          return
        }
      } catch {
        // Fall through
      }

      setError('Invalid credentials for Platform Owner. Please verify your password.')
      setIsSubmitting(false)
      return
    }
    
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (authError || !data.user) {
      setError(authError?.message || 'Failed to login')
      setIsSubmitting(false)
      return
    }

    // Save driver_id so mockBackend knows who we are locally
    setSafeLocalStorageItem('driver_id', data.user.id);
    
    router.push('/driver')
  }

  return (
    <div className="min-h-mobile-portal bg-gray-50 dark:bg-black p-4 sm:p-6 md:p-8 flex items-center justify-center">
      <div className="max-w-md sm:max-w-lg w-full bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 border border-gray-200 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="relative p-1 rounded-[1.35rem] bg-gradient-to-br from-emerald-500 via-teal-400 to-green-600 shadow-xl shadow-emerald-500/25 mx-auto mb-4 w-fit">
            <img
              src="/driver-icon-192.png"
              alt="SOLO Driver Portal"
              className="w-16 h-16 rounded-2xl object-cover border border-white/20"
            />
          </div>
          <h1 className="text-3xl font-black mb-2">Driver Login</h1>
          <p className="text-gray-500">Welcome back to SOLO.</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 font-medium text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-2">Email</label>
            <input 
              required 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-4 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" 
              placeholder="nelson@example.com" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2">Password</label>
            <input 
              required 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-4 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" 
              placeholder="••••••••" 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold p-4 rounded-xl mt-6 flex justify-center items-center gap-2 active:scale-95 transition-all"
          >
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="text-center mt-6 text-gray-500 font-medium">
          Don&apos;t have an account? <Link href="/driver/register" className="text-blue-600 dark:text-blue-400">Register</Link>
        </p>
      </div>
    </div>
  )
}
