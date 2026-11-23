import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif', overflowX: 'hidden' }}>

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
        background: scrolled ? 'rgba(2,8,20,0.85)' : 'rgba(2,8,20,0.4)',
        backdropFilter: 'blur(20px)',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(59,130,246,0.5)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 17 }}>
            <span style={{ color: '#60a5fa' }}>CloudForge</span>
            <span style={{ color: '#ffffff' }}> AI</span>
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          {['Home', 'About', 'Services', 'Solutions', 'Contact'].map(item => (
            <a key={item} href="#"
              style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ffffff'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'}>
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <Link to="/register" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 24px', borderRadius: 999,
          background: '#ffffff', color: '#000000',
          fontWeight: 700, fontSize: 14, textDecoration: 'none',
          boxShadow: '0 2px 20px rgba(255,255,255,0.15)',
          transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.9)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 30px rgba(255,255,255,0.25)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = '#ffffff';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 20px rgba(255,255,255,0.15)';
          }}>
          Get Started &rarr;
        </Link>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', overflow: 'hidden',
      }}>

        {/* Deep space base */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'linear-gradient(180deg, #020c1e 0%, #031428 40%, #04192f 70%, #020c1e 100%)',
        }} />

        {/* Side rack columns — left */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '26%', zIndex: 1, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: '-2% -15% -2% -5%',
            background: 'linear-gradient(160deg, #071525 0%, #0c1e3a 35%, #08152b 65%, #050f1f 100%)',
            borderRight: '2px solid rgba(30,80,180,0.25)',
          }}>
            {/* Rack rows */}
            {Array.from({ length: 26 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: '12%', right: '8%',
                height: 16,
                top: `${3 + i * 3.7}%`,
                background: i % 3 === 0
                  ? 'linear-gradient(90deg, #0d1f3d, #142a50, #0d1f3d)'
                  : 'linear-gradient(90deg, #081525, #0f1f38, #081525)',
                border: '1px solid rgba(20,50,120,0.5)',
                borderRadius: 2,
                display: 'flex', alignItems: 'center', padding: '0 8px', gap: 5,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: i % 6 === 0 ? '#22c55e' : i % 4 === 1 ? '#3b82f6' : '#1e40af',
                  boxShadow: `0 0 8px ${i % 6 === 0 ? 'rgba(34,197,94,0.8)' : 'rgba(59,130,246,0.8)'}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(30,70,160,0.4)', borderRadius: 1 }} />
                <div style={{ width: 20, height: 4, background: 'rgba(20,50,120,0.6)', borderRadius: 1 }} />
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(59,130,246,0.4)' }} />
              </div>
            ))}
            {/* Right edge glow */}
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 2,
              background: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.9) 20%, rgba(14,165,233,1) 50%, rgba(59,130,246,0.9) 80%, transparent 100%)',
              boxShadow: '0 0 25px 5px rgba(59,130,246,0.5)',
            }} />
            {/* Horizontal light bars */}
            {[15, 45, 75].map(pos => (
              <div key={pos} style={{
                position: 'absolute', left: '8%', right: 0,
                top: `${pos}%`, height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)',
              }} />
            ))}
          </div>
        </div>

        {/* Side rack columns — right */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '26%', zIndex: 1, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: '-2% -5% -2% -15%',
            background: 'linear-gradient(200deg, #071525 0%, #0c1e3a 35%, #08152b 65%, #050f1f 100%)',
            borderLeft: '2px solid rgba(30,80,180,0.25)',
          }}>
            {Array.from({ length: 26 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: '8%', right: '12%',
                height: 16,
                top: `${3 + i * 3.7}%`,
                background: i % 3 === 0
                  ? 'linear-gradient(90deg, #0d1f3d, #142a50, #0d1f3d)'
                  : 'linear-gradient(90deg, #081525, #0f1f38, #081525)',
                border: '1px solid rgba(20,50,120,0.5)',
                borderRadius: 2,
                display: 'flex', alignItems: 'center', padding: '0 8px', gap: 5,
              }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(59,130,246,0.4)', flexShrink: 0 }} />
                <div style={{ width: 20, height: 4, background: 'rgba(20,50,120,0.6)', borderRadius: 1 }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(30,70,160,0.4)', borderRadius: 1 }} />
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: i % 5 === 2 ? '#22c55e' : i % 4 === 0 ? '#3b82f6' : '#1e40af',
                  boxShadow: `0 0 8px ${i % 5 === 2 ? 'rgba(34,197,94,0.8)' : 'rgba(59,130,246,0.8)'}`,
                  flexShrink: 0,
                }} />
              </div>
            ))}
            {/* Left edge glow */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
              background: 'linear-gradient(180deg, transparent 0%, rgba(59,130,246,0.9) 20%, rgba(14,165,233,1) 50%, rgba(59,130,246,0.9) 80%, transparent 100%)',
              boxShadow: '0 0 25px 5px rgba(59,130,246,0.5)',
            }} />
            {[25, 55, 80].map(pos => (
              <div key={pos} style={{
                position: 'absolute', left: 0, right: '8%',
                top: `${pos}%`, height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.4), transparent)',
              }} />
            ))}
          </div>
        </div>

        {/* Sky opening — bright blue at top center */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: '52%', zIndex: 2,
          background: 'radial-gradient(ellipse 100% 130% at 50% -5%, #1a7bd4 0%, #1560b5 18%, #0e4a96 35%, #071e4a 55%, transparent 75%)',
        }} />

        {/* Cloud mass — main bright cloud */}
        <div style={{
          position: 'absolute', top: '2%', left: '23%', right: '23%', height: 220, zIndex: 3,
          background: 'radial-gradient(ellipse 100% 90% at 50% 35%, rgba(230,242,255,0.97) 0%, rgba(190,220,255,0.85) 25%, rgba(140,190,255,0.55) 50%, rgba(80,140,220,0.2) 70%, transparent 85%)',
          filter: 'blur(3px)',
        }} />
        {/* Brighter cloud center */}
        <div style={{
          position: 'absolute', top: '1%', left: '30%', right: '30%', height: 150, zIndex: 4,
          background: 'radial-gradient(ellipse 85% 75% at 50% 45%, rgba(255,255,255,0.98) 0%, rgba(220,238,255,0.92) 35%, rgba(160,200,255,0.5) 60%, transparent 80%)',
          filter: 'blur(1.5px)',
        }} />
        {/* Soft halo around clouds */}
        <div style={{
          position: 'absolute', top: '0%', left: '15%', right: '15%', height: '45%', zIndex: 2,
          background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(30,100,210,0.25) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }} />

        {/* Floor perspective — bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: '18%', right: '18%', height: '40%', zIndex: 2,
          background: 'linear-gradient(180deg, transparent 0%, rgba(5,15,40,0.5) 40%, rgba(3,10,30,0.95) 100%)',
        }} />
        {/* Floor blue reflection */}
        <div style={{
          position: 'absolute', bottom: '3%', left: '28%', right: '28%', height: 80, zIndex: 3,
          background: 'radial-gradient(ellipse 100% 100% at 50% 100%, rgba(59,130,246,0.5) 0%, rgba(14,165,233,0.2) 50%, transparent 75%)',
          filter: 'blur(10px)',
        }} />

        {/* Vertical side text — left */}
        <div style={{
          position: 'absolute', left: '3.5%', top: '50%',
          transform: 'translateY(-50%) rotate(-90deg)',
          zIndex: 5, fontSize: 9, fontWeight: 700, letterSpacing: '0.3em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          Cloud &nbsp; Connects &nbsp; People &nbsp; Possibilities
        </div>

        {/* Vertical side text — right */}
        <div style={{
          position: 'absolute', right: '3.5%', top: '50%',
          transform: 'translateY(-50%) rotate(90deg)',
          zIndex: 5, fontSize: 9, fontWeight: 700, letterSpacing: '0.3em',
          color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          Higher &nbsp; Ideas &nbsp; Brighter &nbsp; Tomorrow
        </div>

        {/* ── Center content ─────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 700, padding: '0 24px', marginTop: 20 }}>

          {/* Main headline */}
          <h1 style={{
            fontSize: 'clamp(40px, 5.5vw, 72px)',
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            margin: '0 0 8px',
            color: '#ffffff',
            textShadow: '0 2px 60px rgba(0,0,0,0.8), 0 0 120px rgba(0,0,0,0.6)',
          }}>
            We Build Cloud
            <br />
            Infrastructure That
          </h1>

          {/* Colored line */}
          <h1 style={{
            fontSize: 'clamp(40px, 5.5vw, 72px)',
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            margin: '0 0 28px',
            background: 'linear-gradient(90deg, #3b9ef7 0%, #0ea5e9 50%, #38bdf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 30px rgba(59,130,246,0.5))',
          }}>
            Powers Growth.
          </h1>

          {/* Subtext */}
          <p style={{
            fontSize: 16,
            lineHeight: 1.75,
            color: 'rgba(220,232,255,0.75)',
            margin: '0 auto 40px',
            maxWidth: 500,
            textShadow: '0 1px 10px rgba(0,0,0,0.5)',
          }}>
            We help businesses scale with secure cloud platforms,
            modern data infrastructure, seamless migration, and
            DevOps solutions for what&apos;s next.
          </p>

          {/* CTA button */}
          <Link to="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '15px 36px', borderRadius: 999,
            background: '#ffffff', color: '#0a0a0a',
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
            boxShadow: '0 4px 40px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.93)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 50px rgba(255,255,255,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '#ffffff';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 40px rgba(255,255,255,0.25)';
            }}>
            Explore Solutions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section style={{ background: '#04101f', borderTop: '1px solid rgba(59,130,246,0.12)', padding: '72px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
            Everything you need to ship faster
          </h2>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 16, marginBottom: 52 }}>
            From writing code to deploying it — all in one platform.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 24 }}>
            {[
              { icon: '⚡', title: 'Browser IDE', desc: 'Full VS Code experience in the browser with Monaco editor, file explorer, and multi-tab editing.' },
              { icon: '🤖', title: 'AI Coding Agent', desc: 'Ask AI to build features, fix bugs, and write entire files. It works autonomously in your project.' },
              { icon: '🐳', title: 'Docker Execution', desc: 'Isolated containers for each run. JavaScript, TypeScript, Python — all secure and sandboxed.' },
              { icon: '🚀', title: 'One-Click Deploy', desc: 'Get a live URL instantly. Auto SSL, global CDN, and environment variable management built in.' },
            ].map(f => (
              <div key={f.title} style={{
                padding: '28px 24px', borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(59,130,246,0.1)',
                transition: 'all 0.25s ease',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.07)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.3)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.1)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}>
                <div style={{ fontSize: 30, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.5)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        background: '#020810',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '28px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: 'rgba(255,255,255,0.3)',
      }}>
        <span style={{ fontWeight: 700, color: '#60a5fa' }}>CloudForge AI</span>
        <span>&copy; 2026 CloudForge AI. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => (
            <a key={l} href="#" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'}>
              {l}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
