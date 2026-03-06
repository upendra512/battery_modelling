"""
Stage 1: Data Loading and Cleaning
===================================
Loads battery CSV, identifies valid reference discharge segments,
removes ADC floor zeros, voltage spikes, and short phantom segments.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os

# ── Constants ──────────────────────────────────────────────────────────────
MIN_SEGMENT_DURATION_S = 300   # Phantom threshold: segments shorter than this are dropped
ADC_FLOOR_VOLTAGE     = 0.1   # Rows with voltage below this are ADC floor artefacts
SPIKE_WINDOW          = 5     # Rolling window for spike detection
SPIKE_SIGMA           = 4.0   # Standard deviations for spike threshold
RATED_CAPACITY_AH     = 2.5   # Nameplate capacity


def load_raw(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, parse_dates=['start_time'])
    return df


def extract_reference_segments(df: pd.DataFrame) -> list[pd.DataFrame]:
    """
    Return a list of DataFrames, one per valid reference discharge segment.
    Valid = mode == -1, mission_type == 0, duration >= MIN_SEGMENT_DURATION_S.
    """
    ref = df[(df['mode'] == -1) & (df['mission_type'] == 0)].copy()
    segments = []
    for session_id, grp in ref.groupby('start_time'):
        grp = grp.sort_values('time').reset_index(drop=True)
        duration = grp['time'].iloc[-1] - grp['time'].iloc[0]
        if duration < MIN_SEGMENT_DURATION_S:
            continue
        segments.append(grp)
    return segments


def clean_segment(seg: pd.DataFrame) -> pd.DataFrame:
    """Remove ADC floor zeros and voltage/current spikes from a segment."""
    seg = seg.copy()

    # Drop ADC floor rows (relay open → reads ~0 V)
    seg = seg[seg['voltage_load'].abs() > ADC_FLOOR_VOLTAGE].reset_index(drop=True)

    # Spike removal: rolling z-score on voltage
    roll_mean = seg['voltage_load'].rolling(SPIKE_WINDOW, center=True, min_periods=1).mean()
    roll_std  = seg['voltage_load'].rolling(SPIKE_WINDOW, center=True, min_periods=1).std().fillna(0.01)
    z = (seg['voltage_load'] - roll_mean).abs() / roll_std
    seg = seg[z < SPIKE_SIGMA].reset_index(drop=True)

    # Clip extreme current values (sensor glitches)
    q99 = seg['current_load'].quantile(0.99)
    seg = seg[seg['current_load'] <= q99 * 1.5].reset_index(drop=True)

    return seg


def run_stage1(csv_path: str, output_dir: str = 'outputs') -> list[pd.DataFrame]:
    os.makedirs(output_dir, exist_ok=True)
    df = load_raw(csv_path)

    raw_segs = extract_reference_segments(df)
    print(f"[Stage 1] Raw reference segments found: {len(raw_segs)}")

    clean_segs = [clean_segment(s) for s in raw_segs]
    for i, (raw, clean) in enumerate(zip(raw_segs, clean_segs)):
        print(f"  Cycle {i+1}: {len(raw)} → {len(clean)} rows after cleaning  "
              f"({len(raw)-len(clean)} removed)")

    # Plot raw vs cleaned for cycle 0
    fig, axes = plt.subplots(2, 1, figsize=(10, 7), sharex=False)
    for ax, seg, title in zip(axes, [raw_segs[0], clean_segs[0]],
                               ['Raw Cycle 1', 'Cleaned Cycle 1']):
        t = seg['time'].values - seg['time'].values[0]
        ax.plot(t / 60, seg['voltage_load'], lw=0.8)
        ax.set_ylabel('Voltage (V)')
        ax.set_title(title)
        ax.grid(alpha=0.3)
    axes[-1].set_xlabel('Time (min)')
    plt.tight_layout()
    path = os.path.join(output_dir, 'stage1_cleaning.png')
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"  Plot saved: {path}")

    return clean_segs


if __name__ == '__main__':
    segs = run_stage1('data/battery20.csv', output_dir='outputs')
    print(f"\nReturned {len(segs)} clean segments for downstream stages.")
