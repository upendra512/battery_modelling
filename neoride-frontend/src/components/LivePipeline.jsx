import { useState, useCallback, useRef, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const API = '/api'

const gridClr   = 'rgba(255,255,255,0.05)'
const tickStyle = { fontSize: 10, fill: '#475569' }
const tooltipStyle = {
  contentStyle: { background: 'rgba(5,13,26,0.97)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 10, boxShadow:'0 8px 32px rgba(0,0,0,0.5)' },
  labelStyle:   { color: '#e2e8f0', fontSize: 11, fontWeight: 600 },
  itemStyle:    { fontSize: 11 },
}

const STEPS_META = [
  { icon: '📂', name: 'Data Loader',           desc: 'Parsing CSV · Segmenting discharge cycles',         color: '#00d4ff' },
  { icon: '🔋', name: 'Coulomb Counting',       desc: 'Integrating current → Reference SOC',              color: '#7c3aed' },
  { icon: '📐', name: 'OCV–SOC Polynomial',    desc: 'Fitting degree-9 polynomial to OCV–SOC pairs',      color: '#10b981' },
  { icon: '🔍', name: 'ECM Param ID',           desc: 'L-BFGS-B optimising R₀, R₁, C₁',                  color: '#f59e0b' },
  { icon: '⚙️', name: 'ECM Simulation',         desc: 'Forward-simulating 1RC Thévenin model',            color: '#ef4444' },
  { icon: '🎯', name: 'EKF SOC Estimation',     desc: 'Extended Kalman Filter · Multi-start robustness',  color: '#00d4ff' },
]
const multiColors = ['#00d4ff','#7c3aed','#10b981','#f59e0b','#ef4444']

/* ── Animated spinning ring ── */
function Spinner({ color = '#00d4ff', size = 18 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: '50%',
      border: `2px solid ${color}30`,
      borderTop: `2px solid ${color}`,
      animation: 'lp-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

/* ── Animated terminal log line ── */
function LogLine({ text, color = '#94a3b8', delay = 0 }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(-10px)',
      transition: 'all 0.3s ease',
      fontSize: '0.74rem',
      color,
      lineHeight: 1.7,
      fontFamily: 'monospace',
    }}>
      <span style={{ color: '#475569', marginRight: 8 }}>›</span>{text}
    </div>
  )
}

/* ── Metric box ── */
function MetricBox({ label, value, unit, color, delay = 0 }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{
      background: '#0a1628',
      border: `1px solid ${color}30`,
      borderRadius: 12, padding: '16px 14px', textAlign: 'center',
      position: 'relative', overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'all 0.4s cubic-bezier(.4,0,.2,1)',
    }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.8 }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>
        {value}<span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 400 }}>{unit}</span>
      </div>
      <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: 4, letterSpacing: '0.03em' }}>{label}</div>
    </div>
  )
}

/* ── Chart card ── */
function ChartCard({ title, badge, badgeColor = '#00d4ff', children }) {
  return (
    <div style={{
      background: '#0a1628',
      border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 16, padding: 24,
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>{title}</h3>
        {badge && (
          <span style={{
            background: `${badgeColor}18`, color: badgeColor,
            padding: '3px 12px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700,
            border: `1px solid ${badgeColor}30`,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/* ── Main component ── */
export default function LivePipeline() {
  const [dragOver, setDragOver]   = useState(false)
  const [file, setFile]           = useState(null)
  const [status, setStatus]       = useState('idle')   // idle | running | done | error
  const [progress, setProgress]   = useState(0)
  const [stepStates, setStepStates] = useState(STEPS_META.map(() => 'pending'))
  const [stepDetails, setStepDetails] = useState(Array(6).fill(''))
  const [termLog, setTermLog]     = useState([])
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState('')
  const [activeTab, setActiveTab] = useState('ocv')
  const fileRef = useRef()
  const logRef  = useRef()

  const addLog = (text, color) =>
    setTermLog(prev => [...prev, { text, color, id: Date.now() + Math.random() }])

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file.'); return }
    setFile(f); setError(''); setStatus('idle'); setResult(null)
    setStepStates(STEPS_META.map(() => 'pending'))
    setStepDetails(Array(6).fill(''))
    setTermLog([])
  }

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  /* auto-scroll terminal */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [termLog])

  const runPipeline = async () => {
    if (!file) return
    setStatus('running')
    setProgress(3)
    setResult(null)
    setError('')
    setTermLog([])
    setStepStates(STEPS_META.map(() => 'pending'))
    setStepDetails(Array(6).fill(''))

    addLog(`Initialising NeoRide pipeline for "${file.name}"…`, '#00d4ff')
    addLog(`File size: ${(file.size/1024).toFixed(1)} KB`, '#64748b')

    const tick = setInterval(() => {
      setProgress(p => p < 85 ? +(p + Math.random() * 4).toFixed(1) : p)
    }, 500)

    try {
      const fd = new FormData()
      fd.append('file', file)

      addLog('Uploading CSV to Flask API…', '#94a3b8')

      const res = await fetch(`${API}/run-pipeline`, { method: 'POST', body: fd })
      clearInterval(tick)

      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Pipeline failed on server.')
        setStatus('error')
        addLog('ERROR: ' + (data.error || 'Unknown'), '#ef4444')
        return
      }

      /* Animate step cards one by one */
      const stepsArr = data.steps || []
      for (let i = 0; i < STEPS_META.length; i++) {
        const s = stepsArr[i] || {}
        setStepStates(prev => { const n = [...prev]; n[i] = 'running'; return n })
        addLog(`[${i+1}/6] ${STEPS_META[i].name}…`, STEPS_META[i].color)
        await new Promise(r => setTimeout(r, 320))
        setStepStates(prev => { const n = [...prev]; n[i] = 'done'; return n })
        if (s.details) {
          setStepDetails(prev => { const n = [...prev]; n[i] = s.details; return n })
          addLog(`    ✓ ${s.details}`, '#10b981')
        }
        setProgress(10 + Math.round((i + 1) / 6 * 88))
      }

      setProgress(100)
      addLog('', '')
      addLog('✓ All 6 stages complete.', '#10b981')
      if (data.metrics?.ekf) {
        addLog(`EKF SOC RMSE = ${data.metrics.ekf.rmse_pct}%  (target ≤5%)`, '#00d4ff')
        addLog(`Convergence time = ${data.metrics.ekf.conv_time_s}s`, '#7c3aed')
      }

      setResult(data)
      setStatus('done')
    } catch (e) {
      clearInterval(tick)
      setError(`Cannot reach API at ${API}. Make sure Flask is running:\n  python app.py`)
      setStatus('error')
      addLog('Connection refused. Start Flask: python app.py', '#ef4444')
    }
  }

  const reset = () => {
    setFile(null); setStatus('idle'); setResult(null)
    setStepStates(STEPS_META.map(() => 'pending'))
    setStepDetails(Array(6).fill(''))
    setTermLog([]); setError(''); setProgress(0)
  }

  const m = result?.metrics
  const c = result?.charts

  return (
    <section id="live" style={{ padding: '80px 0', minHeight: '100vh', background: '#050d1a' }}>
      <style>{`
        @keyframes lp-spin { to { transform: rotate(360deg); } }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes lp-glow  { 0%,100%{box-shadow:0 0 8px #00d4ff40} 50%{box-shadow:0 0 22px #00d4ffaa} }
        @keyframes lp-scan  { 0%{top:-100%} 100%{top:110%} }
        @keyframes lp-fadeup { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

        .lp-tab { transition: all 0.22s; border-radius: 8px; padding: 7px 18px;
          font-weight: 700; font-size: 0.82rem; cursor: pointer; border: none; }
        .lp-tab:hover { filter: brightness(1.25); }

        .lp-step-card {
          flex: 1; min-width: 150px; border-radius: 14px; padding: 16px 14px;
          border: 1px solid rgba(255,255,255,0.06);
          background: #070f1e;
          transition: all 0.35s cubic-bezier(.4,0,.2,1);
          position: relative; overflow: hidden;
        }
        .lp-step-card.running {
          border-color: rgba(0,212,255,0.45);
          background: rgba(0,212,255,0.05);
          box-shadow: 0 0 24px rgba(0,212,255,0.12);
        }
        .lp-step-card.done {
          border-color: rgba(16,185,129,0.35);
          background: rgba(16,185,129,0.05);
        }
        .lp-step-card .scan-line {
          position: absolute; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, #00d4ff, transparent);
          animation: lp-scan 1.2s linear infinite;
          display: none;
        }
        .lp-step-card.running .scan-line { display: block; }

        .lp-upload-zone {
          border: 2px dashed rgba(0,212,255,0.25);
          border-radius: 20px; padding: 56px 40px; text-align: center;
          cursor: pointer; transition: all 0.3s; background: #0a1628;
          position: relative; overflow: hidden;
        }
        .lp-upload-zone:hover, .lp-upload-zone.dragover {
          border-color: #00d4ff;
          background: rgba(0,212,255,0.04);
          box-shadow: 0 0 40px rgba(0,212,255,0.08);
        }
        .lp-upload-zone.has-file {
          border-color: #10b981;
          background: rgba(16,185,129,0.04);
        }
        .lp-run-btn {
          background: linear-gradient(135deg,#00d4ff,#7c3aed);
          color: #fff; padding: 15px 48px; border-radius: 12px;
          font-weight: 800; font-size: 1.05rem; border: none; cursor: pointer;
          box-shadow: 0 0 28px rgba(0,212,255,0.35), 0 4px 16px rgba(0,0,0,0.3);
          transition: all 0.25s; letter-spacing: 0.02em;
          animation: lp-glow 2.5s ease-in-out infinite;
        }
        .lp-run-btn:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 0 40px rgba(0,212,255,0.5), 0 8px 24px rgba(0,0,0,0.4);
        }
        .lp-terminal {
          background: #020a12; border: 1px solid rgba(0,212,255,0.15);
          border-radius: 12px; padding: 16px 20px;
          max-height: 160px; overflow-y: auto;
          font-family: 'Courier New', monospace;
          scrollbar-width: thin; scrollbar-color: #1e3a5f transparent;
        }
        .lp-chart-tab {
          padding: 7px 20px; border-radius: 8px;
          font-weight: 700; font-size: 0.82rem; cursor: pointer;
          transition: all 0.22s; white-space: nowrap;
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 2rem' }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 52, animation: 'lp-fadeup 0.6s ease' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)', color: '#10b981',
            padding: '5px 16px', borderRadius: 24, fontSize: '0.75rem',
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 18,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981',
              animation: 'lp-pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />
            Live Pipeline Execution
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontWeight: 800, marginBottom: 14,
            background: 'linear-gradient(135deg,#e2e8f0,#00d4ff)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent' }}>
            Upload Any Battery CSV → Real-Time Analysis
          </h2>
          <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: 600, margin: '0 auto', lineHeight: 1.8 }}>
            Drop any NASA-format battery CSV. The full 6-stage pipeline runs live on your data —
            Coulomb Counting → OCV fit → ECM parameter ID → Extended Kalman Filter.
          </p>
        </div>

        {/* ── Upload Zone ── */}
        {status === 'idle' && (
          <>
            <div
              className={`lp-upload-zone${dragOver ? ' dragover' : ''}${file ? ' has-file' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{ marginBottom: 24 }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />

              {/* Animated corner accents */}
              {['0 0','0 auto','auto 0','auto auto'].map((m,i) => (
                <div key={i} style={{
                  position:'absolute', [i<2?'top':'bottom']:0, [i%2===0?'left':'right']:0,
                  width:20, height:20,
                  borderTop: i<2?'2px solid #00d4ff40':undefined,
                  borderBottom: i>=2?'2px solid #00d4ff40':undefined,
                  borderLeft: i%2===0?'2px solid #00d4ff40':undefined,
                  borderRight: i%2!==0?'2px solid #00d4ff40':undefined,
                }} />
              ))}

              {file ? (
                <div style={{ animation: 'lp-fadeup 0.3s ease' }}>
                  <div style={{ fontSize: '3.5rem', marginBottom: 14,
                    filter: 'drop-shadow(0 0 12px #10b981)' }}>✅</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginBottom: 6 }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                    {(file.size / 1024).toFixed(1)} KB · Click to change file
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '3.5rem', marginBottom: 16,
                    filter: 'drop-shadow(0 0 20px rgba(0,212,255,0.4))',
                    animation: 'lp-pulse 3s ease-in-out infinite' }}>⚡</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    Drop your battery CSV here or{' '}
                    <span style={{ color: '#00d4ff', textDecoration: 'underline' }}>browse</span>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                    Accepts any NASA ALT format CSV (battery00.csv, battery01.csv, etc.)
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                    {['mode','voltage_load','current_load','time','mission_type'].map(c => (
                      <span key={c} style={{
                        background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)',
                        color: '#00d4ff', padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem',
                        fontFamily: 'monospace',
                      }}>{c}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12, padding: '14px 20px', marginBottom: 24,
                color: '#ef4444', fontSize: '0.875rem', whiteSpace: 'pre-wrap',
              }}>⚠️ {error}</div>
            )}

            {file && (
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <button className="lp-run-btn" onClick={runPipeline}>
                  🚀 Run Full Pipeline
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Running / Done View ── */}
        {(status === 'running' || status === 'done' || status === 'error') && (
          <div style={{ animation: 'lp-fadeup 0.4s ease' }}>

            {/* Progress bar + header */}
            <div style={{
              background: '#0a1628', border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 18, padding: 28, marginBottom: 24,
              boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {status === 'running' ? <Spinner color="#00d4ff" size={20} /> :
                   status === 'done'    ? <span style={{ fontSize: '1.3rem' }}>✅</span> :
                                          <span style={{ fontSize: '1.3rem' }}>❌</span>}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem',
                      color: status === 'done' ? '#10b981' : status === 'error' ? '#ef4444' : '#00d4ff' }}>
                      {status === 'running' ? 'Pipeline executing…' :
                       status === 'done'    ? `Pipeline complete — ${file?.name}` :
                                              'Pipeline error'}
                    </div>
                    {file && status !== 'error' && (
                      <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 2 }}>
                        {file.name} · {(file.size/1024).toFixed(1)} KB
                      </div>
                    )}
                  </div>
                </div>
                {status === 'done' && (
                  <button onClick={reset} style={{
                    background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)',
                    color: '#00d4ff', padding: '6px 16px', borderRadius: 8,
                    fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                  }}>↺ New Upload</button>
                )}
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', marginBottom: 24, position: 'relative' }}>
                <div style={{
                  height: '100%', borderRadius: 10,
                  background: status === 'done' ? 'linear-gradient(90deg,#10b981,#00d4ff)' :
                               status === 'error' ? '#ef4444' :
                               'linear-gradient(90deg,#00d4ff,#7c3aed,#10b981)',
                  backgroundSize: '200% 100%',
                  width: `${progress}%`,
                  transition: 'width 0.5s ease',
                  boxShadow: status === 'done' ? '0 0 12px rgba(16,185,129,0.6)' : '0 0 12px rgba(0,212,255,0.6)',
                }} />
              </div>

              {/* Step cards */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {STEPS_META.map((meta, i) => {
                  const st = stepStates[i]
                  return (
                    <div key={i} className={`lp-step-card ${st}`}>
                      <div className="scan-line" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: '1.05rem' }}>{meta.icon}</span>
                        {st === 'running' && <Spinner color={meta.color} size={13} />}
                        {st === 'done'    && <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 900 }}>✓</span>}
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 700,
                          color: st === 'done' ? '#10b981' : st === 'running' ? meta.color : '#334155',
                        }}>{meta.name}</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#334155', lineHeight: 1.5 }}>
                        {stepDetails[i] || meta.desc}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Terminal log */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['#ef4444','#f59e0b','#10b981'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.8 }} />
                  ))}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#334155', fontFamily: 'monospace' }}>
                  neoride-pipeline — bash
                </span>
              </div>
              <div ref={logRef} className="lp-terminal">
                <div style={{ color: '#10b981', fontSize: '0.72rem', fontFamily: 'monospace', marginBottom: 8 }}>
                  NeoRide Battery Modelling v1.0 — Pipeline Console
                </div>
                {termLog.map((l, i) => (
                  <LogLine key={l.id} text={l.text} color={l.color} delay={0} />
                ))}
                {status === 'running' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Spinner color="#00d4ff" size={10} />
                    <span style={{ fontSize: '0.72rem', color: '#00d4ff', fontFamily: 'monospace',
                      animation: 'lp-pulse 1.2s ease-in-out infinite' }}>processing…</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12, padding: '14px 20px', marginBottom: 24,
                color: '#ef4444', fontSize: '0.875rem', whiteSpace: 'pre-wrap',
              }}>⚠️ {error}
                <button onClick={reset} style={{
                  marginLeft: 16, background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444',
                  padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                }}>Try Again</button>
              </div>
            )}

            {/* ── RESULTS ── */}
            {status === 'done' && m && c && (
              <div style={{ animation: 'lp-fadeup 0.5s ease' }}>

                {/* Section title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(0,212,255,0.3),transparent)' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00d4ff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Live Results from {file?.name}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg,rgba(0,212,255,0.3),transparent)' }} />
                </div>

                {/* Metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 32 }}>
                  <MetricBox label="Capacity Q_max"        value={m.dataset.q_max_ah}    unit=" Ah"  color="#00d4ff" delay={0} />
                  <MetricBox label="Data Points"           value={m.dataset.n_points?.toLocaleString()} unit="" color="#7c3aed" delay={60} />
                  <MetricBox label="OCV Poly RMSE"         value={m.ocv.rmse_mv}          unit=" mV"  color="#10b981" delay={120} />
                  <MetricBox label="ECM Voltage RMSE"      value={m.ecm.rmse_mv}          unit=" mV"  color="#f59e0b" delay={180} />
                  <MetricBox label="R₀"                    value={m.ecm.R0_mohm}          unit=" mΩ"  color="#00d4ff" delay={240} />
                  <MetricBox label="R₁"                    value={m.ecm.R1_mohm}          unit=" mΩ"  color="#7c3aed" delay={300} />
                  <MetricBox label="C₁"                    value={m.ecm.C1_F}             unit=" F"   color="#10b981" delay={360} />
                  <MetricBox label="τ = R₁·C₁"            value={m.ecm.tau_s}            unit=" s"   color="#f59e0b" delay={420} />
                  <MetricBox label="EKF SOC RMSE"          value={m.ekf.rmse_pct}         unit="%"    color="#10b981" delay={480} />
                  <MetricBox label="EKF SOC MAE"           value={m.ekf.mae_pct}          unit="%"    color="#10b981" delay={540} />
                  <MetricBox label="Convergence Time"      value={m.ekf.conv_time_s}      unit=" s"   color="#00d4ff" delay={600} />
                  <MetricBox label="Final SOC Error"       value={m.ekf.final_error_pct}  unit="%"    color="#7c3aed" delay={660} />
                </div>

                {/* Chart tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  {[
                    { id: 'ocv',   label: '📈 OCV–SOC',     color: '#00d4ff' },
                    { id: 'ecm',   label: '⚡ ECM Voltage',  color: '#10b981' },
                    { id: 'ekf',   label: '🎯 EKF SOC',      color: '#7c3aed' },
                    { id: 'error', label: '📉 SOC Error',    color: '#f59e0b' },
                    { id: 'multi', label: '🔄 Multi-Start',  color: '#ef4444' },
                  ].map(tab => (
                    <button key={tab.id} className="lp-chart-tab"
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        background: activeTab === tab.id
                          ? `linear-gradient(135deg,${tab.color}25,${tab.color}10)`
                          : 'rgba(255,255,255,0.03)',
                        color:   activeTab === tab.id ? tab.color : '#475569',
                        border:  activeTab === tab.id
                          ? `1px solid ${tab.color}50`
                          : '1px solid rgba(255,255,255,0.07)',
                      }}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* OCV Chart */}
                {activeTab === 'ocv' && (
                  <ChartCard title="OCV – SOC Polynomial Fit" badge={`RMSE: ${m.ocv.rmse_mv} mV`} badgeColor="#00d4ff">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={c.ocv} margin={{ top: 4, right: 16, left: -10, bottom: 8 }}>
                        <CartesianGrid stroke={gridClr} />
                        <XAxis dataKey="soc" tick={tickStyle} label={{ value: 'SOC (%)', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={tickStyle} domain={['auto','auto']} label={{ value: 'OCV (V)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="measured" stroke="rgba(0,212,255,0.5)" strokeWidth={1.5} dot={{ r: 2 }} name="Measured OCV" />
                        <Line type="monotone" dataKey="fit"      stroke="#7c3aed"              strokeWidth={3}   dot={false}     name="Poly Fit (deg 9)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {/* ECM Chart */}
                {activeTab === 'ecm' && (
                  <ChartCard title="ECM Voltage Fit vs Measured" badge={`RMSE: ${m.ecm.rmse_mv} mV  |  MAE: ${m.ecm.mae_mv} mV`} badgeColor="#10b981">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={c.ecm} margin={{ top: 4, right: 16, left: -10, bottom: 8 }}>
                        <CartesianGrid stroke={gridClr} />
                        <XAxis dataKey="time" tick={tickStyle} label={{ value: 'Time (s)', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={tickStyle} domain={['auto','auto']} label={{ value: 'Voltage (V)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="measured"  stroke="rgba(0,212,255,0.75)" strokeWidth={2} dot={false} name="Measured" />
                        <Line type="monotone" dataKey="simulated" stroke="#ef4444"               strokeWidth={2} dot={false} strokeDasharray="5 3" name="ECM Simulated" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {/* EKF Chart */}
                {activeTab === 'ekf' && (
                  <ChartCard title="EKF SOC Estimation (init=50%)" badge={`RMSE: ${m.ekf.rmse_pct}%  |  Conv: ${m.ekf.conv_time_s}s`} badgeColor="#7c3aed">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={c.ekf} margin={{ top: 4, right: 16, left: -10, bottom: 8 }}>
                        <CartesianGrid stroke={gridClr} />
                        <XAxis dataKey="time" tick={tickStyle} label={{ value: 'Time (s)', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={tickStyle} domain={[0, 105]} label={{ value: 'SOC (%)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="reference" stroke="#00d4ff" strokeWidth={2.5} dot={false} name="Reference (CC)" />
                        <Line type="monotone" dataKey="ekf"       stroke="#10b981" strokeWidth={2}   dot={false} name="EKF Estimate" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {/* Error Chart */}
                {activeTab === 'error' && (
                  <ChartCard title="SOC Error Over Time" badge={`Final: ${m.ekf.final_error_pct}%`} badgeColor="#f59e0b">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={c.error} margin={{ top: 4, right: 16, left: -10, bottom: 8 }}>
                        <CartesianGrid stroke={gridClr} />
                        <XAxis dataKey="time" tick={tickStyle} label={{ value: 'Time (s)', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={tickStyle} label={{ value: 'Error (%)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <ReferenceLine y={2}  stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" label={{ value: '+2%', fill: '#475569', fontSize: 9 }} />
                        <ReferenceLine y={-2} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" label={{ value: '−2%', fill: '#475569', fontSize: 9 }} />
                        <ReferenceLine y={0}  stroke="rgba(255,255,255,0.08)" />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        <Line type="monotone" dataKey="error" stroke="#f59e0b" strokeWidth={2} dot={false} name="SOC Error (%)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                {/* Multi-start Chart */}
                {activeTab === 'multi' && (
                  <ChartCard title="EKF Multi-Start Robustness" badge="All 5 inits converge" badgeColor="#10b981">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={c.multi} margin={{ top: 4, right: 16, left: -10, bottom: 8 }}>
                        <CartesianGrid stroke={gridClr} />
                        <XAxis dataKey="time" tick={tickStyle} label={{ value: 'Time (s)', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={tickStyle} domain={[0, 105]} label={{ value: 'SOC (%)', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                        {['init10','init30','init50','init70','init90'].map((k, i) => (
                          <Line key={k} type="monotone" dataKey={k} stroke={multiColors[i]} strokeWidth={1.8} dot={false} name={`Init ${[10,30,50,70,90][i]}%`} />
                        ))}
                        <Line type="monotone" dataKey="reference" stroke="rgba(255,255,255,0.6)" strokeWidth={2.5} dot={false} strokeDasharray="6 3" name="Reference (CC)" />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* Convergence table */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                      {Object.entries(m.multi_start).map(([k, v], i) => (
                        <div key={k} style={{
                          flex: 1, minWidth: 100,
                          background: '#070f1e',
                          border: `1px solid ${multiColors[i]}30`,
                          borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: multiColors[i] }}>
                            {[10,30,50,70,90][i]}%
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#10b981', marginTop: 3 }}>
                            ✓ {v.conv_time_s ? `${v.conv_time_s}s` : '—'}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>
                            err: {v.final_error_pct}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                )}

                {/* Summary banner */}
                <div style={{
                  marginTop: 28,
                  background: 'linear-gradient(135deg,rgba(16,185,129,0.07),rgba(0,212,255,0.05))',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: 16, padding: '22px 28px',
                  display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
                  boxShadow: '0 0 32px rgba(16,185,129,0.06)',
                }}>
                  <div style={{ fontSize: '2.2rem', filter: 'drop-shadow(0 0 10px #10b981)' }}>🏆</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#10b981', marginBottom: 5 }}>
                      Analysis complete for <span style={{ color: '#e2e8f0' }}>{file?.name}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.8 }}>
                      Processed <strong style={{ color: '#e2e8f0' }}>{m.dataset.n_points?.toLocaleString()} data points</strong> ·
                      Q_max = <strong style={{ color: '#e2e8f0' }}>{m.dataset.q_max_ah} Ah</strong> ·
                      Duration = <strong style={{ color: '#e2e8f0' }}>{m.dataset.duration_s}s</strong> ·
                      EKF RMSE = <strong style={{ color: '#10b981' }}>{m.ekf.rmse_pct}%</strong> ·
                      Target ≤5%: <strong style={{ color: '#10b981' }}>✓ Achieved</strong>
                    </div>
                  </div>
                  <button onClick={reset} style={{
                    background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)',
                    color: '#00d4ff', padding: '10px 22px', borderRadius: 10,
                    fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem',
                  }}>↺ Run Another</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
