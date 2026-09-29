import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Gauge,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react'
import './landing.css'

const FEATURES = [
  { icon: Gauge, title: 'Know your usage', text: 'See where your electricity goes without staring at a spreadsheet.' },
  { icon: Wallet, title: 'Know your bill', text: 'Turn your usage into a simple, understandable cost estimate.' },
  { icon: Lightbulb, title: 'Find easy savings', text: 'Get practical ideas that fit the appliances you already own.' },
  { icon: ShieldCheck, title: 'Catch unusual days', text: 'WattWise highlights patterns that deserve a second look.' },
]

const STEPS = [
  ['01', 'Tell us about your home', 'Add a few appliances and your electricity rate.'],
  ['02', 'Let WattWise do the maths', 'Your energy model turns everyday usage into useful answers.'],
  ['03', 'Make one small change', 'Try a saving idea first, then decide what is worth keeping.'],
]

export function LandingPage() {
  return (
    <main className="landing min-h-dvh overflow-hidden bg-bg text-fg">
      <div className="landing-noise" aria-hidden="true" />
      <div className="landing-orb landing-orb-a" aria-hidden="true" />
      <div className="landing-orb landing-orb-b" aria-hidden="true" />
      <div className="landing-orb landing-orb-c" aria-hidden="true" />

      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex items-center gap-2.5" aria-label="WattWise home">
          <span className="grid size-10 place-items-center rounded-2xl bg-fg text-bg shadow-lg shadow-fg/10"><Zap className="size-5" fill="currentColor" /></span>
          <span className="text-lg font-extrabold tracking-tight">WattWise</span>
        </Link>
        <div className="flex items-center gap-2">
          <a href="#how" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg sm:inline-flex">How it works</a>
          <Link to="/login" className="btn btn-outline btn-sm rounded-full">Sign in</Link>
          <Link to="/login?mode=signup" className="btn btn-primary btn-sm rounded-full px-4">Get started <ArrowRight className="size-3.5" /></Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
          <div className="landing-reveal">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/75 px-3 py-1.5 text-xs font-bold text-fg-muted shadow-sm backdrop-blur"><span className="size-1.5 animate-pulse rounded-full bg-accent" />Built for real homes, not ML dashboards</div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-[5.6rem]">Your energy.<br /><span className="text-gradient">Finally simple.</span></h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-fg-muted sm:text-xl">WattWise turns electricity data into three things you actually care about: what you used, what it costs, and what you can do about it.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login?mode=signup" className="btn btn-primary btn-lg rounded-full px-7 shadow-xl shadow-brand/20">Start with your home <ArrowRight className="size-4" /></Link>
              <a href="#features" className="btn btn-outline btn-lg rounded-full px-7">See what it does <ChevronRight className="size-4" /></a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-fg-subtle">{['No energy degree required', 'Simple household controls', 'Savings before decisions'].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-accent" />{item}</span>)}</div>
          </div>

          <div className="landing-dashboard-wrap landing-float" aria-label="WattWise dashboard preview">
            <div className="landing-dashboard-glow" />
            <div className="landing-dashboard relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/80 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white"><Zap className="size-4" fill="currentColor" /></span><span className="text-sm font-bold">My Home</span></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600">● Looking good</span></div>
              <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-semibold text-white/55">Estimated monthly bill</p><div className="mt-2 flex items-end justify-between"><span className="text-4xl font-black tracking-tight">₹2,840</span><span className="mb-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-bold text-emerald-300">↓ 12%</span></div><div className="mt-5 h-20 overflow-hidden rounded-xl bg-white/5 p-2"><svg viewBox="0 0 500 90" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wattFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity=".35"/><stop offset="1" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs><path d="M0 65 C40 58 50 70 85 52 S130 40 165 58 S210 68 245 44 S290 30 325 49 S370 64 405 34 S455 22 500 28 V90 H0Z" fill="url(#wattFill)"/><path d="M0 65 C40 58 50 70 85 52 S130 40 165 58 S210 68 245 44 S290 30 325 49 S370 64 405 34 S455 22 500 28" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round"/></svg></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">This week</p><p className="mt-2 text-xl font-black">46.8 kWh</p><p className="mt-1 text-xs font-semibold text-emerald-600">12% lower</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Possible savings</p><p className="mt-2 text-xl font-black">₹420</p><p className="mt-1 text-xs font-semibold text-slate-500">this month</p></div></div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600"><Lightbulb className="size-4" /></span><div><p className="text-xs font-bold text-slate-900">One easy win</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">Your AC is doing more work than usual. Try 24–25°C tonight.</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="max-w-2xl landing-reveal"><p className="text-xs font-black uppercase tracking-[.18em] text-brand">Everything useful. Nothing noisy.</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">A smarter energy app that speaks human.</h2></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.map(({ icon: Icon, title, text }, index) => <article key={title} className="landing-card card-hover rounded-3xl border border-line bg-surface p-6" style={{ animationDelay: `${index * 90}ms` }}><span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon className="size-5" /></span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-fg-muted">{text}</p></article>)}</div>
      </section>

      <section id="how" className="relative z-10 border-y border-line bg-surface/65"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-28"><div><p className="text-xs font-black uppercase tracking-[.18em] text-accent">How WattWise works</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-5xl">Three steps. Then less stress.</h2><p className="mt-5 max-w-md text-base leading-7 text-fg-muted">The complicated part stays behind the curtain. You get the useful answer on the other side.</p></div><div className="space-y-3">{STEPS.map(([number, title, body]) => <div key={number} className="group flex gap-5 rounded-3xl border border-line bg-bg p-5 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-pop sm:p-6"><span className="text-sm font-black text-brand">{number}</span><div><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-fg-muted">{body}</p></div></div>)}</div></div></section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28"><div className="relative overflow-hidden rounded-[2.25rem] bg-slate-950 px-6 py-14 text-center text-white shadow-2xl sm:px-10"><div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 20% 20%, #38bdf8 0, transparent 28%), radial-gradient(circle at 80% 80%, #34d399 0, transparent 30%)' }} /><div className="relative"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/10"><Sparkles className="size-5 text-emerald-300" /></span><h2 className="mx-auto mt-5 max-w-2xl text-4xl font-black tracking-[-.04em] sm:text-5xl">Your next bill should not be a surprise.</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base">Set up your home once. Then come back whenever you want a clearer answer.</p><Link to="/login?mode=signup" className="btn btn-lg mt-7 rounded-full bg-white px-7 text-slate-950 shadow-xl hover:bg-white/90">Build my home <ArrowRight className="size-4" /></Link></div></div></section>

      <footer className="relative z-10 border-t border-line px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 font-bold text-fg"><Zap className="size-4 text-brand" fill="currentColor" /> WattWise</div><p>Smart energy decisions, without the spreadsheet headache.</p><Link to="/login" className="font-semibold text-brand hover:underline">Open WattWise →</Link></div></footer>
    </main>
  )
}
