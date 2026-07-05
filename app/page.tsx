import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus_Jakarta_Sans, Newsreader } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { getProductCatalog } from '@/lib/products/queries'
import { COIN_VND_RATE } from '@/lib/payments/topup-constants'
import { LEGAL_PAGES, LEGAL_SLUGS } from '@/lib/legal'
import { LandingProductCard, type LandingProduct } from '@/components/landing/LandingProductCard'
import { LandingHeaderActions } from '@/components/landing/LandingHeaderActions'
import { SkillTabs } from '@/components/landing/SkillTabs'
import { LeadForm } from '@/components/landing/LeadForm'
import { FishBone } from '@/components/brand/FishBone'
import { Mascot } from '@/components/brand/Mascot'
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

// Prediction packs CHƯA có thật (content pipeline A4) → coming_soon, KHÔNG số liệu bịa, KHÔNG link.
const PREDICTION: LandingProduct[] = [
  { title: 'Prediction 2026 Q3', skills: ['reading', 'listening'], attempts: 0, state: 'coming_soon', price: 120 },
  { title: 'Prediction 2026 Q4', skills: ['writing'], attempts: 0, state: 'coming_soon', price: 120 },
]

// FE-F03: gói nạp coin khớp fixed-rate thật (1.000 VND = 1 coin, không bonus) — giá tính từ constant.
const COIN_PACKS = [
  { name: 'Starter', coins: 60, note: 'Enough for one pack', popular: false },
  { name: 'Regular', coins: 200, note: 'Best for steady practice', popular: true },
  { name: 'Intensive', coins: 500, note: 'For a full study cycle', popular: false },
]
const vnd = (n: number) => n.toLocaleString('vi-VN')

// FE-F04: HOT/FREE lấy từ catalog thật (RLS published-only) thay cho sample tĩnh + seed UUID.
//   DB lỗi/trống → mảng rỗng, section tự ẩn — landing không 500.
async function getLandingData(): Promise<{ hot: LandingProduct[]; free: LandingProduct[] }> {
  try {
    const supabase = await createClient()
    const [catalog, freeRes] = await Promise.all([
      getProductCatalog(supabase, { sort: 'hot', page_size: '3' }),
      supabase
        .from('tests')
        .select('id, title, type, is_free, attempts_count')
        .eq('is_free', true)
        .order('attempts_count', { ascending: false })
        .limit(3),
    ])
    const hot: LandingProduct[] = catalog.data.items.map((p) => ({
      title: p.title,
      skills: [p.skill],
      attempts: p.attempts_total,
      state: p.is_free ? ('free' as const) : ('locked' as const),
      price: p.price_coins,
      href: `/products/${p.slug}`,
    }))
    type FreeRow = { id: string; title: string; type: string; attempts_count: number | null }
    const free: LandingProduct[] = ((freeRes.data ?? []) as unknown as FreeRow[]).map((t) => ({
      title: t.title,
      skills: [t.type],
      attempts: t.attempts_count ?? 0,
      state: 'free' as const,
      price: 0,
      href: `/tests/${t.id}`,
    }))
    return { hot, free }
  } catch {
    return { hot: [], free: [] }
  }
}

export default async function LandingPage() {
  const { hot, free } = await getLandingData()
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
            <Mascot size={38} />
            <span>
              <span className="logo-brand">IELTS</span>Practice
            </span>
          </Link>
          <nav>
            <Link href="/products?skill=reading">Reading</Link>
            <Link href="/products?skill=listening">Listening</Link>
            <Link href="/products?skill=writing">Writing</Link>
            <Link href="/free">Free tests</Link>
            <Link href="/prediction">Prediction</Link>
            <Link href="/pricing">Pricing</Link>
            <span className="nav-soon">
              Speaking<span className="badge-soon">soon</span>
            </span>
          </nav>
          <LandingHeaderActions />
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
            <Link href="/products" className="btn-outline">
              Browse test packs
            </Link>
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
          {/* FE-F03: bỏ số liệu bịa (10,000+/4.8) — chỉ claim tính chất sản phẩm có thật. */}
          <div className="hero-stats">
            <span>
              <span className="stat-num">100%</span> original tests
            </span>
            <span className="stat-sep" />
            <span>
              <span className="stat-num">Free</span> tests to start
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

      {/* HOT COLLECTIONS — dữ liệu thật từ catalog (FE-F04); trống → ẩn section */}
      {hot.length > 0 && (
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
            {hot.map((p) => (
              <LandingProductCard key={p.href ?? p.title} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* FREE TESTS — đề free published thật (FE-F04); trống → ẩn section */}
      {free.length > 0 && (
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
            {free.map((p) => (
              <LandingProductCard key={p.href ?? p.title} p={p} />
            ))}
          </div>
        </section>
      )}

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

      {/* PRICING — FE-F03: khớp fixed-rate thật (1.000 VND = 1 coin), KHÔNG bonus/USD bịa. */}
      <section id="pricing">
        <div className="pricing-hdr">
          <div className="section-eyebrow">Fixed rate · {vnd(COIN_VND_RATE)} VND = 1 coin</div>
          <h2 className="section-h2">Top up coins, unlock any pack</h2>
          <p className="section-lead">
            Spend coins on premium packs. Free tests stay free, forever.
          </p>
        </div>
        <div className="pricing-grid">
          {COIN_PACKS.map((pack) => (
            <div key={pack.name} className={`coin-card${pack.popular ? ' popular' : ''}`}>
              {pack.popular && <div className="popular-badge">Most popular</div>}
              <div className="coin-name">{pack.name}</div>
              <div className="coin-amount">
                <span className="coin-num inline-flex items-center gap-1.5">
                  <FishBone /> {pack.coins}
                </span>
              </div>
              <div className="coin-note">{pack.note}</div>
              <div className="coin-price">{vnd(pack.coins * COIN_VND_RATE)} ₫</div>
              <Link href="/pricing" className={`coin-btn${pack.popular ? ' popular' : ''}`}>
                Top up
              </Link>
            </div>
          ))}
        </div>
        <p className="pricing-footer">
          Coins never expire — server verifies every payment.{' '}
          <Link href="/pricing">Top up coins →</Link>
        </p>
      </section>

      {/* HIGHLIGHTS — FE-F03: bỏ testimonial/5-sao/band bịa; giữ layout, nội dung = tính chất sản phẩm có thật. */}
      <section className="testimonials">
        <div className="testimonials-hdr">
          <div className="section-eyebrow">Why practice here</div>
          <h2 className="section-h2">Built for serious practice</h2>
        </div>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <p className="test-quote">
              The test interface mirrors the computer-delivered exam — timer, navigation, highlights and notes included.
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#FFEDE6' }}>
                R
              </span>
              <div>
                <div className="test-name">Real exam interface</div>
                <div className="test-meta">Reading · Listening</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <p className="test-quote">
              Writing is graded by AI against the four band-descriptor criteria, with sentence-level suggestions.
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#F0ECFF' }}>
                W
              </span>
              <div>
                <div className="test-name">AI Writing feedback</div>
                <div className="test-meta">Scores are indicative, not official</div>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <p className="test-quote">
              Start with free tests, then unlock full packs with coins — pay only for what you practice.
            </p>
            <div className="test-author">
              <span className="test-avatar" style={{ background: '#FFE9F1' }}>
                C
              </span>
              <div>
                <div className="test-name">Coin-based unlock</div>
                <div className="test-meta">Free tests included</div>
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
            {/* FE-F08: hết form giả — dẫn tới kênh liên hệ thật (trang Liên hệ). */}
            <p className="lead-sub">
              Tell us your target band and timeline through our contact page — we&apos;ll suggest a practice roadmap.
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
              <Mascot size={30} />
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
              <Link href="/products?skill=reading">Reading</Link>
              <Link href="/products?skill=listening">Listening</Link>
              <Link href="/products?skill=writing">Writing</Link>
              <span className="nav-soon">Speaking (soon)</span>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Explore</div>
            <div className="footer-links">
              <Link href="/free">Free tests</Link>
              <Link href="/prediction">Prediction</Link>
              <Link href="/products">Hot collections</Link>
              <Link href="/pricing">Pricing</Link>
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
            {/* FE-F06: đủ 7 trang pháp lý (yêu cầu merchant review) — đồng bộ Footer (marketing). */}
            <div className="footer-legal">
              {LEGAL_SLUGS.map((slug) => (
                <Link key={slug} href={`/legal/${slug}`}>
                  {LEGAL_PAGES[slug].title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
