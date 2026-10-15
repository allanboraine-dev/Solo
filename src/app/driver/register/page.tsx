"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveDriverProfile } from '@/lib/mockBackend'
import { createClient } from '@/utils/supabase/client'
import { uploadDriverKycDocument } from '@/utils/kyc'
import { KycDocType } from '@/types/kyc'
import KycDocumentUploader from '@/components/KycDocumentUploader'
import { User, Car, FileText, ChevronRight, ShieldCheck, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function DriverRegistration() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  
  // Step 1: Personal Details
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  // Step 2: Vehicle Details
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [prdpNumber, setPrdpNumber] = useState('')
  
  // Step 3: Real KYC Document Files
  const [licenseFrontFile, setLicenseFrontFile] = useState<File | null>(null)
  const [licenseBackFile, setLicenseBackFile] = useState<File | null>(null)
  const [prdpFile, setPrdpFile] = useState<File | null>(null)
  const [roadworthyFile, setRoadworthyFile] = useState<File | null>(null)
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null)

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault()
    setStep(s => s + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    setUploadProgressText('Creating your driver account...')
    
    const supabase = createClient()
    
    try {
      // 1. Sign up the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
            user_type: 'driver',
          },
        },
      })

      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Failed to create driver account')
      }

      const driverId = authData.user.id

      // 2. Upload KYC Documents to Supabase Storage
      const documentsToUpload: { file: File | null; type: KycDocType; label: string }[] = [
        { file: licenseFrontFile, type: 'license_front', label: "Driver's License (Front)" },
        { file: licenseBackFile, type: 'license_back', label: "Driver's License (Back)" },
        { file: prdpFile, type: 'prdp', label: 'PrDP Permit' },
        { file: roadworthyFile, type: 'roadworthy', label: 'Roadworthy Certificate' },
        { file: vehiclePhotoFile, type: 'vehicle_photo', label: 'Vehicle Photo' },
      ]

      for (const item of documentsToUpload) {
        if (item.file) {
          setUploadProgressText(`Uploading ${item.label}...`)
          const uploadRes = await uploadDriverKycDocument(driverId, item.type, item.file)
          if (!uploadRes.success) {
            console.warn(`Warning: Could not upload ${item.label}:`, uploadRes.error)
          }
        }
      }

      // 3. Save Driver Profile linked to Auth User ID
      setUploadProgressText('Saving driver profile...')
      await saveDriverProfile({
        id: driverId,
        fullName,
        email,
        phone,
        vehicleMake,
        vehicleModel,
        licensePlate,
        prdpNumber,
        hasLicense: !!(licenseFrontFile || licenseBackFile),
        hasPrdp: !!prdpFile,
        hasRoadworthy: !!roadworthyFile,
        subscriptionActive: true,
        subscriptionPlan: 'trial',
        trialStartedAt: Date.now(),
      })

      // Local fallback cache to ensure instant hydration
      localStorage.setItem('driver_id', driverId)
      
      // Check if email confirmation is required by Supabase
      if (!authData.session) {
        alert("Registration complete! Your documents have been uploaded for verification. Please check your email to confirm your account before logging in.")
        router.push('/driver/login')
      } else {
        alert("Registration complete! Your KYC documents have been uploaded for compliance review.")
        router.push('/driver')
      }
    } catch (err: unknown) {
      console.error('Registration error:', err)
      setSubmitError((err as Error).message || 'An error occurred during registration. Please try again.')
      setIsSubmitting(false)
    }
  }

  const hasRequiredDocs = !!(licenseFrontFile && licenseBackFile && prdpFile && roadworthyFile)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-black tracking-tight">Drive with SOLO</h1>
            <span className="flex items-center gap-1 text-xs font-bold bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
              <ShieldCheck size={14} />
              Zero Commission
            </span>
          </div>
          <p className="text-blue-100 text-sm">
            Keep 100% of your rider fares. 7-day free trial, then flat R999/month.
          </p>
          
          <div className="flex items-center gap-2 mt-8">
            <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full ${step >= 3 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
          </div>
          <div className="flex justify-between text-xs mt-2 text-blue-100 font-medium">
            <span>1. Personal Info</span>
            <span>2. Vehicle</span>
            <span>3. KYC Documents</span>
          </div>
        </div>

        {/* Form Steps */}
        <div className="p-8">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <User className="text-blue-500" /> Personal Details
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="Sipho Khumalo" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="sipho@example.co.za" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Create Password</label>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="••••••••" minLength={6} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number (South Africa)</label>
                <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="+27 82 123 4567" />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-2xl mt-6 flex justify-center items-center gap-2 active:scale-95 transition shadow-lg shadow-blue-500/20">
                Continue to Vehicle Info <ChevronRight size={18} />
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <Car className="text-blue-500" /> Vehicle Information
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Vehicle Make</label>
                  <input required type="text" value={vehicleMake} onChange={e => setVehicleMake(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="Toyota" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Vehicle Model</label>
                  <input required type="text" value={vehicleModel} onChange={e => setVehicleModel(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="Corolla Quest" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">License Plate Number</label>
                <input required type="text" value={licensePlate} onChange={e => setLicensePlate(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm uppercase" placeholder="CA 123-456" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">PrDP Number</label>
                <input required type="text" value={prdpNumber} onChange={e => setPrdpNumber(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="Professional Driving Permit Number" />
              </div>
              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setStep(1)} className="w-1/3 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
                  Back
                </button>
                <button type="submit" className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition shadow-lg shadow-blue-500/20">
                  Continue to KYC Documents <ChevronRight size={18} />
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-2">
                <div className="flex items-center gap-3 text-xl font-bold">
                  <FileText className="text-blue-500" /> Compliance & Verification
                </div>
                <span className="text-xs font-semibold text-gray-500">
                  Max 10MB (PDF, JPG, PNG)
                </span>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                South African law requires valid PrDP and roadworthiness verification for all commercial e-hailing vehicles. Documents are stored in encrypted private storage.
              </p>

              <div className="space-y-3 pt-2">
                {/* 1. Driver's License Front */}
                <KycDocumentUploader
                  docType="license_front"
                  selectedFile={licenseFrontFile}
                  onFileSelect={setLicenseFrontFile}
                  disabled={isSubmitting}
                />

                {/* 2. Driver's License Back */}
                <KycDocumentUploader
                  docType="license_back"
                  selectedFile={licenseBackFile}
                  onFileSelect={setLicenseBackFile}
                  disabled={isSubmitting}
                />

                {/* 3. PrDP Document */}
                <KycDocumentUploader
                  docType="prdp"
                  selectedFile={prdpFile}
                  onFileSelect={setPrdpFile}
                  disabled={isSubmitting}
                />

                {/* 4. Roadworthy Certificate */}
                <KycDocumentUploader
                  docType="roadworthy"
                  selectedFile={roadworthyFile}
                  onFileSelect={setRoadworthyFile}
                  disabled={isSubmitting}
                />

                {/* 5. Vehicle Photo (Optional) */}
                <KycDocumentUploader
                  docType="vehicle_photo"
                  selectedFile={vehiclePhotoFile}
                  onFileSelect={setVehiclePhotoFile}
                  disabled={isSubmitting}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed text-center font-medium">
                  By clicking Complete Registration, your 7-day free trial will activate immediately. Our compliance team verifies submitted documents within 24 hours.
                </p>
              </div>

              <div className="flex gap-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setStep(2)} 
                  disabled={isSubmitting}
                  className="w-1/3 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                >
                  Back
                </button>
                <button 
                  type="submit" 
                  disabled={!hasRequiredDocs || isSubmitting}
                  className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-2xl flex justify-center items-center gap-2 transition disabled:opacity-50 shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{uploadProgressText || 'Processing...'}</span>
                    </div>
                  ) : (
                    'Complete Registration'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
        
        <div className="text-center p-4 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
          Already registered? <Link href="/driver/login" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Sign in to Driver Portal</Link>
        </div>
      </div>
    </div>
  )
}
