"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveDriverProfile } from '@/lib/mockBackend'
import { createClient } from '@/utils/supabase/client'
import { User, Car, FileText, Upload, CheckCircle, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function DriverRegistration() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form State
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [prdpNumber, setPrdpNumber] = useState('')
  
  // File Upload State Mocks
  const [licenseUploaded, setLicenseUploaded] = useState(false)
  const [prdpUploaded, setPrdpUploaded] = useState(false)
  const [roadworthyUploaded, setRoadworthyUploaded] = useState(false)

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault()
    setStep(s => s + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    const supabase = createClient();
    
    // 1. Sign up the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      alert("Registration failed: " + (authError?.message || "Unknown error"));
      setIsSubmitting(false);
      return;
    }

    // 2. Save Driver Profile linked to Auth User ID
    await saveDriverProfile({
      id: authData.user.id,
      fullName,
      email,
      phone,
      vehicleMake,
      vehicleModel,
      licensePlate,
      prdpNumber,
      hasLicense: licenseUploaded,
      hasPrdp: prdpUploaded,
      hasRoadworthy: roadworthyUploaded,
      subscriptionActive: true, // Auto-subscribed in mock
      subscriptionPlan: 'trial',
      trialStartedAt: Date.now()
    })

    // Local fallback cache to ensure instant hydration
    localStorage.setItem('driver_id', authData.user.id);
    
    // Check if email confirmation is required by Supabase
    if (!authData.session) {
      alert("Registration successful! Please check your email to confirm your account before logging in.");
      router.push('/driver/login')
    } else {
      router.push('/driver')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-xl w-full bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="bg-blue-600 p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Drive with SOLO</h1>
          <p className="text-blue-100">Zero commissions. Get 7 days free, then a flat R999/pm. Keep 100% of your fares.</p>
          
          <div className="flex items-center gap-2 mt-8">
            <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full ${step >= 3 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
          </div>
          <div className="flex justify-between text-xs mt-2 text-blue-100 font-medium">
            <span>Profile</span>
            <span>Vehicle</span>
            <span>Documents & Sub</span>
          </div>
        </div>

        {/* Form Steps */}
        <div className="p-8">
          {step === 1 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <User className="text-blue-500" /> Personal Details
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="Nelson Mandela" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="nelson@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="+27 82 123 4567" />
              </div>
              <button type="submit" className="w-full bg-black dark:bg-white text-white dark:text-black font-bold p-4 rounded-xl mt-6 flex justify-center items-center gap-2 hover:scale-[1.02] transition">
                Next Step <ChevronRight size={20} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <Car className="text-blue-500" /> Vehicle Information
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Make</label>
                  <input required type="text" value={vehicleMake} onChange={e => setVehicleMake(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="Toyota" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Model</label>
                  <input required type="text" value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="Corolla" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">License Plate Number</label>
                <input required type="text" value={licensePlate} onChange={e => setLicensePlate(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none" placeholder="CA 123-456" />
              </div>
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setStep(1)} className="w-1/3 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition">
                  Back
                </button>
                <button type="submit" className="w-2/3 bg-black dark:bg-white text-white dark:text-black font-bold p-4 rounded-xl flex justify-center items-center gap-2 hover:scale-[1.02] transition">
                  Next Step <ChevronRight size={20} />
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <FileText className="text-blue-500" /> Required Documents
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">PrDP Number</label>
                <input required type="text" value={prdpNumber} onChange={e => setPrdpNumber(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl transition-all outline-none mb-4" placeholder="Professional Driving Permit Number" />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium mb-2">Upload Certificates (Mock)</label>
                
                {/* Driver's License Upload */}
                <div onClick={() => setLicenseUploaded(!licenseUploaded)} className={`p-4 border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-between transition-colors ${licenseUploaded ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-blue-500'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${licenseUploaded ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-800'}`}><FileText size={20}/></div>
                    <div>
                      <p className="font-bold text-sm">Driver's License</p>
                      <p className="text-xs text-gray-500">{licenseUploaded ? 'Uploaded successfully' : 'Tap to upload front & back'}</p>
                    </div>
                  </div>
                  {licenseUploaded ? <CheckCircle className="text-green-500" /> : <Upload className="text-gray-400" />}
                </div>

                {/* PrDP Upload */}
                <div onClick={() => setPrdpUploaded(!prdpUploaded)} className={`p-4 border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-between transition-colors ${prdpUploaded ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-blue-500'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${prdpUploaded ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-800'}`}><FileText size={20}/></div>
                    <div>
                      <p className="font-bold text-sm">PrDP Document</p>
                      <p className="text-xs text-gray-500">{prdpUploaded ? 'Uploaded successfully' : 'Tap to upload active PrDP'}</p>
                    </div>
                  </div>
                  {prdpUploaded ? <CheckCircle className="text-green-500" /> : <Upload className="text-gray-400" />}
                </div>

                {/* Roadworthy Upload */}
                <div onClick={() => setRoadworthyUploaded(!roadworthyUploaded)} className={`p-4 border-2 border-dashed rounded-xl cursor-pointer flex items-center justify-between transition-colors ${roadworthyUploaded ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-blue-500'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${roadworthyUploaded ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-800'}`}><FileText size={20}/></div>
                    <div>
                      <p className="font-bold text-sm">Roadworthy Certificate</p>
                      <p className="text-xs text-gray-500">{roadworthyUploaded ? 'Uploaded successfully' : 'Tap to upload certificate'}</p>
                    </div>
                  </div>
                  {roadworthyUploaded ? <CheckCircle className="text-green-500" /> : <Upload className="text-gray-400" />}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mt-6 border border-blue-100 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium text-center">
                  By clicking complete, you start your 7-day free trial. After 7 days, your R999/pm SaaS subscription will automatically begin.
                </p>
              </div>

              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setStep(2)} className="w-1/3 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition">
                  Back
                </button>
                <button 
                  type="submit" 
                  disabled={!licenseUploaded || !prdpUploaded || !roadworthyUploaded || isSubmitting}
                  className="w-2/3 bg-blue-600 text-white font-bold p-4 rounded-xl flex justify-center items-center gap-2 hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing...' : 'Complete Registration'}
                </button>
              </div>
            </form>
          )}
        </div>
        
        <div className="text-center p-4 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-800">
          Already have an account? <Link href="/driver" className="text-blue-600 hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  )
}
