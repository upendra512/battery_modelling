"""
run_pipeline.py — Full Battery SoC Estimation Pipeline
=======================================================
Usage (from battery_soc/ directory):
    python run_pipeline.py
    python run_pipeline.py --csv data/battery20.csv --outdir outputs
"""

import argparse, os, sys
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from stage1_data_cleaning    import run_stage1
from stage2_coulomb_counting import run_stage2
from stage3_ocv_soc          import run_stage3_per_cycle, run_stage3
from stage4_ecm              import fit_ecm_cycle
from stage5_kalman_filter    import run_ekf_cycle

RATED_CAPACITY_AH = 2.5
EKF_Q_NOISE = 1e-5
EKF_R_NOISE = 5e-3

class C:
    CYAN = '\033[96m'; BLUE = '\033[94m'; GREEN = '\033[92m'
    YELLOW = '\033[93m'; RED = '\033[91m'; BOLD = '\033[1m'
    DIM = '\033[2m'; END = '\033[0m'

def make_summary_figure(soc_segs, kf_results, ecm_results, output_dir):
    fig, axes = plt.subplots(2, 2, figsize=(12, 9))
    fig.suptitle('Battery 20 — SoC Estimation Summary', fontsize=14, fontweight='bold')
    colors = ['#1f77b4', '#ff7f0e']
    ax = axes[0, 0]
    for i, (res, seg) in enumerate(zip(kf_results, soc_segs)):
        t = (res['time'] - res['time'][0]) / 60
        ax.plot(t, res['soc_true']*100, '-',  color=colors[i], lw=1.5, label=f'Cycle {i+1} Ref')
        ax.plot(t, res['soc_est'] *100, '--', color=colors[i], lw=1.5, alpha=0.8,
                label=f'Cycle {i+1} EKF (RMSE={res["rmse"]*100:.2f}%)')
    ax.set(xlabel='Time (min)', ylabel='SoC (%)', title='EKF SoC vs Coulomb Reference')
    ax.legend(fontsize=7); ax.grid(alpha=0.3)
    ax = axes[0, 1]
    for i, res in enumerate(kf_results):
        t = (res['time'] - res['time'][0]) / 60
        ax.plot(t, (res['soc_est']-res['soc_true'])*100, color=colors[i], lw=1, label=f'Cycle {i+1}')
    ax.axhline(5,  color='r', ls='--', lw=1, label='±5% target')
    ax.axhline(-5, color='r', ls='--', lw=1)
    ax.axhline(0,  color='k', ls='-',  lw=0.5)
    ax.set(xlabel='Time (min)', ylabel='SoC Error (%)', title='SoC Estimation Error')
    ax.legend(fontsize=8); ax.grid(alpha=0.3)
    ax = axes[1, 0]
    seg = soc_segs[0]
    t = (seg['time'].values - seg['time'].values[0]) / 60
    ax.plot(t, seg['voltage_load'], label='Measured', lw=1.5)
    ax.plot(t, ecm_results[0]['V_sim'], '--', lw=1.5, label=f'ECM (RMSE={ecm_results[0]["V_rmse_mV"]:.1f} mV)')
    ax.set(xlabel='Time (min)', ylabel='Voltage (V)', title='ECM Voltage Fit — Cycle 1')
    ax.legend(fontsize=9); ax.grid(alpha=0.3)
    ax = axes[1, 1]
    cycles = [r['cycle'] for r in ecm_results]
    caps   = [r.get('cap_Ah', 0) for r in ecm_results]
    ax.bar(cycles, caps, color=colors[:len(cycles)])
    ax.axhline(RATED_CAPACITY_AH, color='r', ls='--', lw=1.5, label='Nameplate 2.5 Ah')
    ax.set(xlabel='Cycle', ylabel='Capacity (Ah)', title='Capacity Fade')
    ax.legend(fontsize=9); ax.set_xticks(cycles); ax.grid(alpha=0.3, axis='y')
    plt.tight_layout()
    path = os.path.join(output_dir, 'summary_figure.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    plt.close()
    return path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv',    default='data/battery20.csv')
    parser.add_argument('--outdir', default='outputs')
    args = parser.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    print(f"\n{C.BLUE}{C.BOLD}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓{C.END}")
    print(f"{C.BLUE}{C.BOLD}┃ 🔋 Battery SoC Estimation Pipeline — Battery 20      ┃{C.END}")
    print(f"{C.BLUE}{C.BOLD}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛{C.END}")

    print(f"\n{C.CYAN}{C.BOLD}➤ [1/5] Data Cleaning 🧹{C.END}")
    clean_segs = run_stage1(args.csv, output_dir=args.outdir)
    print(f"\n{C.CYAN}{C.BOLD}➤ [2/5] Coulomb Counting ⚡{C.END}")
    soc_segs, capacities = run_stage2(clean_segs, output_dir=args.outdir)
    print(f"\n{C.CYAN}{C.BOLD}➤ [3/5] OCV–SoC Curve Fitting 📈{C.END}")
    _, _, ocv_pooled = run_stage3(soc_segs, output_dir=args.outdir)
    per_cycle_ocv = run_stage3_per_cycle(soc_segs, output_dir=args.outdir)

    print(f"\n{C.CYAN}{C.BOLD}➤ [4/5] ECM Parameter Identification 🧮{C.END}")
    ecm_results = []
    for i, (seg, Q, (_, _, ocv_i)) in enumerate(zip(soc_segs, capacities, per_cycle_ocv)):
        res = fit_ecm_cycle(seg, ocv_i, Q)
        res['cycle'] = i+1; res['cap_Ah'] = Q
        ecm_results.append(res)
        print(f"  {C.DIM}↳ C{i+1}: R0={res['R0']*1000:.2f}mΩ | R1={res['R1']*1000:.2f}mΩ | τ={res['tau']:.0f}s | V_err={res['V_rmse_mV']:.1f}mV{C.END}")

    print(f"\n{C.CYAN}{C.BOLD}➤ [5/5] Extended Kalman Filter 🚀{C.END}")
    kf_results = []
    for i, (seg, ecm, Q, (_, _, ocv_i)) in enumerate(zip(soc_segs, ecm_results, capacities, per_cycle_ocv)):
        res = run_ekf_cycle(seg, ecm, ocv_i, Q, Q_noise=EKF_Q_NOISE, R_noise=EKF_R_NOISE)
        kf_results.append(res)
        print(f"  {C.DIM}↳ C{i+1}: SoC RMSE={res['rmse']*100:.2f}% | MAE={res['mae']*100:.2f}%{C.END}")

    make_summary_figure(soc_segs, kf_results, ecm_results, args.outdir)

    # --- FINAL METRICS BOX ---
    # Total internal width is 52 characters.
    print(f"\n{C.GREEN}{C.BOLD}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓{C.END}")
    print(f"{C.GREEN}{C.BOLD}┃ 🎯 FINAL EVALUATION METRICS                          ┃{C.END}")
    print(f"{C.GREEN}{C.BOLD}┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┩{C.END}")
    
    rows = []
    for i, (ecm, kf, cap) in enumerate(zip(ecm_results, kf_results, capacities)):
        cap_err = abs(cap - RATED_CAPACITY_AH) / RATED_CAPACITY_AH * 100
        row = {
            'cycle': i+1, 'V_RMSE_mV': round(ecm['V_rmse_mV'], 3),
            'SoC_RMSE_pct': round(kf['rmse']*100, 3), 'SoC_MAE_pct': round(kf['mae']*100, 3),
            'capacity_Ah': round(cap, 4), 'capacity_error_pct': round(cap_err, 2),
            'R0_mOhm': round(ecm['R0']*1000, 3), 'R1_mOhm': round(ecm['R1']*1000, 3), 'tau_s': round(ecm['tau'], 2)
        }
        rows.append(row)
        
        # Format: " C1 ➔ V_Err: 47.2mV | SoC: 0.34% | Cap: 2.312Ah"
        main_txt = (f" C{i+1} ➔ V_Err:{row['V_RMSE_mV']:>5.1f}mV | "
                    f"SoC:{row['SoC_RMSE_pct']:>5.2f}% | "
                    f"Cap:{row['capacity_Ah']:.3f}Ah")

        pad = " " * (54 - len(main_txt))

        print(f"{C.GREEN}{C.BOLD}┃{C.END} "
              f"{C.BOLD}C{i+1}{C.END} ➔ V_Err:{C.YELLOW}{row['V_RMSE_mV']:>5.1f}mV{C.END} | "
              f"SoC:{C.BOLD}{row['SoC_RMSE_pct']:>5.2f}%{C.END} | "
              f"Cap:{C.CYAN}{row['capacity_Ah']:.3f}Ah{C.END}"
              f"{pad}{C.GREEN}{C.BOLD}┃{C.END}")

    print(f"{C.GREEN}{C.BOLD}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛{C.END}")

if __name__ == '__main__':
    main()