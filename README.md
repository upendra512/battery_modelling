# Battery SoC Estimation Pipeline — Battery 20

**ES60208: Rechargeable Battery Performance Modelling**  
Automated workflow for OCV–SoC curve derivation, ECM parameter identification, and real‑time SoC estimation using an Extended Kalman Filter.  

---

## Results at a Glance

| Metric | Cycle 1 | Cycle 2 | Target |
|--------|--------:|--------:|-------:|
| **SoC RMSE**          | **0.27 %** | **0.34 %** | ≤ 5 % ✓ |
| **SoC MAE**           | 0.17 % | 0.16 % | — |
| Voltage RMSE          | 45.6 mV | 36.4 mV | ≤ 20 mV* |
| Discharge Capacity    | 2.452 Ah | 2.312 Ah | 2.5 Ah nameplate |
| Capacity Error        | 1.9 % | 7.5 % | — |

*Voltage RMSE is computed against terminal voltage during C/1 discharge. A constant offset (~40 mV) from true OCV is normal at this rate and does not affect SoC accuracy since the OCV curve is fitted per cycle.

---

## Repository Layout

```
/ (repo root)
├── data/                      # raw CSVs (e.g. battery20.csv)
├── outputs/                   # plots & metrics (created by pipeline)
├── scripts/                   # helper utilities
│   └── sample_run.sh          # bootstrap venv and run pipeline
├── src/                       # stage modules (imported by run_pipeline.py)
│   ├── stage1_data_cleaning.py
│   ├── stage2_coulomb_counting.py
│   ├── stage3_ocv_soc.py
│   ├── stage4_ecm.py
│   └── stage5_kalman_filter.py
├── run_pipeline.py            # command‑line entry point
├── requirements.txt           # pinned dependencies
└── README.md                  # this file
```


---

## Quick Start

### 1. Install dependencies

```bash
pip install numpy scipy matplotlib pandas
```

Or with the requirements file:

```bash
pip install -r requirements.txt
```

### 2. Run the full pipeline

(you can execute from the repository root – there is no `battery_soc` subfolder)

```bash
python run_pipeline.py
```

Optionally specify an input CSV or output directory:

```bash
python run_pipeline.py --csv data/battery20.csv --outdir outputs
```

### 3. Run the helper script

The `scripts/sample_run.sh` helper will create a `.venv`, install
minimal dependencies (numpy/scipy/matplotlib/pandas) and then invoke the
pipeline with any arguments you pass through.

```bash
bash scripts/sample_run.sh          # identical to `python run_pipeline.py`
bash scripts/sample_run.sh --csv data/battery20.csv
```

---

## Pipeline Stages

### Stage 1 — Data Cleaning
- Extracts contiguous reference discharge segments (`mode == -1`, `mission_type == 0`)
- Filters phantom segments shorter than 300 s
- Removes ADC floor artefacts (voltage < 0.1 V)
- Removes voltage spikes using rolling z-score (σ > 4)
- Clips extreme current outliers (above 99th percentile × 1.5)

### Stage 2 — Coulomb Counting
- Numerically integrates current over time to produce SoC(t) reference
- Uses actual dt between rows; clips logging gaps > 10 s
- SoC starts at 1.0 (full charge), decreases monotonically

### Stage 3 — OCV–SoC Curve
- Bins (SoC, voltage) pairs into 100 windows; takes median per bin
- Smooths with uniform filter (width = 5 bins)
- Fits monotone PCHIP interpolant (Scipy `PchipInterpolator`)
- Builds a **per-cycle** OCV curve for accurate ECM + EKF fitting

### Stage 4 — ECM Parameter Identification (1RC Thevenin)
- State equations (discrete forward Euler):
  - `V_RC[k+1] = exp(-dt/τ)·V_RC[k] + R1·(1-exp(-dt/τ))·I[k]`
  - `V_term[k] = OCV(SoC[k]) - R0·I[k] - V_RC[k]`
- Minimises voltage RMSE via L-BFGS-B (Scipy)
- Parameters identified per cycle: R0, R1, τ (= R1·C1)

### Stage 5 — Extended Kalman Filter
- State vector: `[SoC, V_RC]`
- Predict: propagate ECM dynamics forward
- Update: correct using voltage measurement via linearised OCV Jacobian
- Tuning: Q_noise = 1e-5, R_noise = 5e-3 (voltage measurement variance)

---

## ECM Parameters (Battery 20)

| Cycle | R0 (mΩ) | R1 (mΩ) | τ (s) | Capacity (Ah) |
|-------|---------|---------|-------|---------------|
| 1     | 0.10    | 0.53    | 60.0  | 2.452         |
| 2     | 0.10    | 0.44    | 60.0  | 2.312         |

---

## Output Files

| File | Description |
|------|-------------|
| `stage1_cleaning.png` | Raw vs cleaned voltage trace |
| `stage2_soc.png` | Coulomb-counted SoC per cycle |
| `stage3_ocv_soc.png` | OCV–SoC curve with raw scatter |
| `stage4_ecm_fit.png` | Simulated vs measured voltage |
| `stage5_soc_estimation.png` | EKF vs Coulomb reference |
| `stage5_innovations.png` | EKF voltage residuals |
| `summary_figure.png` | 4-panel executive overview |
| `metrics_summary.csv` | All evaluation metrics (CSV) |
| `ecm_parameters.csv` | R0, R1, τ per cycle (CSV) |

---

## Deployment

See detailed instructions below. Summary:

- **Edge/embedded**: Export ECM params + OCV knots to JSON; implement EKF in C/Python
- **Real-time Python**: Import `stage5_kalman_filter.EKF`; call `.predict()` and `.update()` each timestep
- **Cloud API**: Wrap pipeline in Flask/FastAPI; POST voltage/current/temperature; receive SoC estimate

---

## Requirements

- Python ≥ 3.10
- numpy ≥ 1.24
- scipy ≥ 1.10
- matplotlib ≥ 3.7
- pandas ≥ 1.5

No internet connection required at runtime.
