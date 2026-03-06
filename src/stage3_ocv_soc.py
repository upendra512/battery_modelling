"""
Stage 3: OCV-SoC Relationship
==============================
Bins all (SoC, voltage) pairs across cycles into 100 windows,
takes median per bin, smooths, and fits a monotone piecewise cubic
interpolant.  The resulting ocv_func(soc) is used by the Kalman filter.
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import uniform_filter1d
import os

N_BINS  = 100     
SMOOTH_W = 5      
R0_EST   = 0.045  

def build_ocv_curve(soc_segs: list) -> tuple:
    all_soc, all_v_comp = [], []
    for seg in soc_segs:
        s = seg.iloc[10:-10].copy() if len(seg) > 50 else seg.copy()
        v_compensated = s['voltage_load'].values + (s['current_load'].values * R0_EST)
        all_soc.append(s['soc'].values); all_v_comp.append(v_compensated)

    all_soc = np.concatenate(all_soc); all_v_comp = np.concatenate(all_v_comp)
    mask = np.isfinite(all_soc) & np.isfinite(all_v_comp) & (all_soc >= 0) & (all_soc <= 1)
    all_soc, all_v_comp = all_soc[mask], all_v_comp[mask]

    bins = np.linspace(0, 1, N_BINS + 1)
    bin_idx = np.clip(np.digitize(all_soc, bins) - 1, 0, N_BINS - 1)
    ocv_med = np.array([np.median(all_v_comp[bin_idx == k]) if np.any(bin_idx == k) else np.nan for k in range(N_BINS)])
    soc_cents = 0.5 * (bins[:-1] + bins[1:])
    valid = np.isfinite(ocv_med)
    soc_cents, ocv_med = soc_cents[valid], ocv_med[valid]

    # Enforce strictly increasing before fitting
    idx = np.argsort(ocv_med)
    soc_cents, ocv_med = soc_cents[idx], ocv_med[idx]
    ocv_smooth = uniform_filter1d(ocv_med, size=SMOOTH_W)
    for i in range(1, len(ocv_smooth)):
        if ocv_smooth[i] <= ocv_smooth[i-1]:
            ocv_smooth[i] = ocv_smooth[i-1] + 1e-4

    ocv_func = PchipInterpolator(soc_cents, ocv_smooth, extrapolate=True)
    return soc_cents, ocv_smooth, ocv_func

def run_stage3(soc_segs: list, output_dir: str = 'outputs'):
    os.makedirs(output_dir, exist_ok=True)
    soc_knots, ocv_knots, ocv_func = build_ocv_curve(soc_segs)
    v0, v1 = float(ocv_func(0.0)), float(ocv_func(1.0))
    
    print(f"[Stage 3] OCV curve endpoints: SoC=0 → {v0:.3f} V | SoC=1 → {v1:.3f} V")
    print(f"          Status:              R0-Compensated ({R0_EST}Ω)")

    fig, ax = plt.subplots(figsize=(8, 5))
    soc_test = np.linspace(0, 1, 500)
    ax.plot(soc_knots, ocv_knots, 'b.', ms=4, label='Median (Compensated)')
    ax.plot(soc_test, ocv_func(soc_test), 'r-', lw=2, label='PCHIP Model')
    ax.set_xlabel('SoC'); ax.set_ylabel('OCV (V)'); ax.grid(alpha=0.3); ax.legend()
    plt.savefig(os.path.join(output_dir, 'stage3_ocv_soc.png'), dpi=150)
    plt.close()
    return soc_knots, ocv_knots, ocv_func

def run_stage3_per_cycle(soc_segs: list, output_dir: str = 'outputs') -> list:
    per_cycle = []
    for i, seg in enumerate(soc_segs):
        soc_k, ocv_k, ocv_f = build_ocv_curve([seg])
        per_cycle.append((soc_k, ocv_k, ocv_f))
    return per_cycle