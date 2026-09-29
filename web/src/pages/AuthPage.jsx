import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { useApp } from '../context/AppContext'

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const navigate = useNavigate()
  const { updateSettings } = useApp()

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
    const colors = ['', 'bg-danger', 'bg-warn', 'bg-brand', 'bg-green-500']
    return { score, label: labels[score], color: colors[score] }
  }, [password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Simple auth simulation - in production this would call an API
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Store user info
      updateSettings({ userName: name || email.split('@')[0] })
      if (rememberMe) {
        localStorage.setItem('wattwise.rememberEmail', email)
      }
      localStorage.setItem('wattwise.isAuthenticated', 'true')
      
      navigate('/dashboard')
    } catch (err) {
      setError('Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address to reset your password')
      return
    }
    setIsLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setResetEmailSent(true)
    } finally {
      setIsLoading(false)
    }
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center p-4 bg-bg">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-brand-soft text-brand mb-4">
              <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-fg">Reset Password</h1>
            <p className="text-fg-muted mt-2">We'll send you a reset link</p>
          </div>

          <Card className="card-pad">
            {resetEmailSent ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center size-16 rounded-full bg-green-100 text-green-600 mb-4">
                  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-fg mb-2">Check your email</h3>
                <p className="text-fg-muted mb-6">We've sent a password reset link to {email}</p>
                <Button 
                  variant="primary" 
                  onClick={() => { setShowForgotPassword(false); setResetEmailSent(false); }}
                >
                  Back to Sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                {error && (
                  <div className="p-3 rounded-lg bg-danger-soft text-danger text-sm">{error}</div>
                )}
                <Field label="Email address">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-fg-muted" />
                    <input
                      type="email"
                      className="input pl-10"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </Field>
                <Button type="submit" variant="primary" className="btn-block" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full text-center text-sm text-brand hover:underline"
                >
                  Back to sign in
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center p-4 bg-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-brand-soft text-brand mb-4">
            <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-fg">WattWise</h1>
          <p className="text-fg-muted mt-2">Smart energy management for your home</p>
        </div>

        <Card className="card-pad">
          <form onSubmit={handleSubmit} className="space-y-5">
            <h2 className="text-xl font-semibold text-fg">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>

            {error && (
              <div className="p-3 rounded-lg bg-danger-soft text-danger text-sm">
                {error}
              </div>
            )}

            {!isLogin && (
              <Field label="Full name">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-fg-muted" />
                  <input
                    type="text"
                    className="input pl-10"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </Field>
            )}

            <Field label="Email address">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-fg-muted" />
                <input
                  type="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-fg-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {!isLogin && password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-fg-muted">Password strength</span>
                    <span className={`text-xs font-semibold ${passwordStrength.score > 2 ? 'text-green-600' : passwordStrength.score > 1 ? 'text-warn' : 'text-danger'}`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[1,2,3,4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${i <= passwordStrength.score ? passwordStrength.color : 'bg-surface-3'}`} />
                    ))}
                  </div>
                </div>
              )}
            </Field>

            {isLogin && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 rounded border-border text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-fg-muted">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-brand hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="btn-block"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-line">
            <p className="text-center text-fg-muted text-sm">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError('') }}
                className="text-brand font-semibold hover:underline"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </Card>

        <p className="text-center text-fg-subtle text-xs mt-6">
          By continuing, you agree to WattWise's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}