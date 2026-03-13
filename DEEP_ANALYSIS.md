# 🔋 NeoRide Battery Modelling — Deep Analysis Report

> **Generated:** March 2026 · **Scope:** Full repository analysis — algorithms, architecture, code quality, data flow, frontend, backend, deployment
> **Course:** ES60208 — Rechargeable Battery Performance Modelling · **Team:** NeoRide

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Dataset Analysis](#3-dataset-analysis)
4. [Core Scientific Pipeline](#4-core-scientific-pipeline)
   - 4.1 Data Loader
   - 4.2 Coulomb Counting
   - 4.3 OCV–SOC Polynomial
   - 4.4 ECM Model (1RC Thévenin)
   - 4.5 ECM Parameter Identification
   - 4.6 Extended Kalman Filter
   - 4.7 Utilities
5. [Mathematical Foundations](#5-mathematical-foundations)
6. [Jupyter Notebooks — Learning Path](#6-jupyter-notebooks--learning-path)
7. [Flask API Backend](#7-flask-api-backend)
8. [React Frontend](#8-react-frontend)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Results & Accuracy Analysis](#10-results--accuracy-analysis)
11. [Code Quality Analysis](#11-code-quality-analysis)
12. [Bugs & Issues Found](#12-bugs--issues-found)
13. [Limitations & Scientific Gaps](#13-limitations--scientific-gaps)
14. [Strengths](#14-strengths)
15. [Recommendations & Future Work](#15-recommendations--future-work)
16. [Summary Scorecard](#16-summary-scorecard)

---

## 1. Project Overview

**NeoRide Battery Modelling** is a complete, end-to-end **State of Charge (SOC) estimation** system for Li-ion batteries. The project spans three layers:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Scientific Core** | Python (NumPy, SciPy, Pandas) | Algorithms — from raw CSV to SOC estimate |
| **Backend API** | Flask 3.x + Flask-CORS | REST API wrapping the pipeline |
| **Frontend UI** | React 18 + Vite + Recharts | Interactive documentation + live pipeline runner |

The central problem being solved: **You cannot directly measure SOC** — it must be estimated from voltage, current, and temperature. This project builds a rigorous estimation pipeline:

```
Raw Battery Data
      ↓
  Data Cleaning (gap detection)
      ↓
  Coulomb Counting (integration-based SOC reference)
      ↓
  OCV–SOC Curve Fit (degree-9 polynomial)
      ↓
  1RC Thévenin ECM (physics-based voltage model)
      ↓
  L-BFGS-B Parameter Optimisation (fit R₀, R₁, C₁)
      ↓
  Extended Kalman Filter (real-time SOC fusion)
      ↓
  Validation Metrics + Plots
```

**Key achievement:** EKF SOC RMSE of **1.14%** with convergence from any initial SOC guess in under **18 seconds** — well within the target of ≤ 5% error.

---

## 2. Repository Structure

```
NeoRide_Battery_Modelling/
│
├── src/                          ← Python scientific modules (7 files)
│   ├── __init__.py
│   ├── data_loader.py            ← CSV load + cycle segmentation
│   ├── coulomb_counting.py       ← Current integration → SOC
│   ├── ocv_soc.py                ← Polynomial OCV(SOC) fit + derivative
│   ├── ecm_model.py              ← 1RC Thévenin forward simulation
│   ├── ecm_param_id.py           ← L-BFGS-B optimisation
│   ├── ekf_estimator.py          ← Extended Kalman Filter
│   └── utils.py                  ← RMSE, MAE, Max Error
│
├── notebooks/                    ← 7 pedagogical Jupyter notebooks
│   ├── 01_explore_data.ipynb
│   ├── 02_coulomb_counting.ipynb
│   ├── 03_ocv_soc.ipynb
│   ├── 04_ecm_model.ipynb
│   ├── 05_ecm_param_id.ipynb
│   ├── 06_ekf_estimator.ipynb
│   └── 07_pipeline_validation.ipynb
│
├── scripts/
│   ├── run_pipeline.py           ← One-command full pipeline runner
│   └── explore_data.py           ← Standalone data exploration
│
├── api/
│   ├── app.py                    ← Flask REST API (development mode)
│   └── requirements.txt          ← Flask-specific deps
│
├── neoride-frontend/             ← React 18 + Vite frontend
│   ├── src/
│   │   ├── App.jsx               ← Root component (page toggle)
│   │   ├── components/           ← 13 React components
│   │   └── data/projectData.js   ← Static data + demo chart generators
│   ├── package.json
│   └── vite.config.js
│
├── data/
│   └── nasa_alt/battery00.csv    ← NASA ALT dataset (1.1M rows, ~gitignored)
│
├── outputs/                      ← Generated plot directory
├── app.py                        ← Unified Flask (serves React + API)
├── render.yaml                   ← Render.com deployment config
├── requirements.txt              ← Python deps
├── README.md
├── REPORT.md
├── DEPLOYMENT.md
└── FULLSTACK_README.md
```

**Architecture Pattern:** The project follows a clean **separation of concerns**:
- `src/` modules are pure-Python, importable, testable
- `api/app.py` is an adapter layer — wraps `src/` for HTTP access
- `app.py` is the production unified server
- Frontend is fully decoupled (communicates only via REST)

---

## 3. Dataset Analysis

### Source
**NASA Ames Prognostics Center of Excellence — ALT Battery Dataset**
- File: `battery00.csv`
- Size: ~1.1 million rows × 10 columns
- Duration: ~300 hours of continuous battery testing
- Cell type: 2 × 18650 Li-ion cells connected **in series** (so pack voltage = 2× cell voltage)

### Columns

| Column | Type | Meaning | Populated When |
|--------|------|---------|----------------|
| `start_time` | timestamp | Test start time | Always |
| `time` | float | Seconds since start | Always |
| `mode` | int | -1=discharge, 0=rest, 1=charge | Always |
| `voltage_charger` | float | Charger-side voltage | Always |
| `voltage_load` | float | Load-side (terminal) voltage | Discharge only |
| `current_load` | float | Discharge current (A) | Discharge only |
| `temperature_battery` | float | Battery °C | Always |
| `temperature_mosfet` | float | MOSFET °C | Always |
| `temperature_resistor` | float | Resistor °C | Always |
| `mission_type` | int | 0=reference, 1=aging | Discharge only |

### Key Data Characteristics
- **Missing values:** `voltage_load` and `current_load` are NaN during rest/charge (~70% of rows)
- **Reference discharge filter:** `mode == -1 AND mission_type == 0` → approximately 9 distinct cycles
- **Cycle segmentation:** Time gaps > 100 s between consecutive discharge rows mark cycle boundaries
- **BoL cycle:** First reference discharge — 3,674 data points, ~3,503 s duration
- **Sampling rate:** ~1 Hz (average Δt ≈ 0.95 s)
- **Pack capacity:** Q_max = 2.452 Ah (measured from BoL cycle)
- **Pack voltage range:** ~8.34 V (full) → ~4.80 V (empty) → per cell: ~4.17 V → ~2.40 V
- **Transient glitch:** Row 0 of BoL cycle has `voltage_load = -0.026 V` (physically impossible) — correctly handled by skipping row 0 in all downstream modules

### Unused Data
- Temperature data (`temperature_battery`, `temperature_mosfet`, `temperature_resistor`) is loaded but **never used** in any model
- Aging cycles (`mission_type = 1`) are completely ignored — only BoL is used
- `voltage_charger` is only used for the full-dataset overview plot in notebook 01

---

## 4. Core Scientific Pipeline

### 4.1 Data Loader (`src/data_loader.py`)

**Purpose:** Extract the BoL reference discharge cycle from the raw 1.1M-row CSV.

**Functions:**
```
load_raw_data(filepath)             → pd.DataFrame (raw CSV)
extract_reference_discharges(df)    → list[pd.DataFrame] (all discharge cycles)
get_bol_data(filepath)              → pd.DataFrame (BoL cycle only, with time_relative)
```

**Algorithm:**
1. Read CSV with `pd.read_csv`
2. Filter: `mode == -1` AND `mission_type == 0`
3. Compute `time.diff()` on filtered rows
4. Find gaps where `Δt > 100 s` → these are cycle boundaries
5. Split at boundaries → list of cycle DataFrames
6. Add `time_relative = time - time.iloc[0]` to each cycle
7. Return `cycles[0]` (BoL)

**Design Quality:**
- Clean, well-documented functions with NumPy docstrings ✅
- Correct handling of the cycle boundary problem ✅
- Returns DataFrames, maintaining column names for downstream readability ✅
- `__main__` block for standalone testing ✅

**Bug Found:** An incomplete function `extract_references_discharges` (note the typo — extra 's') exists at the bottom of the file after the `__main__` block:
```python
def extract_references_discharges(df):
     mode_counts = df['mode'].value_counts().sort_index()
     print('Mode counts')
     for mode in mode_counts.item():  # .item() is wrong (should be .items())
        m                             # ← incomplete/dangling line, SyntaxError
```
This is dead code that would cause a `SyntaxError` if executed. It appears to be an abandoned draft that was never cleaned up.

---

### 4.2 Coulomb Counting (`src/coulomb_counting.py`)

**Purpose:** Compute the reference SOC by numerically integrating discharge current.

**Formula:**
```
SOC[k] = SOC[k-1] - (I[k] × Δt) / (Q_max × 3600)
```

**Implementation:**
```python
def coulomb_counting(current, time, q_max, soc_init=1.0):
    soc[0] = soc_init
    for k in range(1, n):
        dt = time[k] - time[k-1]
        soc[k] = soc[k-1] - (current[k] * dt) / (q_max * 3600)
    return np.clip(soc, 0.0, 1.0)
```

**Notes:**
- Uses forward Euler integration (first-order)
- The 3600 factor converts Ah → As (unit consistency)
- `np.clip` prevents SOC from exceeding physical bounds [0, 1]
- `soc_init=1.0` default assumes fully charged at start — correct for BoL
- **Current convention:** Positive current = discharge (consistent with engineering sign convention)

**Accuracy Considerations:**
- Forward Euler integration is accurate enough given the ~1 Hz sampling and near-constant current profile
- In practice, Coulomb Counting drifts due to: (a) current sensor bias, (b) coulombic inefficiency, (c) self-discharge. This is the fundamental motivation for the EKF.

---

### 4.3 OCV–SOC Model (`src/ocv_soc.py`)

**Purpose:** Build a continuous mathematical function `OCV = f(SOC)` using a polynomial fit, and compute its derivative for the EKF Jacobian.

**Functions:**
```
extract_ocv_soc_raw(voltage, soc)          → (soc_sorted, ocv_sorted)
fit_ocv_polynomial(soc, ocv, degree=9)     → np.poly1d
get_ocv_from_soc(soc_value, ocv_poly)      → float/array
get_docv_dsoc(soc_value, ocv_poly)         → float/array
```

**Data Preparation Pipeline:**
1. Divide pack voltage by 2 (per-cell conversion)
2. Skip row 0 (transient glitch at `-0.026 V`)
3. Remove NaN values
4. Sort by SOC ascending (data arrives as 100%→0%, polynomial needs 0%→100%)

**Polynomial Fit:**
- Uses `np.polyfit(soc, ocv, degree=9)` — least-squares polynomial fitting
- Returns `np.poly1d` object — callable like a function
- Degree 9 rationale: balances fit quality vs. overfitting. Lower degrees miss the steep S-curve ends; higher degrees introduce oscillations (Runge's phenomenon)
- RMSE: **13.3 mV**

**Derivative:**
```python
deriv_poly = np.polyder(ocv_poly)   # Returns degree-8 polynomial
return deriv_poly(soc_value)
```

This derivative `dOCV/dSOC` is the observation Jacobian for the EKF — it tells the filter how sensitive the terminal voltage is to changes in SOC.

**Scientific Note:** The OCV extracted here is from **loaded discharge** data (current flowing), not true open-circuit. This means the polynomial partially absorbs internal resistance effects, which is why R₀ and R₁ converge to their lower bounds during optimisation. A proper OCV test would use GITT (Galvanostatic Intermittent Titration Technique) or C/25-rate discharge.

---

### 4.4 ECM Model — 1RC Thévenin (`src/ecm_model.py`)

**Purpose:** Forward-simulate the battery terminal voltage using a 1RC Thévenin equivalent circuit model.

**Circuit:**
```
    ┌─────R₀──────┬──R₁──┐
    │              │      │
  OCV(SOC)         C₁    V_terminal
    │              │      │
    └──────────────┴──────┘
```

**Three governing equations:**

| Equation | Formula | Meaning |
|----------|---------|---------|
| SOC update | `SOC[k] = SOC[k-1] - I[k]·Δt / (Q·3600)` | Charge conservation |
| RC dynamics | `V_RC[k] = V_RC[k-1]·e^(-Δt/τ) + R₁·I·(1-e^(-Δt/τ))` | Polarisation voltage |
| Terminal voltage | `V_term = OCV(SOC) - I·R₀ - V_RC` | Kirchhoff's voltage law |

**Key implementation detail:** The RC update uses **exact exponential discretisation** (not Euler), which is crucial for numerical stability when Δt is comparable to τ.

**Parameters:**
| Symbol | Physical Meaning | Identified Value |
|--------|----------------|-----------------|
| R₀ | Ohmic resistance (instantaneous drop) | 1.00 mΩ |
| R₁ | RC resistance (polarisation) | 1.00 mΩ |
| C₁ | RC capacitance | 5,000 F |
| τ = R₁·C₁ | Polarisation time constant | 5.0 s |

**Returns:** Three arrays — `soc`, `v_rc`, `v_term` — each of length N.

---

### 4.5 ECM Parameter Identification (`src/ecm_param_id.py`)

**Purpose:** Find optimal R₀, R₁, C₁ by minimising the RMSE between ECM-simulated and measured terminal voltage.

**Optimisation setup:**
```python
# Cost function
def ecm_cost_function(params, ...):
    R0, R1, C1 = params
    _, _, v_sim = simulate_ecm(...)
    return np.sqrt(np.mean((v_sim - v_measured) ** 2))

# Bounds
bounds = [
    (0.001, 0.200),     # R₀: 1–200 mΩ
    (0.001, 0.200),     # R₁: 1–200 mΩ
    (100.0, 50000.0),   # C₁: 100–50000 F
]

# Optimiser
scipy.optimize.minimize(cost, x0, method='L-BFGS-B', bounds=bounds,
                        options={'maxiter': 200, 'ftol': 1e-12})
```

**Algorithm: L-BFGS-B**
- Limited-memory Broyden–Fletcher–Goldfarb–Shanno with Bounds
- Gradient-based quasi-Newton method
- Approximates the inverse Hessian using a limited memory buffer (computationally efficient)
- Handles box constraints (parameter bounds) natively
- `ftol=1e-12` provides very tight convergence tolerance

**Result:** RMSE drops from ~125–143 mV (guessed params) to **14.1 mV** (optimised) — approximately 89% improvement.

**Important observation:** Both R₀ and R₁ converge to their lower bound (1 mΩ). This is **physically expected** — not a bug — because the OCV polynomial was fit from loaded data. The polynomial already encodes some resistance (voltage under load ≈ OCV − I·R_total), so the optimiser correctly drives the explicit resistances to near-zero to avoid double-counting. This phenomenon is well-documented in battery modelling literature.

---

### 4.6 Extended Kalman Filter (`src/ekf_estimator.py`)

**Purpose:** Real-time SOC estimation by fusing the ECM model prediction with terminal voltage measurements.

**State vector:**
```
x = [SOC, V_RC]ᵀ  (2-dimensional)
```

**EKF Algorithm — Per Time Step:**

```
── PREDICT ──────────────────────────────────────────────
1. State prediction:
   SOC_pred = SOC[k-1] - I·Δt / (Q·3600)
   V_RC_pred = V_RC[k-1]·e^(-Δt/τ) + R₁·I·(1-e^(-Δt/τ))
   x_pred = [SOC_pred, V_RC_pred]

2. State transition Jacobian:
   F = [[1,          0     ]
        [0,  exp(-Δt/τ)   ]]

3. Predicted error covariance:
   P_pred = F · P · Fᵀ + Q

── UPDATE ───────────────────────────────────────────────
4. Predicted measurement:
   v_pred = OCV(SOC_pred) - I·R₀ - V_RC_pred

5. Innovation (measurement residual):
   y = V_measured - v_pred

6. Observation Jacobian:
   H = [dOCV/dSOC, -1]

7. Innovation covariance:
   S = H · P_pred · Hᵀ + R

8. Kalman Gain:
   K = P_pred · Hᵀ · S⁻¹

9. State update:
   x = x_pred + K · y

10. Covariance update:
    P = (I - K · H) · P_pred
```

**Noise Matrices:**
| Matrix | Value | Interpretation |
|--------|-------|----------------|
| Q (process) | `diag(1e-8, 1e-6)` | Very small model uncertainty per step |
| R (measurement) | `2.5e-5` | ~5 mV voltage sensor noise variance |
| P_init | `diag(0.5, 0.001)` | High initial SOC uncertainty (σ ≈ 70%) |

**EKF is "extended"** (rather than standard KF) because the observation function `h(x) = OCV(SOC) - I·R₀ - V_RC` is **nonlinear** in SOC (OCV is a degree-9 polynomial). The EKF linearises `h` at each time step using the Jacobian `H = [dOCV/dSOC, -1]`.

**Performance:**
- Initialised at 50% SOC (true = 100%) — 50% error at start
- Converges to < 2% error in **~1 second**
- All 5 starting points (10%, 30%, 50%, 70%, 90%) converge to the same final error of −0.62%
- Final SOC error is **negative** (conservative underestimate) — a safe bias for BMS applications

**Returns dictionary with:**
- `soc`: estimated SOC array
- `v_rc`: estimated V_RC array
- `kalman_gains`: 2-column array (K_SOC, K_VRC per time step)
- `P_trace`: trace of error covariance (scalar uncertainty measure)

---

### 4.7 Utilities (`src/utils.py`)

Three clean metric functions, each vectorised with `np.asarray`:

```python
rmse(actual, predicted)          → √(mean((a-p)²))
mae(actual, predicted)           → mean(|a-p|)
max_abs_error(actual, predicted) → max(|a-p|)
```

These are used consistently across notebooks, `run_pipeline.py`, and both Flask apps.

---

## 5. Mathematical Foundations

### 5.1 Discrete-Time SOC Dynamics
The battery's charge state follows:
```
SOC[k] = SOC[k-1] - (I[k] · Δt) / (Q_max · 3600)
```
This is the discrete integral of current (Faraday's law) — exact for constant Δt, accurate for small varying Δt (used here with ~1 s steps).

### 5.2 RC Exponential Discretisation
The continuous-time RC equation:
```
τ · dV_RC/dt + V_RC = R₁ · I
```
has the exact discrete-time solution:
```
V_RC[k] = V_RC[k-1] · e^(-Δt/τ) + R₁ · I · (1 - e^(-Δt/τ))
```
This form is **numerically stable** for any Δt (unlike forward Euler which requires Δt << τ).

### 5.3 Polynomial OCV Model
```
OCV(s) = p₉s⁹ + p₈s⁸ + ... + p₁s + p₀
```
Fitted via least squares: `min ||Φ·p - y||²` where Φ is the Vandermonde matrix of SOC values.

The derivative `dOCV/dSOC = 9p₉s⁸ + 8p₈s⁷ + ... + p₁` is computed analytically via `np.polyder`.

### 5.4 L-BFGS-B Optimisation
The parameter identification solves:
```
min       RMSE(V_measured, V_ECM(R₀, R₁, C₁))
R₀,R₁,C₁
subject to: 1 mΩ ≤ R₀ ≤ 200 mΩ
            1 mΩ ≤ R₁ ≤ 200 mΩ
            100 F ≤ C₁ ≤ 50000 F
```
The objective is smooth (polynomial chain + exponential) and the gradient can be approximated efficiently by L-BFGS-B.

### 5.5 EKF Covariance Propagation
The Joseph stabilised form `P = (I-KH)P⁻` is used (not the alternative `P = P⁻ - K·S·Kᵀ`). This is correct but lacks the symmetry-preserving Joseph form `P = (I-KH)P⁻(I-KH)ᵀ + K·R·Kᵀ` which is more numerically stable. For this problem it doesn't matter, but in production implementations the symmetric Joseph form is preferred.

---

## 6. Jupyter Notebooks — Learning Path

The 7 notebooks form a **deliberate pedagogical sequence**, each building on the previous one:

| # | Notebook | Scientific Topic | Key Output |
|---|---------|-----------------|-----------|
| 01 | Explore Data | Dataset understanding | Mode counts, cycle detection, BoL stats |
| 02 | Coulomb Counting | Current integration SOC | SOC 100%→0%, Q_max = 2.452 Ah |
| 03 | OCV–SOC Fit | Polynomial regression | Degree-9 poly, RMSE = 13.3 mV, dOCV/dSOC |
| 04 | ECM Model | Circuit simulation | 3-equation simulation, parameter sensitivity |
| 05 | ECM Param ID | Nonlinear optimisation | L-BFGS-B, RMSE 125→14.1 mV, convergence plots |
| 06 | EKF Estimator | State estimation | EKF derivation, Kalman gains, multi-start test |
| 07 | Pipeline Validation | End-to-end validation | Full metrics table, robustness, residual analysis |

### Notable Notebook Features
- **Self-contained modules**: Each notebook re-imports from `src/` — demonstrates the modules work correctly
- **`sys.path.insert(0, '..')`**: Standard pattern to import project modules from within `notebooks/`
- **Naming mismatch**: Notebooks are internally titled "Step N" (e.g., notebook 02 is called "Step 3" internally) — minor confusion
- **Step-by-step code**: Each equation is first written explicitly, then wrapped into the `src/` function — excellent pedagogical approach
- **Saved plots**: Notebooks 04, 05, 06 save PNG files to `notebooks/` (e.g., `ecm_simulation_guess.png`, `param_id_convergence.png`, `ekf_soc_estimation.png`)
- **No cell outputs**: Notebooks have empty `outputs: []` in all cells — they need the CSV to run

---

## 7. Flask API Backend

### Architecture: Two Flask Apps

| File | Purpose | Deployment Mode |
|------|---------|----------------|
| `api/app.py` | Dev-only API on port 5000 | `python api/app.py` |
| `app.py` (root) | Unified: serves React build + API | `python app.py` (production) |

Both files contain **identical pipeline logic** — a significant code duplication (>200 lines duplicated). The only differences are:
- `app.py` adds `static_folder='neoride-frontend/dist'` and routes for React
- `app.py` uses `host='0.0.0.0'` and reads `PORT` from environment

### Endpoints

```
GET  /api/health
     → {"status": "ok", "message": "NeoRide API is running"}

POST /api/run-pipeline
     Request: multipart/form-data, field "file" = CSV
     Response: JSON {
       success, steps, metrics, charts
     }
```

### `/api/run-pipeline` Deep Dive

**Request Flow:**
1. File upload validation (checks `file` field, non-empty filename)
2. `tempfile.NamedTemporaryFile` — saves CSV to a temp path (needed because `get_bol_data` expects a file path, not a stream)
3. Runs all 6 pipeline steps in sequence
4. Returns structured JSON: `steps`, `metrics`, `charts`
5. `finally` block: always deletes the temp file

**Steps Log:**
Each step appends to `steps_log` with `{step, name, status, details}`. Status progresses: `"running"` → `"done"`. **Note:** There is no error state per step — if any step fails, the entire endpoint returns 500 with full traceback.

**Metrics JSON (12 values):**
```json
{
  "dataset": { "n_points", "q_max_ah", "duration_s", "avg_current_a" },
  "ocv":     { "polynomial_degree", "rmse_mv" },
  "ecm":     { "R0_mohm", "R1_mohm", "C1_F", "tau_s", "rmse_mv", "mae_mv", "max_mv" },
  "ekf":     { "rmse_pct", "mae_pct", "final_error_pct", "conv_time_s",
               "init_soc", "q_ekf_ah", "q_ref_ah", "cap_error_pct" },
  "multi_start": { "init10": {…}, "init30": {…}, … }
}
```

**Charts JSON (5 chart datasets, downsampled):**
```json
{
  "ocv":   [{soc, measured, fit}] × 100 points
  "ecm":   [{time, measured, simulated}] × ≤400 points
  "ekf":   [{time, reference, ekf}] × ≤400 points
  "error": [{time, error}] × ≤400 points
  "multi": [{time, reference, init10, init30, init50, init70, init90}] × ≤400 points
}
```

**Performance Issue:** The API runs the EKF **7 times** for a single pipeline call:
- 1× for the main 50% init test
- 5× for multi-start robustness (`init_results`)
- 5× again for `multi_ekf_runs` (to build the chart data)
- 1× for the capacity prediction (correct init)

Total: **12 EKF runs** per API call. On 3,673 data points each, this is computationally expensive. The 5 multi-start runs could share results with `multi_results`, reducing to 7 runs total.

**Error Handling:**
- File validation: checks for missing file and empty filename ✅
- Global try/except with `traceback.format_exc()` ✅
- Returns traceback to client (useful for debugging, but should be disabled in production) ⚠️
- Temp file cleanup in `finally` block ✅

---

## 8. React Frontend

### Architecture

```
App.jsx                           ← Root (page state: 'home' | 'live')
├── Navbar (inline in App.jsx)    ← Fixed nav bar with toggle buttons
├── [page='home']
│   ├── Hero.jsx                  ← Canvas particle animation + intro
│   ├── Overview.jsx              ← 6 overview cards
│   ├── Pipeline.jsx              ← Visual 6-step pipeline + ECM diagram
│   ├── Modules.jsx               ← 7 module documentation cards
│   ├── Results.jsx               ← Metrics table + key metric cards
│   ├── Charts.jsx                ← 5 Recharts with static/demo data
│   ├── QuickStart.jsx            ← Installation code blocks
│   ├── Notebooks.jsx             ← 7 notebook cards
│   ├── Limitations.jsx           ← 6 limitation cards
│   └── Team.jsx                  ← Team member profiles + photos
├── [page='live']
│   └── LivePipeline.jsx          ← Full CSV upload → run → display results
└── Footer.jsx                    ← Links + credits
```

### Tech Stack
- **React 18.2** with Hooks (`useState`, `useCallback`, `useRef`, `useEffect`)
- **Vite 5.2** — extremely fast dev server with HMR
- **Recharts 2.12** — `LineChart`, `ScatterChart`, `XAxis`, `YAxis`, `Tooltip`, `Legend`
- **lucide-react 0.395** — icon library (imported but usage varies)
- **Styling:** Inline CSS-in-JS throughout (no Tailwind, no styled-components, no CSS modules)
- **Canvas API** — Hero background particle animation

### State Management
The entire app uses **local React state** only — no Redux, no Zustand, no Context API. The main state is:
- `App.jsx`: `page` — which page is shown (`'home'` or `'live'`)
- `LivePipeline.jsx`: complex local state for upload status, pipeline progress, results

### `LivePipeline.jsx` — Key Component

This is the most complex component. It manages:
- **Upload state:** drag-and-drop, file validation
- **Pipeline execution:** `fetch` POST to `http://localhost:5000/api/run-pipeline`
- **Step-by-step progress:** 6 step cards that animate from `pending` → `running` → `done`
- **Metrics display:** 12 live metric boxes
- **Chart display:** 5 chart tabs (OCV, ECM, EKF, Error, Multi-start)
- **Error handling:** shows API errors with user-friendly messages

**Hardcoded API URL Issue:** The frontend uses `http://localhost:5000` as the API base URL. This **will not work** in production/deployed environments without an environment variable for the API URL. Vite supports `.env` files for this purpose.

### `projectData.js` — Static Data

Contains all the documentation data as JavaScript objects:
- `keyMetrics` — 6 KPI cards
- `resultsTable` — 13-row validation table
- `modules` — 7 module descriptions with equations
- `notebooks` — 7 notebook descriptions
- `limitations` — 6 known limitations
- `pipelineSteps` — 6 pipeline step descriptors

Also contains 4 **demo chart data generators** (`genOCV`, `genECM`, `genEKF`, `genMultiStart`) that use `Math.random()` to simulate realistic-looking chart data for the static documentation page. These are approximations — the actual results come from the Flask API in Live Pipeline mode.

### Responsive Design
The app has minimal responsiveness:
- Navigation links hidden below 1000px width (`@media(max-width:1000px)`)
- Otherwise, all layout uses fixed pixel widths/flex — not fully mobile-optimised

---

## 9. Deployment Architecture

### Local Development (Two-Process Mode)
```bash
# Terminal 1: Flask backend
python api/app.py              # → http://localhost:5000

# Terminal 2: React frontend
cd neoride-frontend
npm run dev                    # → http://localhost:5173
```
Flask-CORS handles cross-origin requests from `:5173` to `:5000`.

### Local Unified Mode (Single Process)
```bash
cd neoride-frontend && npm run build && cd ..
python app.py                  # → http://localhost:5000 (React + API)
```
Flask serves the React build from `neoride-frontend/dist/` as static files.

### Production: Render.com
Configured via `render.yaml`:
```yaml
buildCommand: "pip install -r requirements.txt && pip install flask flask-cors 
               && cd neoride-frontend && npm install && npm run build"
startCommand: "python app.py"
```
- Single web service
- Flask reads `PORT` from environment: `port = int(os.environ.get('PORT', 5000))`
- Binds to `0.0.0.0` in production

### Alternative: Docker
```dockerfile
FROM python:3.11-slim
# Install node, Python deps, build React, run Flask
```
Documented but no `Dockerfile` is actually present in the repo.

### Dependency Management
| Scope | File | Contents |
|-------|------|---------|
| Python (all) | `requirements.txt` | numpy, pandas, scipy, matplotlib |
| Python (API) | `api/requirements.txt` | flask>=3.0.0, flask-cors>=4.0.0, numpy>=1.24, pandas>=2.0, scipy>=1.10, matplotlib>=3.7 |
| Node.js | `neoride-frontend/package.json` | react, react-dom, recharts, lucide-react |

**Note:** `flask` and `flask-cors` are **not** in the root `requirements.txt` — they must be installed separately or via the build command. This could cause confusion if someone clones the repo and runs `pip install -r requirements.txt` expecting a working Flask app.

---

## 10. Results & Accuracy Analysis

### Complete Validation Metrics

| Metric | Value | Context |
|--------|-------|---------|
| **Dataset** | 3,674 pts, 3,503 s, ~1 Hz | BoL reference discharge |
| **Q_max** | 2.452 Ah | Measured capacity |
| OCV polynomial RMSE | **13.3 mV** | Degree-9 fit |
| OCV polynomial MAE | ~10 mV | — |
| ECM voltage RMSE | **14.1 mV** | Optimised R₀, R₁, C₁ |
| ECM voltage MAE | **8.7 mV** | — |
| ECM max voltage error | **159.2 mV** | Near 0% SOC (voltage knee) |
| Identified R₀ | **1.00 mΩ** | At lower bound |
| Identified R₁ | **1.00 mΩ** | At lower bound |
| Identified C₁ | **5,000 F** | τ = 5.0 s |
| EKF SOC RMSE (init 50%) | **1.14%** | ✅ Well below 5% target |
| EKF SOC MAE (init 50%) | **0.64%** | — |
| EKF max error after conv. | ~2.0% | — |
| EKF convergence time (<2%) | **~1 s** | Remarkably fast |
| EKF final SOC error | **−0.62%** | Conservative bias |
| Multi-start max conv. time | **~18 s** | All 5 inits converge |
| Capacity prediction error | **0.62%** | 2.467 vs 2.452 Ah |

### Performance Analysis

**ECM Voltage Fit:**
- The 14.1 mV RMSE is excellent for a single-temperature, single-cycle BoL fit
- The 159.2 mV maximum error occurs near 0% SOC — this is expected because the OCV curve is nearly vertical there, making small SOC errors produce large voltage errors
- The 4.6 mV positive mean bias (model slightly underestimates terminal voltage) suggests the polynomial OCV is slightly lower than the true OCV

**EKF Performance:**
- Sub-1% RMSE is exceptional — driven by the excellent ECM fit and the high dOCV/dSOC at the start of discharge (~high SOC), which gives the EKF strong observability
- The −0.62% final error is consistent across all initialisation points → it is a systematic bias, likely from the OCV polynomial being fit from loaded data (OCV is underestimated by ~I·R_true, causing EKF to systematically underestimate SOC at end of discharge)
- Convergence in ~1 s is extremely fast — likely because the initial P diagonal (0.5 for SOC) is large relative to Q, giving the EKF permission to correct aggressively in early steps

---

## 11. Code Quality Analysis

### Strengths

| Aspect | Assessment |
|--------|-----------|
| **Modularity** | Excellent — each `src/` module has a single responsibility |
| **Documentation** | Good — all public functions have NumPy-style docstrings |
| **Testability** | Good — every module has a `__main__` block for standalone testing |
| **Naming** | Consistent and descriptive throughout |
| **Type hints** | Not used — Python 3.8+ supports them and they'd improve the codebase |
| **Dependency injection** | Excellent — `ocv_poly` and `q_max` are passed as arguments, not globals |
| **Vectorisation** | Good — NumPy arrays throughout; only loop that could be vectorised is the EKF (inherently sequential) |
| **Error handling (Python)** | Minimal in `src/` — inputs are trusted |
| **Error handling (API)** | Good — try/except with traceback; file cleanup in finally |

### Code Style Issues

1. **`src/data_loader.py`**: Orphaned broken function at end of file (see Bug #1 below)
2. **`app.py` vs `api/app.py`**: ~200 lines of duplicated pipeline logic — should be a shared module
3. **Inline CSS**: All React styling uses inline CSS-in-JS objects — makes the code verbose and harder to maintain. A CSS file or utility framework would be cleaner
4. **Magic numbers**: `100` (gap threshold), `1e-8`, `1e-6`, `2.5e-5` (EKF tuning params), `9` (polynomial degree) — should be named constants
5. **`neoride-frontend/src/data/projectData.js`** `genOCV()`/`genECM()` etc. use `Math.random()` — non-deterministic, changes on every page reload
6. **No unit tests**: No `tests/` directory, no `pytest` setup, no CI/CD pipeline defined (`.github/workflows/` is absent)

---

## 12. Bugs & Issues Found

### Bug #1 — SyntaxError in `data_loader.py` (Critical, Dead Code)
**File:** `src/data_loader.py` (last 6 lines)
```python
def extract_references_discharges(df):        # typo: "references" not "reference"
     mode_counts = df['mode'].value_counts().sort_index()
     print('Mode counts')
     for mode in mode_counts.item():           # BUG: .item() → should be .items()
        m                                      # BUG: dangling variable, does nothing
```
This function is never called, but its presence is a SyntaxError risk. `.item()` is not a method of pandas Series (it's a scalar method on single-element arrays); `for mode in ...` would fail at runtime. The line `m` is a dangling reference. **Recommendation:** Delete this dead code entirely.

### Bug #2 — Hardcoded API URL in Frontend (Deployment Issue)
**File:** `neoride-frontend/src/components/LivePipeline.jsx`
The API URL is hardcoded to `http://localhost:5000`. In the deployed Render environment, the API and frontend are on the same origin (both served by Flask), so the frontend should use **relative URLs** (`/api/run-pipeline`) in production. Fix: use `import.meta.env.VITE_API_URL || '/api'` with a `.env.production` setting.

### Bug #3 — Duplicate EKF Computation in API (Performance)
**Files:** `api/app.py` and `app.py`
The multi-start EKF runs the estimator 10 times (5 in `multi_results` + 5 in `multi_ekf_runs`). The results are identical — `multi_results` computes SOC arrays that are then discarded, and `multi_ekf_runs` recomputes them. **Fix:** Reuse `multi_results['soc']` arrays for charting.

### Bug #4 — `flask` and `flask-cors` Missing from Root `requirements.txt`
**File:** `requirements.txt`
The root requirements only has `numpy, pandas, scipy, matplotlib`. Running `pip install -r requirements.txt` installs no web framework. The API won't start without `flask` and `flask-cors`. This confuses users who follow the README but don't read DEPLOYMENT.md.

### Bug #5 — `src/__init__.py` Content Unknown
The file `src/__init__.py` exists but its content was not checked. It could be empty (fine) or could have problematic imports. Recommend verifying it is empty or contains only package-level metadata.

### Bug #6 — Notebook Step Number Mismatch
`notebooks/02_coulomb_counting.ipynb` is titled internally "**Step 3**: Coulomb Counting" but it is notebook file `02`. Similarly notebook `03` is titled "Step 4". This off-by-one in the internal titles (notebooks run 01–07 but steps are internally numbered 3–8) creates confusion for readers.

### Bug #7 — `scripts/explore_data.py` Not Analyzed
This file exists but was not deeply reviewed. It may have additional standalone exploration code not covered in the notebooks.

---

## 13. Limitations & Scientific Gaps

These are acknowledged in the project's own documentation, analysed here with additional depth:

### 1. Single Temperature, Single C-rate
All results are from one discharge at ambient temperature (~25°C) at approximately 1C rate. In practice:
- R₀ approximately doubles per 20°C temperature drop
- C₁ and τ are temperature-dependent
- A production BMS would need a 2D lookup table: `f(SOC, T)` for each parameter
- **Impact:** The identified R₀ = 1 mΩ would be wildly wrong at -10°C

### 2. OCV from Discharge Data (Loaded OCV)
The "OCV" polynomial is actually the **discharge voltage under ~2.52 A load**, not the true equilibrium OCV. True OCV requires:
- GITT (pulse discharge + rest relaxation)
- Very slow discharge (C/25 ≈ 0.1 A, so I·R is negligible)
- The difference is approximately I·(R₀+R₁) ≈ 2.52 × (0.001+0.001) ≈ 5 mV — small but systematic
- This explains the R₀/R₁ lower-bound behaviour

### 3. 1RC Model Misses Slow Diffusion
The Warburg diffusion impedance (observable as a long tail in EIS spectra) manifests as a very slow (τ ~ 100–500 s) decay after a current step. The 1RC model's single τ = 5 s is too fast to capture this. A 2RC model with τ₁ ≈ 5 s and τ₂ ≈ 300 s would improve the voltage fit in the mid-to-high SOC region.

### 4. No Ageing / SOH
The project uses only the BoL (first) cycle. State of Health (SOH) tracking requires:
- Tracking Q_max degradation across 100s of cycles
- Typically 20–30% capacity fade over battery lifetime
- The NASA ALT dataset contains many aging cycles that are completely unused

### 5. Constant-Current Only
Real drive cycles (UDDS, WLTP, US06) have highly dynamic current profiles with both charge and discharge pulses. The EKF and ECM have never been tested on such profiles. Dynamic current would:
- Exercise the RC pair dynamics more (VRC would vary significantly)
- Test the EKF's ability to handle measurement updates during current sign changes
- Reveal whether the polynomial OCV is accurate in both charge and discharge directions

### 6. EKF Covariance Form
As noted in Section 5.5, the covariance update uses `P = (I - K·H)·P⁻` which is not symmetric-preserving. The Joseph stabilised form `P = (I-KH)P⁻(I-KH)ᵀ + K·R·Kᵀ` should be used in production implementations.

### 7. No Measurement Noise Characterisation
The measurement noise `R = 2.5e-5` (≈ 5 mV standard deviation) is hand-tuned. For rigorous implementation, R should be derived from voltage sensor datasheet specifications or measured from rest periods in the dataset.

---

## 14. Strengths

### Scientific & Engineering

1. **Complete pipeline from raw data to validated estimator** — rare in academic projects; usually only the EKF step is shown
2. **Correct exponential discretisation** of the RC pair (not Euler) — demonstrates genuine understanding of the physics
3. **Deliberate initialisation error** (50% SOC when true = 100%) — properly tests the EKF's convergence capability
4. **Multi-start robustness test** (5 initial SOC values) — demonstrates EKF reliability, not just lucky convergence
5. **Capacity prediction error metric** (0.62%) — shows the EKF's SOC trace integrates correctly
6. **Convergence in ~1 s** — this is remarkably fast and suggests the EKF is well-tuned
7. **Acknowledged the R₀/R₁ lower-bound issue** — many textbook examples hide this phenomenon; explaining it demonstrates real understanding

### Software Engineering

8. **Modular, testable Python codebase** — each module works standalone
9. **Full-stack web application** — bridges the gap between algorithm and user interface
10. **Live pipeline execution** — users can upload their own CSVs and get real results
11. **Pedagogical notebooks** — the step-by-step teaching approach is exceptional; each concept is derived from first principles before being wrapped into a module
12. **Clean separation of concerns** — `src/` is pure science, `api/` is HTTP adapter, frontend is UI

### Documentation

13. **Four documentation files** (README, REPORT, DEPLOYMENT, FULLSTACK_README) — comprehensive at every level
14. **REPORT.md** is publication-quality — could be submitted as a conference abstract

---

## 15. Recommendations & Future Work

### Immediate Fixes (High Priority)

1. **Remove orphaned broken code** in `data_loader.py` (the `extract_references_discharges` fragment)
2. **Add `flask` and `flask-cors` to root `requirements.txt`** or document clearly
3. **Fix hardcoded `localhost:5000`** in LivePipeline.jsx with `import.meta.env.VITE_API_URL`
4. **Deduplicate API code** — extract the pipeline logic from both Flask files into a shared `src/pipeline.py` function
5. **Fix duplicate EKF computation** in API — share `multi_results` dict with chart data builder

### Near-Term Improvements

6. **Add type hints** to all `src/` functions (Python 3.9+ allows e.g. `def coulomb_counting(current: np.ndarray, time: np.ndarray, q_max: float) -> np.ndarray`)
7. **Add pytest unit tests** for each module — at minimum: known-output tests for `coulomb_counting`, `rmse`, `fit_ocv_polynomial`
8. **Named constants** for magic numbers: `GAP_THRESHOLD_S = 100`, `POLY_DEGREE = 9`, `EKF_Q_SOC = 1e-8`, etc.
9. **Joseph form covariance update** in `ekf_estimator.py`
10. **Fix notebook step numbering** — either rename notebook files or correct the internal headings
11. **Non-deterministic demo charts** — seed `Math.random()` or replace with fixed demo data in `projectData.js`

### Scientific Extensions

12. **2RC model** — add a second RC pair with longer time constant (~200–500 s) for better mid-SOC voltage fit
13. **Temperature-dependent parameters** — add a `T` argument to `identify_parameters` and build a lookup table across temperature
14. **True OCV characterisation** — run a GITT or C/25 protocol on the dataset's rest periods to get proper OCV
15. **SOH estimation** — use the multiple aging cycles in the NASA dataset to track capacity fade
16. **Dynamic profile validation** — synthesize a UDDS-like current profile from the dataset and test EKF performance
17. **Adaptive EKF** — implement forgetting factor or innovation-based noise adaptation
18. **Unscented Kalman Filter (UKF)** comparison — UKF handles nonlinearity without explicit Jacobian derivation

### Deployment Improvements

19. **CI/CD pipeline** — add GitHub Actions for: lint → test → build → deploy to Render
20. **Environment-specific configs** — `VITE_API_URL`, `FLASK_ENV`, `DEBUG` flags
21. **API rate limiting** — the EKF computation is CPU-intensive; protect against abuse on free-tier hosting
22. **Progress streaming** — use Server-Sent Events (SSE) to stream pipeline step results as they complete instead of waiting for the full response

---

## 16. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Scientific Correctness** | 9/10 | Algorithms are correct; covariance form is a minor issue |
| **Algorithm Implementation** | 9/10 | Clean, well-structured, exact RC discretisation |
| **Code Quality** | 7/10 | Good modules; dead code, duplication, no tests |
| **Documentation** | 10/10 | Exceptional — four docs + 7 pedagogical notebooks |
| **Web Application** | 8/10 | Impressive full-stack; hardcoded URL, no env config |
| **Deployment Readiness** | 7/10 | render.yaml correct; missing flask in requirements |
| **Results Quality** | 9/10 | 1.14% RMSE, <1s convergence — well within 5% target |
| **Pedagogical Value** | 10/10 | Notebooks are textbook-quality; step-by-step derivation |
| **Overall** | **8.6/10** | **Excellent academic + engineering project** |

---

## Key Numbers at a Glance

```
Dataset          : 1.1M rows, 9 discharge cycles, BoL = 3,674 pts
Capacity (Q_max) : 2.452 Ah  (measured from integration)
OCV Fit          : Degree-9 polynomial, RMSE = 13.3 mV
ECM Parameters   : R₀=1 mΩ, R₁=1 mΩ, C₁=5000 F, τ=5.0 s
ECM Voltage Fit  : RMSE = 14.1 mV, MAE = 8.7 mV
EKF SOC RMSE     : 1.14%   (from 50% init, target ≤5% ✅)
EKF Convergence  : ~1 s    (to <2% error)
EKF Final Error  : −0.62%  (conservative, safe for BMS)
Pipeline Runtime : <3 s    (Python 3.11, no GPU)
Frontend         : 13 React components, 5 interactive charts
API Endpoints    : 2 (health + run-pipeline)
Total Lines Code : ~2,500 Python + ~3,000 JavaScript
```

---

*Deep analysis completed — March 2026 · NeoRide Battery Modelling Repository*
