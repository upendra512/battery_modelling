import SectionHeader from './SectionHeader'
import upendraPhoto from '../data/upendra.jpeg'
import samrudhPhoto from '../data/samrudh.png'
import adarshPhoto from '../data/adarsh.jpg'
import atharvPhoto from '../data/atharv.jpg'
import krishPhoto from '../data/krishkumar.jpg'

const teamMembers = [
  { name: 'Upendra Singh',    role: 'Lead Developer',     color: '#00d4ff', photo: upendraPhoto },
  { name: 'Samrudh Nelii',    role: 'Algorithm Engineer', color: '#7c3aed', photo: samrudhPhoto },
  { name: 'Adarsh Tipradi',   role: 'Data Scientist',     color: '#10b981', photo: adarshPhoto },
  { name: 'Atharv Salodkar',  role: 'Systems Engineer',   color: '#f59e0b', photo: atharvPhoto },
  { name: 'Krish Kumar',      role: 'Research Analyst',   color: '#ef4444', photo: krishPhoto },
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
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 2rem' }}>
        <SectionHeader tag="Team" title="Meet the Team" desc="Five passionate engineers building the future of battery management systems." />

        {/* Team Members Grid */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 50 }}>
          {teamMembers.map(member => (
            <div key={member.name} style={{
              background: '#0d1b35',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 18, padding: '24px 20px',
              textAlign: 'center', width: 180,
              transition: 'all 0.3s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-5px)'
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.borderColor = 'rgba(0,212,255,0.15)'
            }}>
              {/* Circular Photo */}
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                margin: '0 auto 16px',
                border: '3px solid rgba(0,212,255,0.2)',
                boxShadow: `0 4px 20px ${member.color}40`,
                overflow: 'hidden',
                background: `linear-gradient(135deg, ${member.color}, #7c3aed)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src={member.photo}
                  alt={member.name}
                  onError={(e) => {
                    // Fallback to initials if photo fails to load
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div style={{
                  display: 'none',
                  width: '100%', height: '100%',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', color: '#fff', fontWeight: 700,
                }}>
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
              </div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>
                {member.name}
              </h4>
              <p style={{ fontSize: '0.76rem', color: member.color, fontWeight: 600 }}>
                {member.role}
              </p>
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
              fontSize: '2rem',
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
              href="https://github.com/upendra512/NeoRide_Battery_Modelling"
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
      <style>{`
        @media(max-width:720px){
          #team .team-grid { grid-template-columns:1fr !important; }
        }
      `}</style>
    </section>
  )
}
