import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus_Jakarta_Sans, Newsreader } from 'next/font/google'
import { LandingProductCard, type LandingProduct } from '@/components/landing/LandingProductCard'
import { SkillTabs } from '@/components/landing/SkillTabs'
import { LeadForm } from '@/components/landing/LeadForm'
import './home.css'

// Fonts from the design (Plus Jakarta Sans + Newsreader italic), exposed as CSS
// variables and consumed by app/home.css under the `.dc-home` scope.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'IELTSPractice — Prep for IELTS, just like the real exam.',
  description:
    'Original IELTS tests on a real exam interface, with server-side scoring and AI Writing feedback mapped to the official band descriptors.',
}

// ⚠️ v1 shell: static sample data (not yet wired to /api/products).
const HOT: LandingProduct[] = [
  { title: 'READING VOL 1', skills: ['reading'], attempts: 1240, state: 'locked', price: 100, href: '/products/reading-vol-1' },
  { title: 'LISTENING VOL 1', skills: ['listening'], attempts: 980, state: 'locked', price: 100, href: '/products/listening-vol-1' },
  { title: 'WRITING Task 2 Pack', skills: ['writing'], attempts: 540, state: 'coming_soon', price: 150 },
]
const FREE: LandingProduct[] = [
  { title: 'Reading Test · Free 1', skills: ['reading'], attempts: 3200, state: 'free', price: 0, href: '/tests/11111111-1111-1111-1111-111111111111' },
  { title: 'Listening Test · Free 1', skills: ['listening'], attempts: 2100, state: 'free', price: 0, href: '/tests/77777777-7777-7777-7777-777777777777' },
  { title: 'Writing Task 2 · Free 1', skills: ['writing'], attempts: 1500, state: 'free', price: 0, href: '/free' },
]
const PREDICTION: LandingProduct[] = [
  { title: 'Prediction 2026 Q3', skills: ['reading', 'listening'], attempts: 410, state: 'coming_soon', price: 120 },
  { title: 'Prediction 2026 Q4', skills: ['writing'], attempts: 0, state: 'coming_soon', price: 120 },
]

export default function LandingPage() {
  return (
    <div className={`dc-home ${jakarta.variable} ${newsreader.variable}`}>
      {/* ANNOUNCEMENT */}
      <div className="announcement">
        <span>100% original tests</span>
        <span className="ann-sep">·</span>
        <span>Real exam interface</span>
        <span className="ann-sep">·</span>
        <span>AI-graded Writing by band descriptor</span>
      </div>

      {/* NAV */}
      <header>
        <div className="nav-inner">
          <Link href="/" className="logo">
            <span className="logo-mark">
              <span className="logo-diamond" />
            </span>
            <span>
              <span className="logo-brand">IELTS</span>Practice
            </span>
          </Link>
          <nav>
            <a href="#skills">Reading</a>
            <a href="#skills">Listening</a>
            <a href="#skills">Writing</a>
            <a href="#free">Free tests</a>
            <a href="#prediction">Prediction</a>
            <a href="#pricing">Pricing</a>
            <span className="nav-soon">
              Speaking<span className="badge-soon">soon</span>
            </span>
          </nav>
          <div className="hdr-actions">
            <Link href="/login" className="btn-login">
              Log in
            </Link>
            <Link href="/register" className="btn-start">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-pill">
            <span className="pill-dot" />
            Reading · Listening · Writing
          </span>
          <h1>
            Prep for IELTS,
            <br />
            just like the <span className="italic-serif">real exam</span>.
          </h1>
          <p className="hero-lead">
            Sit each test on a true exam interface, get server-side scoring, and receive AI Writing feedback mapped to
            the official band descriptors — all in a calm, friendly space that keeps you motivated.
          </p>
          <div className="hero-ctas">
            <Link href="/register" className="btn-primary">
              Start free
            </Link>
            <a href="#hot" className="btn-outline">
              Browse test packs
            </a>
          </div>
          <form className="hero-search" action="/products" method="get">
            <div className="search-wrap">
              <span className="search-icon" />
              <input className="search-input" name="q" placeholder="Search the latest test packs…" />
            </div>
            <button className="btn-search" type="submit">
              Search
            </button>
          </form>
          <div className="hero-stats">
            <span>
              <span className="stat-num">10,000+</span> tests taken
            </span>
            <span className="stat-sep" />
            <span>
              <span className="stars">★★★★★</span> 4.8/5 rating
            </span>
          </div>
        </div>

        {/* HERO DASHBOARD */}
        <div className="hero-visual">
          <div className="hero-visual-inner">
            <div className="blob blob-coral" />
            <div className="blob blob-violet" />
            <div className="sparkle sp1" />
            <div className="sparkle sp2" />
            <div className="sparkle sp3" />

            <div className="dashboard-card">
              <div className="dc-header">
                <div>
                  <div className="dc-eyebrow">Your band journey</div>
                  <div className="dc-title">Progress overview</div>
                </div>
                <div className="dc-avatar">D</div>
              </div>

              <div className="ring-row">
                <div className="ring" style={{ background: 'conic-gradient(#7C5CE6 300deg,#EFEBF4 300deg)' }}>
                  <div className="ring-inner">
                    <div className="ring-band">7.5</div>
                    <div className="ring-lbl">OVERALL</div>
                  </div>
                </div>
                <div className="ring-meta">
                  <div className="ring-meta-lbl">Predicted overall band</div>
                  <div className="ring-chip">▲ +1.5 since start</div>
                  <div className="ring-goal">
                    On track for your <strong>8.0</strong> goal
                  </div>
                </div>
              </div>

              <div className="skill-bars">
                <div>
                  <div className="sbar-header">
                    <span>Reading</span>
                    <span className="sbar-val">7.5</span>
                  </div>
                  <div className="sbar-track">
                    <div className="sbar-fill" style={{ width: '83%', background: '#F2724E' }} />
                  </div>
                </div>
                <div>
                  <div className="sbar-header">
                    <span>Listening</span>
                    <span className="sbar-val">7.0</span>
                  </div>
                  <div className="sbar-track">
                    <div className="sbar-fill" style={{ width: '78%', background: '#ECA22B' }} />
                  </div>
                </div>
                <div>
                  <div className="sbar-header">
                    <span>Writing</span>
                    <span className="sbar-val">6.5</span>
                  </div>
                  <div className="sbar-track">
                    <div className="sbar-fill" style={{ width: '72%', background: '#7C5CE6' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="chip-float chip-ai">
              <div className="chip-ai-icon">✦</div>
              <div className="chip-ai-text">
                AI feedback
                <br />
                <span className="chip-ready">ready</span>
              </div>
            </div>
            <div className="chip-float chip-streak">
              <div className="chip-streak-num">12</div>
              <div className="chip-streak-text">
                day
                <br />
                streak
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE STRIP */}
      <section className="features">
        <div className="features-grid">
          <div className="feat-card">
            <div className="feat-icon" style={{ background: '#F0ECFF' }}>
              <span className="feat-dot" style={{ background: '#7C5CE6' }} />
            </div>
            <h3 className="feat-title">100% original tests</h3>
            <p className="feat-body">Written in-house, never copied, and matched to the latest exam format.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: '#FFEDE6' }}>
              <span className="feat-dot" style={{ background: '#F2724E' }} />
            </div>
            <h3 className="feat-title">Real exam interface</h3>
            <p className="feat-body">A computer-delivered test experience that stays safe even if you reload.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: '#FFF3DC' }}>
              <span className="feat-dot" style={{ background: '#ECA22B' }} />
            </div>
            <h3 className="feat-title">AI Writing grading</h3>
            <p className="feat-body">Band-descriptor feedback with specific fixes for each sentence.</p>
          </div>
          <div className="feat-card">
            <div className="feat-icon" style={{ background: '#FFE9F1' }}>
              <span className="feat-dot" style={{ background: '#EE5C92' }} />
            </div>
            <h3 className="feat-title">Server-side scoring</h3>
            <p className="feat-body">Answer keys and scoring run on the server — transparent and tamper-proof.</p>
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section id="skills">
        <div className="section-hdr-center">
          <div className="section-eyebrow">Practice by skill</div>
          <h2 className="section-h2">Pick a skill and start right away</h2>
        </div>
        <SkillTabs />
      </section>

      {/* HOT COLLECTIONS */}
      <section className="section-row" style={{ padding: '70px 0 10px' }} id="hot">
        <div className="row-header">
          <div>
            <h2 className="row-h2">Hot collections</h2>
            <p className="row-sub">The most-attempted test packs</p>
          </div>
          <Link href="/products" className="row-link">
            View all →
          </Link>
        </div>
        <div className="cards-grid">
          {HOT.map((p) => (
            <LandingProductCard key={p.title} p={p} />
          ))}
        </div>
      </section>

      {/* FREE TESTS */}
      <section className="section-row" style={{ padding: '54px 0 10px' }} id="free">
        <div className="row-header">
          <div>
            <h2 className="row-h2">Free tests</h2>
            <p className="row-sub">Try them free — no purchase needed</p>
          </div>
          <Link href="/free" className="row-link">
            All free tests →
          </Link>
        </div>
        <div className="cards-grid">
          {FREE.map((p) => (
            <LandingProductCard key={p.title} p={p} />
          ))}
        </div>
      </section>

      {/* AI WRITING */}
      <section className="ai-section">
        <div className="ai-inner">
          <div className="ai-copy">
            <span className="ai-pill">✦ AI Writing grading</span>
            <h2 className="ai-h2">Feedback by the official band descriptors</h2>
            <p className="ai-lead">
              Submit a Task 1 or Task 2 essay and get an instant, structured score across all four criteria — with
              concrete, sentence-level suggestions on exactly what to fix next.
            </p>
            <div className="ai-points">
              <div className="ai-point">
                <span className="ai-pt-icon">
                  <span className="ai-pt-dot" />
                </span>
                Scored on Task Response, Coherence, Lexical Resource &amp; Grammar
              </div>
              <div className="ai-point">
                <span className="ai-pt-icon">
                  <span className="ai-pt-dot" />
                </span>
                Sentence-level rewrite suggestions, not just a number
              </div>
              <div className="ai-point">
                <span className="ai-pt-icon">
                  <span className="ai-pt-dot" />
                </span>
                An estimated overall band you can track over time
              </div>
            </div>
          </div>
          <div className="ai-card">
            <div className="ai-card-top">
              <div>
                <div className="ai-band-lbl">Estimated overall</div>
                <div className="ai-band-num">7.5</div>
              </div>
              <span className="ai-tag">Task 2 · essay</span>
            </div>
            <div className="ai-bars">
              <div>
                <div className="ai-bar-hdr">
                  <span>Task Response</span>
                  <span>7.0</span>
                </div>
                <div className="ai-bar-track">
                  <div className="ai-bar-fill" style={{ width: '78%' }} />
                </div>
              </div>
              <div>
                <div className="ai-bar-hdr">
                  <span>Coherence &amp; Cohesion</span>
                  <span>6.5</span>
                </div>
                <div className="ai-bar-track">
                  <div className="ai-bar-fill" style={{ width: '68%' }} />
                </div>
              </div>
              <div>
                <div className="ai-bar-hdr">
                  <span>Lexical Resource</span>
                  <span>7.0</span>
                </div>
                <div className="ai-bar-track">
                  <div className="ai-bar-fill" style={{ width: '78%' }} />
                </div>
              </div>
              <div>
                <div className="ai-bar-hdr">
                  <span>Grammatical Range</span>
                  <span>6.5</span>
                </div>
                <div className="ai-bar-track">
                  <div className="ai-bar-fill" style={{ width: '68%' }} />
                </div>
              </div>
            </div>
            <div className="ai-tip">
              <span className="ai-tip-lbl">Tip · </span>Vary your linkers and develop the second body paragraph with a
              concrete example to lift Coherence to band 7.
            </div>
          </div>
        </div>
      </section>

      {/* PREDICTION */}
      <section className="section-row" style={{ padding: '60px 0 10px' }} id="prediction">
        <div className="row-header">
          <div>
            <h2 className="row-h2">Prediction</h2>
            <p className="row-sub">Predicted packs for the upcoming exam round</p>
          </div>
          <Link href="/prediction" className="row-link">
            See schedule →
          </Link>
        </div>
        <div className="cards-grid">
          {PREDICTION.map((p) => (
            <LandingProductCard key={p.title} p={p} />
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing">
        <div className="pricing-hdr">
          <div className="section-eyebrow">Simple coin pricing</div>
          <h2 className="section-h2">Top up coins, unlock any pack</h2>
          <p className="section-lead">
            Spend coins on premium packs, or redeem an activation code. Free tests stay free, forever.
          </p>
        </div>
        <div className="pricing-grid">
          <div className="coin-card">
            <div className="coin-name">Starter</div>
            <div className="coin-amount">
              <span className="coin-num">🪙 100</span>
            </div>
            <div className="coin-note">Enough for one pack</div>
            <div className="coin-price">$2.90</div>
            <Link href="/pricing" className="coin-btn">
              Buy coins
            </Link>
          </div>
          <div className="coin-card popular">
            <div className="popular-badge">Most popular</div>
            <div className="coin-name">Regular</div>
            <div className="coin-amount">
              <span className="coin-num">🪙 300</span>
              <span className="coin-bonus">+30 bonus</span>
            </div>
            <div className="coin-note">Best for steady practice</div>
            <div className="coin-price">$6.90</div>
            <Link href="/pricing" className="coin-btn popular">
              Buy coins
            </Link>
          </div>
          <div className="coin-card">
            <div className="coin-name">Pro</div>
            <div className="coin-amount">
              <span className="coin-num">🪙 700</span>
              <span className="coin-bonus">+120 bonus</span>
            </div>
            <div className="coin-note">Save 25% overall</div>
            <div className="coin-price">$13.90</div>
            <Link href="/pricing" className="coin-btn">
              Buy coins
            </Link>
          </div>
        </div>
        <p className="pricing-footer">
          Coins never expire.{' '}
          <Link href="/pricing">Top up coins →</Link>
        </p>
      </section>

      {/* TESTIMONIALS */}
      <section className="testimonials">
        <div className="testimonials-hdr">
          <div className="section-eyebrow">Loved by learners</div>
          <h2 className="section-h2">What students say</h2>
        </div>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="test-stars">★★★★★</div>
            <p className="test-quote">
              &quot;The test interface feels exactly like the real exam — no surprises on test day.&quot;
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#FFEDE6' }}>
                M
              </span>
              <div>
                <div className="test-name">Minh Anh</div>
                <div className="test-meta">Achieved 7.5 overall</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="test-stars">★★★★★</div>
            <p className="test-quote">
              &quot;AI grades my Writing in detail by each criterion, so I know precisely what to fix.&quot;
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#F0ECFF' }}>
                Q
              </span>
              <div>
                <div className="test-name">Quoc Bao</div>
                <div className="test-meta">Writing 6.0 → 7.0</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="test-stars">★★★★★</div>
            <p className="test-quote">
              &quot;I try free tests first, then unlock packs with coins. Convenient and budget-friendly.&quot;
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#FFE9F1' }}>
                T
              </span>
              <div>
                <div className="test-name">Thu Ha</div>
                <div className="test-meta">Achieved 8.0 overall</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LEAD / SUPPORT */}
      <section className="lead">
        <div className="lead-inner">
          <div className="lead-blob lead-blob-1" />
          <div className="lead-blob lead-blob-2" />
          <div className="lead-content">
            <h2 className="lead-h2">Need help with your study plan?</h2>
            <p className="lead-sub">
              Leave your email and our team will reach out with a personalized roadmap to your target band.
            </p>
            <LeadForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div>
            <Link href="/" className="logo" style={{ fontSize: '19px' }}>
              <span className="logo-mark logo-mark-sm">
                <span className="logo-diamond logo-diamond-sm" />
              </span>
              <span>
                <span className="logo-brand">IELTS</span>Practice
              </span>
            </Link>
            <p className="footer-desc">
              Original IELTS tests on a real exam interface, with server-side scoring and AI Writing feedback.
            </p>
          </div>
          <div>
            <div className="footer-col-title">Skills</div>
            <div className="footer-links">
              <a href="#skills">Reading</a>
              <a href="#skills">Listening</a>
              <a href="#skills">Writing</a>
              <span className="nav-soon">Speaking (soon)</span>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Explore</div>
            <div className="footer-links">
              <a href="#free">Free tests</a>
              <a href="#prediction">Prediction</a>
              <a href="#hot">Hot collections</a>
              <a href="#pricing">Pricing</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Account</div>
            <div className="footer-links">
              <Link href="/login">Log in</Link>
              <Link href="/register">Start free</Link>
              <Link href="/pricing">Top up coins</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span>© 2026 IELTSPractice. All rights reserved.</span>
            <div className="footer-legal">
              <Link href="/legal/privacy">Privacy</Link>
              <Link href="/legal/transaction-terms">Terms</Link>
              <Link href="/legal/contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
