"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveDriverProfile } from '@/lib/mockBackend'
import { createClient } from '@/utils/supabase/client'
import { uploadDriverKycDocument } from '@/utils/kyc'
import { KycDocType } from '@/types/kyc'
import { generateUuid, getSafeLocalStorageItem, setSafeLocalStorageItem, removeSafeLocalStorageItem, safeJsonParse } from '@/utils/session'
import { isValidSAPhone } from '@/utils/driverValidation'
import KycDocumentUploader from '@/components/KycDocumentUploader'
import { 
  User, 
  Car, 
  FileText, 
  ChevronRight, 
  ShieldCheck, 
  AlertCircle, 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  Lock, 
  Calendar,
  Sparkles,
  Zap,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'

export default function DriverRegistration() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  
  // Step 1: Personal Details
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  // Step 2: Vehicle & Payment Equipment Details
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [vehicleYear, setVehicleYear] = useState(2023)
  const [vehicleColor, setVehicleColor] = useState('White')
  const [licensePlate, setLicensePlate] = useState('')
  const [prdpNumber, setPrdpNumber] = useState('')
  const [hasSpeedpointConfirmed, setHasSpeedpointConfirmed] = useState(false)
  
  // Step 3: Real KYC Document Files & Camera Snaps
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [licenseFrontFile, setLicenseFrontFile] = useState<File | null>(null)
  const [licenseBackFile, setLicenseBackFile] = useState<File | null>(null)
  const [prdpFile, setPrdpFile] = useState<File | null>(null)
  const [licenseDiscFile, setLicenseDiscFile] = useState<File | null>(null)
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null)
  const [roadworthyFile, setRoadworthyFile] = useState<File | null>(null)

  // Step 4: Card & Trial Setup State
  const [createdDriverId, setCreatedDriverId] = useState<string | null>(null)
  const [hasRegisteredAccount, setHasRegisteredAccount] = useState(false)
  const [isPaystackLoaded, setIsPaystackLoaded] = useState(false)

  // Purge any existing cached owner/driver session on mount so registration is 100% clean
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      if (!params.get('card_setup')) {
        try {
          localStorage.removeItem('driver_id')
          localStorage.removeItem('pending_driver_email')
          localStorage.removeItem('mock_driver_profile')
        } catch {}
        removeSafeLocalStorageItem('driver_id')
        removeSafeLocalStorageItem('pending_driver_email')
        removeSafeLocalStorageItem('mock_driver_profile')
        const supabase = createClient()
        if (supabase?.auth?.signOut) {
          supabase.auth.signOut().catch(() => {})
        }
      }
    } catch (e) {
      console.warn('Registration session purge notice:', e)
    }
  }, [])

  // Dynamically load Paystack Inline JS script
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if ((window as any).PaystackPop) {
        setIsPaystackLoaded(true)
        return
      }

      const script = document.createElement('script')
      script.src = 'https://js.paystack.co/v1/inline.js'
      script.async = true
      script.onload = () => setIsPaystackLoaded(true)
      script.onerror = () => console.warn('Could not load Paystack inline JS; redirect fallback will be used.')
      if (document.body) {
        document.body.appendChild(script)
      }
    } catch (e) {
      console.warn('Paystack script load notice:', e)
    }
  }, [])

  // Check if returning from Paystack hosted checkout redirect
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      const isCardSetup = params.get('card_setup') === 'success' || params.get('payment') === 'success'
      const reference = params.get('reference')
      const driverId = params.get('driver_id') || getSafeLocalStorageItem('driver_id')
      const pendingEmail = getSafeLocalStorageItem('pending_driver_email') || email

      if (isCardSetup && reference && driverId) {
        setIsSubmitting(true)
        setUploadProgressText('Verifying R1 card test & activating 7-day free trial...')

        fetch('/api/driver/setup-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId,
            email: pendingEmail,
            reference,
          }),
        })
          .then((res) => res.json())
          .then(async (data) => {
            if (data.success) {
              const billingDateStr = data.nextBillingDate 
                ? new Date(data.nextBillingDate).toLocaleDateString('en-ZA', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                : 'on the 8th day'

              const now = Date.now()
              const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
              const existingProf = safeJsonParse<any>(getSafeLocalStorageItem('mock_driver_profile'), null) || {}
              await saveDriverProfile({
                ...existingProf,
                id: driverId,
                subscriptionActive: true,
                subscriptionPlan: 'trial',
                trialStartedAt: now,
                trialEndsAt: now + SEVEN_DAYS_MS,
                cardLast4: data.card?.last4 || '••••',
                cardBrand: data.card?.brand || 'Card',
                cardExpMonth: data.card?.expMonth ? String(data.card.expMonth) : undefined,
                cardExpYear: data.card?.expYear ? String(data.card.expYear) : undefined,
                paystackSubscriptionCode: data.subscriptionCode,
                nextBillingDate: data.nextBillingDate,
                cardCaptured: true,
              })

              alert(`🎉 R1.00 card test successful!\n\nYour 7-day free trial has begun. You keep 100% of your earnings with 0% platform commission.\n\nYour first R499.00 monthly subscription billing is scheduled for the 8th day (${billingDateStr}).\n\nWelcome to SOLO!`)
              router.push('/driver')
            } else {
              setSubmitError(data.error || 'Failed to complete card verification.')
              setIsSubmitting(false)
            }
          })
          .catch((err) => {
            setSubmitError(err.message || 'Error completing trial card verification.')
            setIsSubmitting(false)
          })
      }
    } catch (e) {
      console.warn('Paystack redirect check error:', e)
    }
  }, [router, email])

  const handleStep1Next = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!fullName.trim() || !email.trim() || !password || !phone.trim()) {
      setSubmitError('Please fill in all personal details.')
      return
    }

    if (!isValidSAPhone(phone)) {
      setSubmitError('Please enter a valid South African phone number (e.g. 082 123 4567 or +27 82 123 4567).')
      return
    }

    setIsCheckingDuplicate(true)
    try {
      const res = await fetch('/api/driver/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          driverId: createdDriverId,
        }),
      })
      const data = await res.json()
      if (data.isDuplicate) {
        setSubmitError(data.message || 'An account with this email or phone number already exists.')
        setIsCheckingDuplicate(false)
        return
      }
      setStep(2)
    } catch (err: unknown) {
      console.warn('Duplicate pre-check warning:', err)
      setStep(2)
    } finally {
      setIsCheckingDuplicate(false)
    }
  }

  const handleStep2Next = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!vehicleMake.trim() || !vehicleModel.trim() || !licensePlate.trim() || !prdpNumber.trim()) {
      setSubmitError('Please fill in all vehicle and permit details.')
      return
    }

    if (!hasSpeedpointConfirmed) {
      setSubmitError('You must confirm that you carry a Speedpoint card machine and accept Cash before continuing.')
      return
    }

    setIsCheckingDuplicate(true)
    try {
      const res = await fetch('/api/driver/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licensePlate,
          prdpNumber,
          driverId: createdDriverId,
        }),
      })
      const data = await res.json()
      if (data.isDuplicate) {
        setSubmitError(data.message || 'This vehicle license plate or PrDP permit is already registered.')
        setIsCheckingDuplicate(false)
        return
      }
      setStep(3)
    } catch (err: unknown) {
      console.warn('Duplicate pre-check warning:', err)
      setStep(3)
    } finally {
      setIsCheckingDuplicate(false)
    }
  }

  // Registers the Supabase user, profile, and uploads KYC documents
  const performAccountRegistration = async (): Promise<{ driverId: string; hasSession: boolean }> => {
    const supabase = createClient()
    let driverId: string | null = createdDriverId
    let hasSession = false

    // 0. Strict duplicate pre-check across email, phone, license plate, and PrDP
    setUploadProgressText('Verifying account uniqueness...')
    try {
      const checkRes = await fetch('/api/driver/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          licensePlate,
          prdpNumber,
          driverId,
        }),
      })
      const checkData = await checkRes.json()
      if (checkData.isDuplicate) {
        throw new Error(checkData.message || 'Duplicate driver registration detected.')
      }
    } catch (checkErr: any) {
      if (checkErr.message && !checkErr.message.includes('fetch')) {
        throw checkErr
      }
    }

    // 1. Sign up the user in Supabase Auth (strict: reject already registered)
    if (!driverId) {
      setUploadProgressText('Creating your driver account...')
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

      if (authData?.user) {
        driverId = authData.user.id
        hasSession = !!authData.session
      } else if (authError) {
        if (
          authError.message.toLowerCase().includes('already registered') ||
          authError.message.toLowerCase().includes('already exists')
        ) {
          throw new Error('An account with this email already exists. Please sign in on the Driver Login page.')
        }
        driverId = generateUuid()
        hasSession = true
      }

      if (!driverId) {
        driverId = generateUuid()
        hasSession = true
      }

      setCreatedDriverId(driverId)
      setSafeLocalStorageItem('driver_id', driverId)
      setSafeLocalStorageItem('pending_driver_email', email)
    }

    // 2. Explicit server registration with duplicate rejection
    setUploadProgressText('Verifying registration with compliance server...')
    const regRes = await fetch('/api/driver/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: driverId,
        fullName,
        email,
        phone,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        licensePlate,
        prdpNumber,
        hasLicense: !!(licenseFrontFile || licenseBackFile),
        hasPrdp: !!prdpFile,
        hasRoadworthy: !!roadworthyFile,
        isVerified: false,
        subscriptionPlan: 'pending',
      }),
    })

    const regData = await regRes.json()
    if (!regRes.ok || regData.code === 'DUPLICATE_REGISTRATION') {
      throw new Error(regData.error || 'A driver with this information is already registered.')
    }

    // Save Driver Profile locally
    await saveDriverProfile({
      id: driverId,
      fullName,
      email,
      phone,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      licensePlate,
      prdpNumber,
      hasLicense: !!(licenseFrontFile || licenseBackFile),
      hasPrdp: !!prdpFile,
      hasRoadworthy: !!roadworthyFile,
      isVerified: false,
      subscriptionActive: false,
      subscriptionPlan: 'trial',
    })

    // Store in all_registered_drivers collection for multi-driver local testing
    try {
      const existingDrivers = safeJsonParse<any[]>(getSafeLocalStorageItem('all_registered_drivers'), [])
      const safeDrivers = Array.isArray(existingDrivers) ? existingDrivers : []
      const filteredDrivers = safeDrivers.filter((d: any) => d && d.id !== driverId)
      filteredDrivers.push({
        id: driverId,
        fullName,
        email,
        phone,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        licensePlate,
        prdpNumber,
        isVerified: false,
        subscriptionPlan: 'trial',
        createdAt: new Date().toISOString(),
      })
      setSafeLocalStorageItem('all_registered_drivers', JSON.stringify(filteredDrivers))
    } catch {}

    // Dispatch immediate notification to Driver Verification Command Centre
    try {
      const signupNotice = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        driverId,
        fullName,
        phone,
        email,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        licensePlate,
        prdpNumber,
        createdAt: new Date().toISOString(),
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('solo_driver_signup_channel')
          ch.postMessage({ type: 'NEW_DRIVER_SIGNUP', alert: signupNotice })
          ch.close()
        } catch {}
      }
      setSafeLocalStorageItem('solo_new_driver_signup_alert', JSON.stringify(signupNotice))
    } catch (broadcastErr) {
      console.warn('Signup alert dispatch notice:', broadcastErr)
    }

    // 3. Upload KYC Documents & Photo Verification
    const documentsToUpload: { file: File | null; type: KycDocType; label: string }[] = [
      { file: selfieFile, type: 'driver_selfie', label: 'Driver Selfie / ID Photo' },
      { file: licenseFrontFile, type: 'license_front', label: "Driver's License (Front)" },
      { file: licenseBackFile, type: 'license_back', label: "Driver's License (Back)" },
      { file: prdpFile, type: 'prdp', label: 'PrDP Permit' },
      { file: licenseDiscFile, type: 'license_disc', label: 'Vehicle License Disc' },
      { file: vehiclePhotoFile, type: 'vehicle_photo', label: 'Vehicle Photo' },
      { file: roadworthyFile, type: 'roadworthy', label: 'Roadworthy Certificate' },
    ]

    for (const item of documentsToUpload) {
      if (item.file) {
        setUploadProgressText(`Uploading ${item.label}...`)
        try {
          await uploadDriverKycDocument(driverId, item.type, item.file, {
            fullName,
            email,
            phone,
            vehicleMake,
            vehicleModel,
            licensePlate,
            prdpNumber,
          })
        } catch (uploadErr) {
          console.warn(`Warning: Upload exception for ${item.label}:`, uploadErr)
        }
      }
    }

    setHasRegisteredAccount(true)
    return { driverId, hasSession }
  }

  // Handle Step 4 R1 Card Verification Test & 7-Day Free Trial Setup
  const handleTrialCardSetup = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // 1. Register account & upload documents if not done yet
      const { driverId, hasSession } = await performAccountRegistration()

      // 2. Initialize Paystack nominal R1.00 card tokenization transaction
      setUploadProgressText('Connecting to Paystack secure card vault for R1 test...')
      const initRes = await fetch('/api/driver/init-trial-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          email,
          fullName,
          phone,
        }),
      })

      const initData = await initRes.json()

      if (!initData.success && !initData.authorization_url) {
        throw new Error(initData.error || 'Failed to initialize Paystack card verification.')
      }

      // If platform owner is exempt, redirect directly
      if (initData.exempt) {
        alert('🎉 Platform owner verified! Permanent free subscription granted. Welcome to SOLO!')
        router.push(hasSession ? '/driver' : '/driver/login')
        return
      }

      // 3. Open Paystack Inline Modal popup for R1.00 test
      const paystackPop = (window as any).PaystackPop
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY

      if (paystackPop && publicKey && initData.reference) {
        setUploadProgressText('Waiting for card details entry...')

        const completeTrialCardSetup = (reference: string) => {
          setUploadProgressText('Verifying R1 card test & setting up 7-day free trial...')
          fetch('/api/driver/setup-trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              driverId,
              email,
              reference,
            }),
          })
            .then((res) => res.json())
            .then(async (trialData) => {
              if (trialData.success) {
                const billingDateStr = trialData.nextBillingDate 
                  ? new Date(trialData.nextBillingDate).toLocaleDateString('en-ZA', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                  : 'on the 8th day'

                // Save local driver profile with active 7-day trial
                const now = Date.now()
                const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
                await saveDriverProfile({
                  id: driverId,
                  fullName,
                  email,
                  phone,
                  vehicleMake,
                  vehicleModel,
                  vehicleYear,
                  vehicleColor,
                  licensePlate,
                  prdpNumber,
                  hasLicense: !!(licenseFrontFile || licenseBackFile),
                  hasPrdp: !!prdpFile,
                  hasRoadworthy: !!roadworthyFile,
                  isVerified: false,
                  subscriptionActive: true,
                  subscriptionPlan: 'trial',
                  trialStartedAt: now,
                  trialEndsAt: now + SEVEN_DAYS_MS,
                  cardLast4: trialData.card?.last4 || '••••',
                  cardBrand: trialData.card?.brand || 'Card',
                  cardExpMonth: trialData.card?.expMonth ? String(trialData.card.expMonth) : undefined,
                  cardExpYear: trialData.card?.expYear ? String(trialData.card.expYear) : undefined,
                  paystackSubscriptionCode: trialData.subscriptionCode,
                  nextBillingDate: trialData.nextBillingDate,
                  cardCaptured: true,
                })

                // Also update all_registered_drivers in localStorage
                try {
                  const existingDrivers = safeJsonParse<any[]>(getSafeLocalStorageItem('all_registered_drivers'), [])
                  const safeDrivers = Array.isArray(existingDrivers) ? existingDrivers : []
                  const filteredDrivers = safeDrivers.filter((d: any) => d && d.id !== driverId)
                  filteredDrivers.push({
                    id: driverId,
                    fullName,
                    email,
                    phone,
                    vehicleMake,
                    vehicleModel,
                    vehicleYear,
                    vehicleColor,
                    licensePlate,
                    prdpNumber,
                    isVerified: false,
                    subscriptionPlan: 'trial',
                    subscriptionActive: true,
                    trialStartedAt: now,
                    trialEndsAt: now + SEVEN_DAYS_MS,
                    nextBillingDate: trialData.nextBillingDate,
                    createdAt: new Date().toISOString(),
                  })
                  setSafeLocalStorageItem('all_registered_drivers', JSON.stringify(filteredDrivers))
                } catch {}

                alert(`🎉 R1.00 card test successful!\n\nYour 7-day free trial has begun. You keep 100% of your rider fares with 0% platform commission.\n\nYour first R499.00 monthly subscription billing is scheduled for the 8th day (${billingDateStr}).\n\nWelcome to SOLO!`)
                router.push(hasSession ? '/driver' : '/driver/login')
              } else {
                setSubmitError(trialData.error || 'Failed to verify trial card with Paystack.')
                setIsSubmitting(false)
                setUploadProgressText('')
              }
            })
            .catch((err: unknown) => {
              setSubmitError((err as Error).message || 'Error completing trial card verification.')
              setIsSubmitting(false)
              setUploadProgressText('')
            })
        }

        const handler = paystackPop.setup({
          key: publicKey,
          email,
          amount: 100, // R1.00 in ZAR cents
          currency: 'ZAR',
          ref: initData.reference,
          metadata: {
            driverId,
            email,
            payment_type: 'driver_trial_card_capture',
            custom_fields: [
              {
                display_name: 'Trial Duration',
                variable_name: 'trial_duration',
                value: '7 Days Free Trial (R0.00)',
              },
              {
                display_name: 'Subsequent Billing',
                variable_name: 'subsequent_billing',
                value: 'R499.00 / month starting on Day 8',
              },
              {
                display_name: 'Driver ID',
                variable_name: 'driver_id',
                value: driverId,
              },
            ],
          },
          callback: function (response: { reference: string }) {
            completeTrialCardSetup(response.reference)
          },
          onClose: function () {
            setIsSubmitting(false)
            setUploadProgressText('')
          },
        })

        handler.openIframe()
      } else if (initData.authorization_url) {
        // Fallback: Redirect to hosted checkout if inline popup script is unavailable
        setUploadProgressText('Redirecting to Paystack secure checkout...')
        window.location.href = initData.authorization_url
      } else {
        throw new Error('Unable to launch Paystack card gateway. Please try again.')
      }
    } catch (err: unknown) {
      console.error('Registration/Trial setup error:', err)
      setSubmitError((err as Error).message || 'An error occurred during card verification. Please try again.')
      setIsSubmitting(false)
      setUploadProgressText('')
    }
  }

  const hasRequiredDocs = !!(
    selfieFile &&
    licenseFrontFile &&
    licenseBackFile &&
    prdpFile &&
    licenseDiscFile &&
    vehiclePhotoFile &&
    roadworthyFile
  )

  const readyDocsCount = [
    selfieFile,
    licenseFrontFile,
    licenseBackFile,
    prdpFile,
    licenseDiscFile,
    vehiclePhotoFile,
    roadworthyFile,
  ].filter(Boolean).length

  // 7-day trial date string (Day 8 first billing) for UI display
  const trialEndDateString = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 p-8 text-white relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="flex items-center justify-between gap-3 mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <img
                src="/driver-icon-192.png"
                alt="SOLO Driver Portal"
                className="w-12 h-12 rounded-2xl object-cover border-2 border-white/30 shadow-lg shrink-0"
              />
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Drive with SOLO</h1>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm shrink-0">
              <ShieldCheck size={14} />
              Zero Commission
            </span>
          </div>
          <p className="text-blue-100 text-sm relative z-10">
            Keep 100% of your rider fares. 7-day free trial, then flat R499/month.
          </p>

          {/* Driver Payment & Equipment Requirements Strip */}
          <div className="mt-4 flex flex-wrap gap-2 relative z-10">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/15 border border-white/25 px-3 py-1 rounded-xl text-white">
              <CreditCard size={13} /> Speedpoint Machine Required (Card/Tap)
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-400/20 border border-emerald-300/30 px-3 py-1 rounded-xl text-emerald-100">
              <Banknote size={13} /> Cash Payments Accepted (100% Direct)
            </span>
          </div>
          
          <div className="flex items-center gap-2 mt-6 relative z-10">
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 3 ? 'bg-white' : 'bg-blue-400/30'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-300 ${step >= 4 ? 'bg-emerald-400' : 'bg-blue-400/30'}`}></div>
          </div>
          <div className="flex justify-between text-[11px] sm:text-xs mt-2 text-blue-100 font-medium relative z-10">
            <span>1. Personal</span>
            <span>2. Vehicle</span>
            <span>3. KYC</span>
            <span className={step === 4 ? 'text-emerald-300 font-bold' : ''}>4. 7-Day Trial</span>
          </div>
        </div>

        {/* Form Steps */}
        <div className="p-6 sm:p-8">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <form onSubmit={handleStep1Next} autoComplete="off" className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <User className="text-blue-500" /> Personal Details
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
                <input required type="text" name="driver_reg_fullname" autoComplete="off" autoCorrect="off" spellCheck={false} value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="Sipho Khumalo" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input required type="email" name="driver_reg_email" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="sipho@example.co.za" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Create Password</label>
                <input required type="password" name="driver_reg_password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="••••••••" minLength={6} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number (South Africa)</label>
                <input required type="tel" name="driver_reg_phone" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" placeholder="+27 82 123 4567" />
              </div>
              <button type="submit" disabled={isCheckingDuplicate} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold p-4 rounded-2xl mt-6 flex justify-center items-center gap-2 active:scale-95 transition shadow-lg shadow-blue-500/20">
                {isCheckingDuplicate ? 'Checking Availability...' : 'Continue to Vehicle & Payment Setup'} <ChevronRight size={18} />
              </button>
            </form>
          )}

          {/* STEP 2: Vehicle & Speedpoint */}
          {step === 2 && (
            <form onSubmit={handleStep2Next} className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6 text-xl font-bold border-b border-gray-100 dark:border-gray-800 pb-4">
                <Car className="text-blue-500" /> Vehicle &amp; Payment Equipment
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Model Year</label>
                  <input 
                    required 
                    type="number" 
                    min="2000" 
                    max={new Date().getFullYear() + 1} 
                    value={vehicleYear} 
                    onChange={e => setVehicleYear(parseInt(e.target.value) || new Date().getFullYear())} 
                    className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" 
                    placeholder="2022" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Vehicle Color</label>
                  <input 
                    required 
                    type="text" 
                    value={vehicleColor} 
                    onChange={e => setVehicleColor(e.target.value)} 
                    className="w-full p-3.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 focus:border-blue-500 rounded-xl transition-all outline-none text-sm" 
                    placeholder="e.g. Silver / White" 
                  />
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

              {/* Mandatory Speedpoint Machine & Cash Payment Requirement Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/60 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0 shadow-sm">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-emerald-950 dark:text-emerald-100">
                        Driver Requirement: Speedpoint Machine &amp; Cash
                      </h3>
                      <span className="text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        Mandatory
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                      Because SOLO charges <strong>0% commission</strong>, riders pay you <strong>100% directly</strong> at the end of every trip. All SOLO drivers are required to carry a working <strong>Speedpoint machine</strong> (e.g. Yoco, iKhokha, Vodapay, or bank POS) to accept card/tap payments, while <strong>Cash payment</strong> remains a standard option for riders.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-3 pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 cursor-pointer select-none">
                  <input
                    required
                    type="checkbox"
                    checked={hasSpeedpointConfirmed}
                    onChange={(e) => setHasSpeedpointConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-emerald-600 shrink-0"
                  />
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-snug">
                    I confirm I have a working Speedpoint / card machine in my vehicle to accept card payments, and I also accept Cash payments from riders.
                  </span>
                </label>
              </div>

              <div className="flex gap-4 mt-6">
                <button type="button" onClick={() => setStep(1)} className="w-1/3 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
                  Back
                </button>
                <button type="submit" disabled={isCheckingDuplicate} className="w-2/3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold p-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition shadow-lg shadow-blue-500/20">
                  {isCheckingDuplicate ? 'Verifying Details...' : 'Continue to KYC Documents'} <ChevronRight size={18} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: KYC Documents */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
                <div className="flex items-center gap-3 text-xl font-bold">
                  <FileText className="text-blue-500" /> Compliance &amp; Verification
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  hasRequiredDocs
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40'
                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/50'
                }`}>
                  {readyDocsCount} / 7 Required Ready
                </span>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                To prevent fraud and maintain passenger safety, SOLO verifies driver identity and vehicle road legality prior to platform activation. You can take live photos directly using your phone/device camera or upload clear document files.
              </p>

              {/* 1. DRIVER IDENTIFICATION & ANTI-IMPERSONATION */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  <User size={15} className="text-blue-500" />
                  <span>1. Driver Identity Verification (Anti-Impersonation)</span>
                </div>

                {/* 1. Driver Live Selfie */}
                <KycDocumentUploader
                  docType="driver_selfie"
                  selectedFile={selfieFile}
                  onFileSelect={setSelfieFile}
                  disabled={isSubmitting}
                />

                {/* 2. Driver's License Front */}
                <KycDocumentUploader
                  docType="license_front"
                  selectedFile={licenseFrontFile}
                  onFileSelect={setLicenseFrontFile}
                  disabled={isSubmitting}
                />

                {/* 3. Driver's License Back */}
                <KycDocumentUploader
                  docType="license_back"
                  selectedFile={licenseBackFile}
                  onFileSelect={setLicenseBackFile}
                  disabled={isSubmitting}
                />

                {/* 4. PrDP Document */}
                <KycDocumentUploader
                  docType="prdp"
                  selectedFile={prdpFile}
                  onFileSelect={setPrdpFile}
                  disabled={isSubmitting}
                />
              </div>

              {/* 2. VEHICLE VERIFICATION & ROAD LEGALITY */}
              <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 pb-1 text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  <Car size={15} className="text-emerald-500" />
                  <span>2. Vehicle Verification &amp; Road Legality</span>
                </div>

                {/* 5. Vehicle License Disc */}
                <KycDocumentUploader
                  docType="license_disc"
                  selectedFile={licenseDiscFile}
                  onFileSelect={setLicenseDiscFile}
                  disabled={isSubmitting}
                />

                {/* 6. Vehicle Exterior Photo */}
                <KycDocumentUploader
                  docType="vehicle_photo"
                  selectedFile={vehiclePhotoFile}
                  onFileSelect={setVehiclePhotoFile}
                  disabled={isSubmitting}
                />

                {/* 7. Roadworthy Certificate */}
                <KycDocumentUploader
                  docType="roadworthy"
                  selectedFile={roadworthyFile}
                  onFileSelect={setRoadworthyFile}
                  disabled={isSubmitting}
                />
              </div>

              {!hasRequiredDocs && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                  <AlertCircle size={16} className="shrink-0 text-amber-600" />
                  <span>Please capture or upload all 7 required items above before proceeding to the 7-day trial step.</span>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40">
                <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed text-center font-medium">
                  Next: Securely link your card for your 7-day free trial. You won&apos;t be billed today.
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
                  type="button" 
                  onClick={() => setStep(4)}
                  disabled={!hasRequiredDocs || isSubmitting}
                  className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-2xl flex justify-center items-center gap-2 transition disabled:opacity-50 shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  <span>Continue to Payment &amp; Subscription ({readyDocsCount}/7)</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: 7-Day Free Trial & R1 Card Verification Test */}
          {step === 4 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-2">
                <div className="flex items-center gap-3 text-xl font-bold">
                  <CreditCard className="text-emerald-500" /> 7-Day Free Trial &amp; Card Test
                </div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 rounded-full flex items-center gap-1">
                  <Sparkles size={13} /> 0% Commission
                </span>
              </div>

              {/* 7-Day Free Trial & R1 Card Test Breakdown */}
              <div className="bg-gradient-to-br from-slate-900 to-zinc-950 text-white p-5 rounded-2xl shadow-xl border border-zinc-800 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-0.5 rounded-full">
                      7-Day Free Trial + R1 Card Test
                    </span>
                    <h3 className="text-xl font-black mt-1">Platform Membership</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-emerald-400">R1.00</span>
                    <span className="block text-[11px] text-zinc-400">Card Test Today</span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-zinc-800 text-xs">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-400" />
                      <span>Free Trial Duration</span>
                    </span>
                    <span className="font-bold text-emerald-400">7 Days Free (R0.00 / week)</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-2">
                      <CreditCard size={14} className="text-blue-400" />
                      <span>Card Verification Test</span>
                    </span>
                    <span className="font-bold text-white">R1.00 (Once-off 3D-Secure Test)</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-2">
                      <Calendar size={14} className="text-blue-400" />
                      <span>First Recurring Billing</span>
                    </span>
                    <span className="font-bold text-white">R499.00 on Day 8 ({trialEndDateString})</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      <span>Rider Fares Kept</span>
                    </span>
                    <span className="font-bold text-emerald-400">100% Direct (0.0% Cut)</span>
                  </div>

                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-2">
                      <ShieldCheck size={14} className="text-emerald-400" />
                      <span>Payment Security</span>
                    </span>
                    <span className="font-bold text-white">Bank-Grade 3D-Secure (Paystack)</span>
                  </div>
                </div>
              </div>

              {/* Policy & Protection Guarantee */}
              <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-2xl border border-gray-100 dark:border-zinc-800/60 space-y-2 text-xs text-gray-600 dark:text-gray-300">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <p>
                    <strong>7-Day Free Trial Activated Today:</strong> Complete the R1.00 card test to verify your payment method. You will enjoy 7 full days of zero platform fees and 0% commission. On the 8th day ({trialEndDateString}), your standard R499.00/month subscription will begin.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Lock size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <p>
                    <strong>Cancel Anytime:</strong> You can manage or cancel your subscription before Day 8 with zero monthly fee charged.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 mt-6">
                <button 
                  type="button" 
                  onClick={() => setStep(3)} 
                  disabled={isSubmitting}
                  className="w-1/3 bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold p-4 rounded-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition disabled:opacity-50"
                >
                  Back
                </button>
                <button 
                  type="button" 
                  onClick={handleTrialCardSetup}
                  disabled={isSubmitting}
                  className="w-2/3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold p-4 rounded-2xl flex justify-center items-center gap-2 transition disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{uploadProgressText || 'Connecting to Paystack...'}</span>
                    </div>
                  ) : (
                    <>
                      <CreditCard size={18} />
                      <span>Pay R1.00 Test &amp; Start 7-Day Trial</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="text-center p-4 text-xs text-gray-500 border-t border-gray-100 dark:border-gray-800">
          Already registered? <Link href="/driver/login" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">Sign in to Driver Portal</Link>
        </div>
      </div>
    </div>
  )
}
