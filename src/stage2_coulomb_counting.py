"""
Stage 2: State of Charge via Coulomb Counting
==============================================
Numerically integrates current over time to produce an SoC reference.
SoC_0 = 1.0 (fully charged at start of each discharge).
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os

MAX_DT_S = 10.0   # Clip gaps larger than this to avoid phantom charge jumps


def coulomb_count(seg: pd.DataFrame) -> pd.DataFrame:
    """
    Add `soc` column (0-1) to a cleaned reference discharge segment.
    Uses actual dt between rows; clips dt > MAX_DT_S.
    """
    seg = seg.copy().reset_index(drop=True)
    t = seg['time'].values
    I = seg['current_load'].values  # Amperes

    dt = np.diff(t, prepend=t[0])
    dt = np.clip(dt, 0, MAX_DT_S)

    charge_out_Ah = np.cumsum(I * dt) / 3600.0   # Coulombs → Ah
    total_Ah      = charge_out_Ah[-1]

    seg['soc']      = 1.0 - (charge_out_Ah / total_Ah)
    seg['total_Ah'] = total_Ah
    return seg, total_Ah


def run_stage2(clean_segs: list, output_dir: str = 'outputs') -> list:
    os.makedirs(output_dir, exist_ok=True)
    soc_segs = []
    capacities = []

    for i, seg in enumerate(clean_segs):
        seg_soc, cap = coulomb_count(seg)
        soc_segs.append(seg_soc)
        capacities.append(cap)
        print(f"[Stage 2] Cycle {i+1}: total capacity = {cap:.4f} Ah  "
              f"(nameplate = 2.5 Ah, error = {abs(cap-2.5)/2.5*100:.1f}%)")

    # SoC vs time plot
    fig, ax = plt.subplots(figsize=(10, 4))
    for i, seg in enumerate(soc_segs):
        t = seg['time'].values - seg['time'].values[0]
        ax.plot(t / 60, seg['soc'], label=f'Cycle {i+1}')
    ax.set_xlabel('Time (min)')
    ax.set_ylabel('SoC')
    ax.set_title('Coulomb-Counted SoC Reference')
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'stage2_soc.png'), dpi=150)
    plt.close()

    # Capacity summary
    print(f"\n  Capacity fade: {capacities[0]:.4f} Ah → {capacities[-1]:.4f} Ah "
          f"({(capacities[0]-capacities[-1])/capacities[0]*100:.1f}% fade over {len(capacities)} cycles)")
    return soc_segs, capacities


if __name__ == '__main__':
    from stage1_data_cleaning import run_stage1
    clean_segs = run_stage1('data/battery20.csv', output_dir='outputs')
    soc_segs, capacities = run_stage2(clean_segs, output_dir='outputs')
