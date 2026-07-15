// src/pages/public/Home.jsx
//
// Public marketing homepage. No auth required.
// Sections: hero → about/insights → features → healthcare tips →
// vaccination timeline → join-as-doctor CTA → contact → footer.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, Calendar, MessageSquare, Syringe, Stethoscope,
  Baby, TrendingUp, Droplet, Moon, Utensils, Sparkles, ArrowRight,
  CheckCircle2, Mail, Phone, MapPin, Menu, X, BadgeCheck, FileLock2,
} from 'lucide-react'
import Logo from '../../components/Logo'
import Button from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#healthcare-tips', label: 'Healthcare Tips' },
  { href: '#contact', label: 'Contact' },
]

const FEATURES = [
  { icon: Baby,        title: 'Infant Health Tracking',  text: 'Monitor height, weight, and development milestones with clinical-grade analytics charts.' },
  { icon: Syringe,      title: 'Vaccination Management',  text: 'Stay organized with automated schedule generation and intelligent reminder notifications.' },
  { icon: Calendar,     title: 'Smart Appointments',      text: 'Integrated booking with certified OB-GYN and Pediatric specialists within your medical network.' },
  { icon: Stethoscope,  title: 'Doctor Management',       text: 'A secure, HIPAA-ready professional portal for seamless patient data synchronization.' },
]

const TIPS = [
  { icon: Droplet,    title: 'Breastfeeding',    text: 'Techniques and nutritional advice for a healthy feeding experience.' },
  { icon: Moon,        title: 'Sleep Hygiene',    text: 'Establishing safe and consistent sleeping patterns for infants.' },
  { icon: Utensils,    title: 'Maternal Nutrition', text: 'Optimizing your diet for recovery and infant development.' },
  { icon: Syringe,     title: 'Immunization',     text: 'Understanding the critical timeline for disease prevention.' },
  { icon: TrendingUp,  title: 'Growth Tracking',  text: 'Recognizing physical and cognitive milestones in early development.' },
  { icon: Sparkles,    title: 'Infant Hygiene',   text: 'Best practices for skin care, bathing, and infection prevention.' },
]

const TIMELINE = [
  { step: 1, when: 'At Birth',  title: 'BCG, HepB0, OPV0',            text: 'Critical first protection' },
  { step: 2, when: '6 Weeks',   title: 'Pentavalent 1, IPV1, Rota1',   text: 'Early infant series' },
  { step: 3, when: '6 Months',  title: 'OPV3, HepB3, Vit A',           text: 'Immunity booster' },
  { step: 4, when: '1 Year',    title: 'MMR 1, Varicella',             text: 'Viral protection' },
  { step: 5, when: '4 Years',   title: 'DPT Booster, MMR 2',           text: 'Pre-school readiness' },
]

export default function Home() {
  const navigate = useNavigate()
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [contact, setContact] = useState({ name: '', email: '', message: '' })
  const [contactSent, setContactSent] = useState(false)

  const handleNewsletter = (e) => {
    e.preventDefault()
    if (!newsletterEmail) return
    toast.success('Thanks for subscribing!')
    setNewsletterEmail('')
  }

  const handleContact = (e) => {
    e.preventDefault()
    if (!contact.name || !contact.email || !contact.message) {
      toast.error('Please fill in all fields.')
      return
    }
    // TODO: wire to backend once contact-message storage is decided.
    setContactSent(true)
    toast.success('Message sent — we\u2019ll get back to you soon.')
    setContact({ name: '', email: '', message: '' })
  }

  return (
    <div id="home" className="min-h-screen bg-white text-slate-900">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Logo size={34} withWordmark wordmarkClass="text-base" />

          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-brand-700 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>Sign In</Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/register/mother')}>Register Mother</Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/register/doctor')}>
              Join as Doctor
            </Button>
          </div>

          <button className="lg:hidden p-2 text-slate-600" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-slate-100 px-5 py-4 flex flex-col gap-3 bg-white">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-sm font-medium text-slate-700">
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>Sign In</Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/register/mother')}>Register Mother</Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/register/doctor')}>Join as Doctor</Button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-brand-50" />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
              <ShieldCheck size={14} /> Trusted Healthcare Partner
            </span>
            <h1 className="mt-5 font-display text-5xl sm:text-6xl leading-[1.05] text-slate-900">
              NurtureX Healthcare Management System
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-lg">
              Helping mothers and healthcare professionals provide safer, smarter, and more connected care for every new beginning.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate('/register/mother')}>
                Register Mother <ArrowRight size={18} className="ml-1" />
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate('/register/doctor')}>
                Join as Doctor
              </Button>
            </div>
          </div>

          <div className="relative aspect-[4/3] rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 shadow-lift overflow-hidden">
            <img
              src="/images/hero.jpg"
              alt="Mother and baby using NurtureX"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* subtle tint so the gradient's warmth still shows through the photo */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-transparent" />
          </div>
        </div>
      </section>

      {/* ── About / Smart Clinical Insights ── */}
      <section id="about" className="max-w-7xl mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div className="order-2 lg:order-1 relative aspect-[4/3] rounded-3xl bg-brand-50 border border-brand-100 shadow-card overflow-hidden">
          <img
            src="/images/dashboard-preview.png"
            alt="NurtureX dashboard preview"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
        <div className="order-1 lg:order-2">
          <h2 className="font-display text-4xl text-slate-900">Smart Clinical Insights at Your Fingertips</h2>
          <p className="mt-4 text-slate-600">
            Our integrated platform connects patient data directly with healthcare providers, ensuring real-time monitoring and proactive intervention when it matters most.
          </p>
          <ul className="mt-6 space-y-3">
            {['Real-time health telemetry', 'Automated milestone alerts', 'Direct secure messaging with clinicians'].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-slate-700 font-medium">
                <CheckCircle2 size={18} className="text-brand-600 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Why Choose Our Platform ── */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-4xl text-center text-slate-900">Why Choose Our Platform</h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-100 shadow-soft hover:shadow-card transition-shadow p-6">
                <div className="w-11 h-11 rounded-xl bg-brand-50 grid place-items-center text-brand-700 mb-4">
                  <f.icon size={22} />
                </div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Healthcare Tips ── */}
      <section id="healthcare-tips" className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <h2 className="font-display text-4xl text-slate-900">Essential Healthcare Tips</h2>
          <p className="text-slate-500 text-sm">Expert-curated advice for every stage of your journey.</p>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TIPS.map((t) => (
            <div key={t.title} className="flex items-start gap-4 p-5 rounded-2xl border border-slate-100 hover:border-brand-100 hover:bg-brand-50/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 grid place-items-center shrink-0">
                <t.icon size={19} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">{t.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{t.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vaccination Timeline ── */}
      <section className="bg-brand-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <h2 className="font-display text-4xl text-center">Vaccination Timeline</h2>
          <p className="mt-3 text-center text-brand-200 text-sm max-w-xl mx-auto">
            Stay on track with your infant's vital immunization steps from day one to year four.
          </p>
          <div className="mt-14 grid sm:grid-cols-5 gap-8 relative">
            <div className="hidden sm:block absolute top-6 left-[10%] right-[10%] h-px bg-white/15" />
            {TIMELINE.map((s) => (
              <div key={s.step} className="text-center relative">
                <div className="mx-auto w-12 h-12 rounded-full bg-white text-brand-800 font-bold grid place-items-center shadow-lift">
                  {s.step}
                </div>
                <p className="mt-4 font-semibold text-sm">{s.when}</p>
                <p className="mt-1 text-xs text-brand-200">{s.title}</p>
                <p className="mt-1 text-[11px] text-brand-300">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Join Our Healthcare Network ── */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 p-10 sm:p-14 grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl text-slate-900">Join Our Healthcare Network</h2>
            <p className="mt-4 text-slate-600">
              Are you an Obstetrician or Pediatrician? Partner with us to provide seamless digital care, manage patient records efficiently, and stay connected with your patients 24/7.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><BadgeCheck size={16} className="text-brand-600" /> Verified Profile</span>
              <span className="inline-flex items-center gap-1.5"><FileLock2 size={16} className="text-brand-600" /> Direct EHR Access</span>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <Button size="lg" onClick={() => navigate('/register/doctor')}>
              Register as Doctor <ArrowRight size={18} className="ml-1" />
            </Button>
            <p className="text-xs text-slate-500">Medical License required for verification</p>
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="font-display text-4xl text-slate-900">Get in Touch</h2>
            <p className="mt-4 text-slate-600">Questions about NurtureX? Reach out and our team will get back to you.</p>
            <div className="mt-8 space-y-4 text-sm">
              <div className="flex items-center gap-3 text-slate-700">
                <Mail size={18} className="text-brand-600" /> support@nurturex.app
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <Phone size={18} className="text-brand-600" /> +961 00 000 000
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <MapPin size={18} className="text-brand-600" /> Sidon, Lebanon
              </div>
            </div>
          </div>

          <form onSubmit={handleContact} className="bg-white rounded-2xl border border-slate-100 shadow-soft p-6 space-y-4">
            <input
              value={contact.name}
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
              placeholder="Full name"
              className="block w-full h-11 px-3.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
            <input
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              type="email"
              placeholder="Email address"
              className="block w-full h-11 px-3.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
            <textarea
              value={contact.message}
              onChange={(e) => setContact((c) => ({ ...c, message: e.target.value }))}
              placeholder="Your message"
              rows={4}
              className="block w-full px-3.5 py-3 rounded-lg border border-slate-200 text-sm resize-y focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
            <Button type="submit" block>Send Message</Button>
            {contactSent && <p className="text-xs text-brand-700">Thanks — we'll be in touch soon.</p>}
          </form>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <Logo size={30} withWordmark wordmarkClass="text-base" />
            <p className="mt-4 text-sm text-slate-500 max-w-xs">
              Empowering motherhood with clinically-driven, connected healthcare solutions for a healthier, safer future for families everywhere.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Quick Links</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
              <li><a href="#about" className="hover:text-brand-700">About</a></li>
              <li><a href="#healthcare-tips" className="hover:text-brand-700">Healthcare Tips</a></li>
              <li><Link to="/register/doctor" className="hover:text-brand-700">Find a Doctor</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Resources</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
              <li><a href="#healthcare-tips" className="hover:text-brand-700">Health Guides</a></li>
              <li><a href="#healthcare-tips" className="hover:text-brand-700">Vaccination FAQs</a></li>
              <li><a href="#contact" className="hover:text-brand-700">Support Center</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Newsletter</h4>
            <p className="mt-4 text-sm text-slate-500">Stay updated with the latest in maternal healthcare.</p>
            <form onSubmit={handleNewsletter} className="mt-3 flex gap-2">
              <input
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                type="email"
                placeholder="Enter your email"
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              />
              <Button type="submit" size="sm">Subscribe</Button>
            </form>
          </div>
        </div>
        <div className="border-t border-slate-100 py-5">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} NurtureX. All rights reserved.</span>
            <div className="flex gap-5">
              <a href="#" className="hover:text-brand-700">Terms of Service</a>
              <a href="#" className="hover:text-brand-700">Cookie Policy</a>
              <Link to="/auth" className="hover:text-brand-700">Sign In</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}