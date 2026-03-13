import SectionHeader from './SectionHeader'
import upendraPhoto from '../data/upendra.jpeg'
import samrudhPhoto from '../data/samrudh.png'
import adarshPhoto from '../data/adarsh.jpg'
import atharvPhoto from '../data/atharv.jpg'
import krishPhoto from '../data/krishkumar.jpg'

const teamMembers = [
  { name: 'Upendra Singh',   color: '#00d4ff', photo: upendraPhoto },
  { name: 'Samrudh Nelii',   color: '#7c3aed', photo: samrudhPhoto },
  { name: 'Adarsh Tipradi',  color: '#10b981', photo: adarshPhoto },
  { name: 'Atharv Salodkar', color: '#f59e0b', photo: atharvPhoto },
  { name: 'Krish Kumar',     color: '#ef4444', photo: krishPhoto },
]

const tags = ['Battery Modelling','Signal Processing','State Estimation','Python','NASA Dataset','Li-ion BMS','Extended Kalman Filter','1RC ECM','L-BFGS-B','NumPy / SciPy']

const specs = [
  { k: 'Course',     v: 'ES60208' },
  { k: 'Topic',      v: 'Rechargeable Battery Performance Modelling' },
  { k: 'Dataset',    v: 'NASA ALT Battery Ageing Dataset' },
  { k: 'Algorithm',  v: 'Extended Kalman Filter + 1RC ECM' },
  { k: 'Language',   v: 'Python 3.8+' },
  { k: 'Year',       v: '2026' },
]

export default function Team() {
  return (
    <section id="team" style={{
      padding: '80px 0',
      background: 'linear-gradient(135deg,#0a1628,#0f1f3a)',
      borderTop: '1px solid rgba(0,212,255,0.12)',
      borderBottom: '1px solid rgba(0,212,255,0.12)',
    }}>
      <style>{`
        .team-card {
          background: #0d1b35;
          border: 1px solid rgba(0,212,255,0.15);
          border-radius: 18px;
          padding: 28px 20px 22px;
          text-align: center;
          width: 175px;
          transition: all 0.35s cubic-bezier(.4,0,.2,1);
          position: relative;
          overflow: hidden;
        }
        .team-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, transparent 60%, rgba(0,212,255,0.04));
          opacity: 0;
          transition: opacity 0.35s;
        }
        .team-card:hover {
          transform: translateY(-8px) scale(1.03);
          border-color: rgba(0,212,255,0.45);
          box-shadow: 0 16px 40px rgba(0,0,0,0.4), 0 0 20px rgba(0,212,255,0.12);
        }
        .team-card:hover::before { opacity: 1; }
        .team-photo-ring {
          transition: box-shadow 0.35s, border-color 0.35s;
        }
        .team-card:hover .team-photo-ring {
          box-shadow: 0 0 0 3px rgba(0,212,255,0.4), 0 6px 24px rgba(0,0,0,0.5);
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 2rem' }}>
        <SectionHeader tag="Team" title="Meet the Team" desc="Five passionate engineers building the future of battery management systems." />

        {/* Team Members Grid */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap', marginBottom: 52 }}>
          {teamMembers.map((member, idx) => (
            <div key={member.name} className="team-card">
              {/* Glow dot top-right */}
              <div style={{
                position: 'absolute', top: 12, right: 12,
                width: 6, height: 6, borderRadius: '50%',
                background: member.color,
                boxShadow: `0 0 8px ${member.color}`,
              }} />

              {/* Circular Photo */}
              <div className="team-photo-ring" style={{
                width: 92, height: 92, borderRadius: '50%',
                margin: '0 auto 18px',
                border: `3px solid ${member.color}55`,
                overflow: 'hidden',
                background: `linear-gradient(135deg, ${member.color}33, #7c3aed33)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src={member.photo}
                  alt={member.name}
                  onError={e => {
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  display: 'none', width: '100%', height: '100%',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', color: '#fff', fontWeight: 700,
                  background: `linear-gradient(135deg, ${member.color}, #7c3aed)`,
                }}>
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
              </div>

              {/* Name only */}
              <h4 style={{
                fontSize: '0.93rem', fontWeight: 700,
                color: '#e2e8f0', lineHeight: 1.3,
                margin: 0,
              }}>
                {member.name}
              </h4>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 28,
          maxWidth: 900, margin: '0 auto',
        }}>
          {/* Project Info card */}
          <div style={{
            background: '#0d1b35',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 20, padding: 40, textAlign: 'center',
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: 20, margin: '0 auto 20px',
              background: 'linear-gradient(135deg,#00d4ff,#7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', boxShadow: '0 8px 28px rgba(0,212,255,0.25)',
            }}>🚀</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Team NeoRide</h3>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: 24 }}>
              ES60208 — Rechargeable Battery Performance Modelling · 2026
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {tags.map(t => (
                <span key={t} style={{
                  background: 'rgba(0,212,255,0.07)',
                  border: '1px solid rgba(0,212,255,0.18)',
                  color: '#94a3b8', padding: '5px 13px',
                  borderRadius: 20, fontSize: '0.78rem',
                }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Project specs */}
          <div style={{
            background: '#0d1b35',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 20, padding: 32,
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 20, color: '#00d4ff' }}>Project Specifications</h3>
            {specs.map(s => (
              <div key={s.k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: '0.84rem', color: '#64748b' }}>{s.k}</span>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e2e8f0', textAlign: 'right', maxWidth: '55%' }}>{s.v}</span>
              </div>
            ))}
            <a
              href="https://github.com/upendra512/battery_modelling"
              target="_blank" rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 24, padding: '11px 0',
                background: 'rgba(0,212,255,0.07)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 10, color: '#00d4ff',
                fontWeight: 700, fontSize: '0.9rem',
                textDecoration: 'none', transition: 'all 0.2s',
              }}
            >⭐ View on GitHub</a>
          </div>
        </div>
      </div>
    </section>
  )
}
