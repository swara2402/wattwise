import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Home, Users, Plug, Zap } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import { PROPERTY_TYPES, APPLIANCE_TYPES, DEFAULT_APPLIANCES } from '../lib/constants'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { updateSettings, setAppliances } = useApp()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  
  // Step 1: Property type
  const [selectedProperty, setSelectedProperty] = useState('3 BHK Apartment')
  
  // Step 2: Household size
  const [householdSize, setHouseholdSize] = useState(4)
  
  // Step 3: Selected appliances
  const [selectedAppliances, setSelectedAppliances] = useState(['ac', 'fridge', 'tv', 'washing_machine', 'water_heater', 'fan', 'lights'])

  const toggleAppliance = (value) => {
    setSelectedAppliances(prev => 
      prev.includes(value) 
        ? prev.filter(a => a !== value)
        : [...prev, value]
    )
  }

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      // Create appliances based on user selection
      const appliances = []
      let idCounter = 1
      selectedAppliances.forEach(type => {
        const applianceType = APPLIANCE_TYPES.find(a => a.value === type)
        if (applianceType) {
          // Find default appliance if it exists to get proper naming
          const defaultApp = DEFAULT_APPLIANCES.find(d => d.type === type)
          appliances.push({
            id: `a${idCounter++}`,
            name: defaultApp?.name || applianceType.label,
            type: type,
            powerWatts: applianceType.defaultWatts,
            quantity: 1,
            currentDailyHours: applianceType.defaultHours,
            proposedDailyHours: applianceType.defaultHours,
            daysPerMonth: 30,
          })
        }
      })

      // If no appliances selected, add some defaults
      if (appliances.length === 0) {
        appliances.push(...DEFAULT_APPLIANCES.slice(0, 3))
      }

      // Always update local context first
      setAppliances(appliances)
      updateSettings({
        propertyType: selectedProperty,
        householdMembers: householdSize,
      })

      // Attempt backend sync if authenticated, but do not block user if offline/unauthenticated
      try {
        await api.auth.updateHousehold({
          property_type: selectedProperty,
          household_members: householdSize,
        })
        await api.auth.saveState({ appliances, scenarios: [] })
      } catch (syncErr) {
        console.warn('Backend sync failed during onboarding, saving locally:', syncErr)
      }

      // Always navigate to dashboard
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('Onboarding error:', err)
      navigate('/dashboard', { replace: true })
    } finally {
      setIsLoading(false)
    }
  }

  const nextStep = () => {
    if (step < 3) {
      setStep(step + 1)
    } else {
      handleComplete()
    }
  }

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0 grid-bg opacity-60" aria-hidden="true" />
      <div className="absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-48 -left-40 size-[34rem] rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      
      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-5 py-8">
        {/* Logo */}
        <div className="mb-10 flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-fg text-bg"><Zap className="size-4" fill="currentColor" /></span>
          WattWise
        </div>

        {/* Progress indicator */}
        <div className="mb-10 flex items-center gap-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`flex size-10 items-center justify-center rounded-full text-sm font-bold transition-all ${
                s === step 
                  ? 'bg-brand text-white shadow-lg shadow-brand/20' 
                  : s < step 
                    ? 'bg-green-500 text-white' 
                    : 'bg-surface-3 text-fg-subtle'
              }`}>
                {s < step ? <Check className="size-5" /> : s}
              </div>
              {s < 3 && <div className={`ml-3 h-1 w-16 rounded-full transition-all ${s < step ? 'bg-green-500' : 'bg-surface-3'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Home type */}
        {step === 1 && (
          <div className="w-full animate-fade-up">
            <div className="mb-8 text-center">
              <span className="grid mx-auto size-16 place-items-center rounded-3xl bg-brand-soft text-brand mb-5"><Home className="size-7" /></span>
              <p className="text-xs font-black uppercase tracking-[.14em] text-brand">Step 1 of 3</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Tell us about your home</h2>
              <p className="mt-3 text-fg-muted">Select the type of property you live in</p>
            </div>
            <div className="grid gap-3">
              {PROPERTY_TYPES.map((property) => (
                <button
                  key={property}
                  type="button"
                  onClick={() => setSelectedProperty(property)}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all hover:border-brand/50 ${
                    selectedProperty === property 
                      ? 'border-brand bg-brand-soft/50 ring-2 ring-brand/20' 
                      : 'border-line bg-surface/80'
                  }`}
                >
                  <span className="font-semibold">{property}</span>
                  {selectedProperty === property && <Check className="size-5 text-brand" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Household size */}
        {step === 2 && (
          <div className="w-full animate-fade-up">
            <div className="mb-8 text-center">
              <span className="grid mx-auto size-16 place-items-center rounded-3xl bg-accent-soft text-accent mb-5"><Users className="size-7" /></span>
              <p className="text-xs font-black uppercase tracking-[.14em] text-accent">Step 2 of 3</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">How many people live there?</h2>
              <p className="mt-3 text-fg-muted">Tell us the size of your household</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setHouseholdSize(num)}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-6 transition-all hover:border-accent/50 ${
                    householdSize === num 
                      ? 'border-accent bg-accent-soft/50 ring-2 ring-accent/20' 
                      : 'border-line bg-surface/80'
                  }`}
                >
                  <span className="text-4xl font-black">{num}</span>
                  <span className="mt-1 text-sm text-fg-muted">{num === 4 ? '4+' : num}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Appliances */}
        {step === 3 && (
          <div className="w-full animate-fade-up">
            <div className="mb-8 text-center">
              <span className="grid mx-auto size-16 place-items-center rounded-3xl bg-violet-500/10 text-violet-500 mb-5"><Plug className="size-7" /></span>
              <p className="text-xs font-black uppercase tracking-[.14em] text-violet-500">Step 3 of 3</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">What's in your home?</h2>
              <p className="mt-3 text-fg-muted">Select the appliances you own</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {APPLIANCE_TYPES.slice(0, 9).map((appliance) => {
                const Icon = appliance.icon
                return (
                  <button
                    key={appliance.value}
                    type="button"
                    onClick={() => toggleAppliance(appliance.value)}
                    className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-all hover:border-violet-500/50 ${
                      selectedAppliances.includes(appliance.value)
                        ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/20'
                        : 'border-line bg-surface/80'
                    }`}
                  >
                    <Icon className={`size-6 ${selectedAppliances.includes(appliance.value) ? 'text-violet-500' : 'text-fg-subtle'}`} />
                    <span className="text-xs font-semibold leading-tight">{appliance.label}</span>
                    {selectedAppliances.includes(appliance.value) && <Check className="absolute right-2 top-2 size-4 text-violet-500" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-10 flex w-full gap-3">
          {step > 1 && (
            <Button type="button" variant="ghost" size="lg" className="flex-1" onClick={prevStep}>
              Back
            </Button>
          )}
          <Button 
            type="button" 
            variant="primary" 
            size="lg" 
            className="flex-1" 
            onClick={nextStep}
            disabled={isLoading}
          >
            {step === 3 ? (isLoading ? 'Setting up your home...' : <>Welcome home! <Check className="size-4" /></>) : <>Continue <ArrowRight className="size-4" /></>}
          </Button>
        </div>
      </div>
    </main>
  )
}