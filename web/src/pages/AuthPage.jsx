import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, User, Zap } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'

export function AuthPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { updateSettings } = useApp()
  const [isLogin, setIsLogin] = useState(params.get('mode') !== 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setIsLogin(params.get('mode') !== 'signup'), [params])

  const passwordStrength = useMemo(() => {
    let score = 0
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    return score
  }, [password])

  const switchMode = () => {
    setIsLogin((value) => !value)
    setError('')
    setPassword('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const result = isLogin
        ? await api.auth.login(normalizedEmail, password)
        : await api.auth.register(name.trim(), normalizedEmail, password)

      updateSettings({
        userName: result.user.name,
        userEmail: result.user.email,
        householdName: result.household?.name || 'My Home',
      })

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || 'We could not open your account. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0 grid-bg opacity-60" aria-hidden="true" />
      <div className="absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-48 -left-40 size-[34rem] rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_440px] lg:px-10">
        <section className="hidden lg:block">
          <Link to="/" className="inline-flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-fg text-bg"><Zap className="size-4" fill="currentColor" /></span>
            WattWise
          </Link>
          <div className="mt-16 animate-fade-up">
            <p className="text-xs font-black uppercase tracking-[.18em] text-brand">A calmer way to understand your home</p>
            <h1 className="mt-4 text-6xl font-black leading-[.98] tracking-[-.055em]">Know your energy.<br /><span className="text-gradient">Not just your bill.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-fg-muted">Create your home once. WattWise keeps your household profile and uses it to make every answer more useful.</p>
            <div className="mt-8 space-y-3">
              {['See what is driving your usage', 'Estimate what your next bill could look like', 'Try savings ideas before changing anything'].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-semibold text-fg-muted"><span className="grid size-7 place-items-center rounded-full bg-accent-soft text-accent"><Check className="size-3.5" /></span>{item}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="animate-fade-up">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg lg:hidden"><ArrowLeft className="size-4" /> Back to WattWise</Link>
          <div className="rounded-[2rem] border border-line bg-surface/90 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-8">
            <div className="mb-7 lg:hidden"><span className="grid size-11 place-items-center rounded-2xl bg-fg text-bg"><Zap className="size-5" fill="currentColor" /></span><h1 className="mt-4 text-2xl font-black">WattWise</h1></div>
            <div className="mb-7">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-[.14em] text-brand">{isLogin ? 'Welcome back' : 'Your home starts here'}</p><h2 className="mt-1 text-3xl font-black tracking-tight">{isLogin ? 'Sign in' : 'Create your account'}</h2></div>
                <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><Lock className="size-5" /></span>
              </div>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{isLogin ? 'Your household is waiting for you.' : 'A minute now, clearer energy decisions later.'}</p>
            </div>

            {error && <div role="alert" className="mb-5 rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-medium text-danger animate-fade-up">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && <Field label="Your name"><div className="relative"><User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><input className="input pl-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required /></div></Field>}
              <Field label="Email"><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><input className="input pl-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></Field>
              <Field label="Password"><div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><input className="input pl-10 pr-11" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={8} required /><button type="button" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fg-subtle hover:bg-surface-3 hover:text-fg" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{!isLogin && password && <div className="mt-2 flex gap-1">{[1,2,3,4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength ? 'bg-accent' : 'bg-surface-3'}`} />)}</div>}</Field>
              <Button type="submit" variant="primary" size="lg" className="btn-block rounded-xl" disabled={isLoading}>{isLoading ? 'Opening your home…' : isLogin ? <>Open my WattWise <ArrowRight className="size-4" /></> : <>Build my home <ArrowRight className="size-4" /></>}</Button>
            </form>

            <div className="mt-6 border-t border-line pt-6 text-center"><p className="text-sm text-fg-muted">{isLogin ? 'New to WattWise?' : 'Already set up?'}{' '}<button type="button" onClick={switchMode} className="font-bold text-brand hover:underline">{isLogin ? 'Create an account' : 'Sign in'}</button></p></div>
          </div>
          <p className="mt-4 text-center text-[11px] leading-5 text-fg-subtle">Your account is secured by WattWise and your session is stored in a secure browser cookie. Your household profile belongs to your account.</p>
        </section>
      </div>
    </main>
  )
}
