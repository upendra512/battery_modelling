"""
Stage 4: Equivalent Circuit Model (ECM) — 1RC Thevenin Parameter ID
=====================================================================
State equations (discrete time, forward Euler):
    V_RC[k+1] = exp(-dt/tau)*V_RC[k] + R1*(1-exp(-dt/tau))*I[k]
    V_term[k]  = OCV(SoC[k]) - R0*I[k] - V_RC[k]
    SoC[k+1]  = SoC[k]  - I[k]*dt/(3600*Q_Ah)

Parameters optimised per cycle:  R0, R1, C1 (→ tau=R1*C1)
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.optimize import minimize
import os


def simulate_ecm(params: np.ndarray, seg: pd.DataFrame,
                 ocv_func, Q_Ah: float) -> np.ndarray:
    """Simulate terminal voltage given ECM parameters."""
    R0, R1, tau = params
    if R0 < 0 or R1 < 0 or tau < 1:
        return np.full(len(seg), 1e6)

    t    = seg['time'].values
    I    = seg['current_load'].values
    soc0 = seg['soc'].values[0]

    n      = len(t)
    V_sim  = np.zeros(n)
    V_RC   = 0.0
    soc    = soc0

    for k in range(n):
        dt = (t[k] - t[k-1]) if k > 0 else 0.0
        dt = min(dt, 10.0)

        ocv    = float(ocv_func(np.clip(soc, 0, 1)))
        V_sim[k] = ocv - R0 * I[k] - V_RC

        # Update state
        alpha  = np.exp(-dt / tau) if tau > 0 else 0.0
        V_RC   = alpha * V_RC + R1 * (1.0 - alpha) * I[k]
        soc    = soc - I[k] * dt / (3600.0 * Q_Ah)

    return V_sim


def fit_ecm_cycle(seg: pd.DataFrame, ocv_func, Q_Ah: float) -> dict:
    """Identify R0, R1, C1 for a single cycle via nonlinear least squares."""
    V_meas = seg['voltage_load'].values

    def objective(params):
        V_sim = simulate_ecm(params, seg, ocv_func, Q_Ah)
        return np.mean((V_sim - V_meas) ** 2)

    x0 = [0.03, 0.02, 60.0]           # R0, R1, tau (seconds)
    bounds = [(1e-4, 0.5), (1e-4, 0.5), (1.0, 500.0)]

    res = minimize(objective, x0, method='L-BFGS-B', bounds=bounds,
                   options={'maxiter': 500, 'ftol': 1e-10})

    R0, R1, tau = res.x
    C1 = tau / R1 if R1 > 0 else 0.0
    V_sim = simulate_ecm(res.x, seg, ocv_func, Q_Ah)
    rmse  = np.sqrt(np.mean((V_sim - V_meas) ** 2)) * 1000  # mV

    return {'R0': R0, 'R1': R1, 'C1': C1, 'tau': tau,
            'V_rmse_mV': rmse, 'V_sim': V_sim, 'success': res.success}


def run_stage4(soc_segs: list, ocv_func, capacities: list,
               output_dir: str = 'outputs') -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    results = []

    for i, (seg, Q) in enumerate(zip(soc_segs, capacities)):
        res = fit_ecm_cycle(seg, ocv_func, Q)
        res['cycle'] = i + 1
        results.append(res)
        print(f"[Stage 4] Cycle {i+1}: R0={res['R0']*1000:.2f} mΩ  "
              f"R1={res['R1']*1000:.2f} mΩ  "
              f"tau={res['tau']:.1f} s  "
              f"V_RMSE={res['V_rmse_mV']:.2f} mV")

    # Plot simulated vs measured voltage
    n_cycles = len(results)
    fig, axes = plt.subplots(n_cycles, 1, figsize=(10, 4 * n_cycles))
    if n_cycles == 1:
        axes = [axes]
    for i, (res, seg) in enumerate(zip(results, soc_segs)):
        t = seg['time'].values - seg['time'].values[0]
        axes[i].plot(t / 60, seg['voltage_load'], label='Measured', lw=1.2)
        axes[i].plot(t / 60, res['V_sim'], '--', label=f'ECM (RMSE={res["V_rmse_mV"]:.1f} mV)', lw=1.2)
        axes[i].set_ylabel('Voltage (V)')
        axes[i].set_title(f'Cycle {res["cycle"]}')
        axes[i].legend(fontsize=9)
        axes[i].grid(alpha=0.3)
    axes[-1].set_xlabel('Time (min)')
    plt.suptitle('ECM Simulated vs Measured Terminal Voltage', fontsize=12, y=1.01)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'stage4_ecm_fit.png'), dpi=150, bbox_inches='tight')
    plt.close()

    # R0 ageing trend
    cycles = [r['cycle'] for r in results]
    R0_vals = [r['R0'] * 1000 for r in results]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(cycles, R0_vals, 'o-')
    ax.set_xlabel('Cycle')
    ax.set_ylabel('R0 (mΩ)')
    ax.set_title('Series Resistance Ageing Trend')
    ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'stage4_R0_ageing.png'), dpi=150)
    plt.close()

    return results


if __name__ == '__main__':
    import sys; sys.path.insert(0, '.')
    from stage1_data_cleaning import run_stage1
    from stage2_coulomb_counting import run_stage2
    from stage3_ocv_soc import run_stage3
    clean_segs = run_stage1('data/battery20.csv', output_dir='outputs')
    soc_segs, caps = run_stage2(clean_segs, output_dir='outputs')
    _, _, ocv_func = run_stage3(soc_segs, output_dir='outputs')
    run_stage4(soc_segs, ocv_func, caps, output_dir='outputs')
