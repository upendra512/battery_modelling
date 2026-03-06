"""
Stage 5: Extended Kalman Filter (EKF) for Real-Time SoC Estimation
====================================================================
State vector: x = [SoC, V_RC]
Observation:  y = V_terminal (measured)

Predict step:
    x_pred = f(x, I, dt)  — ECM dynamics
    P_pred = F·P·F' + Q

Update step:
    H  = [dOCV/dSoC,  -1]   (observation Jacobian)
    S  = H·P_pred·H' + R
    K  = P_pred·H' / S
    x  = x_pred + K·(y - h(x_pred))
    P  = (I - K·H)·P_pred
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os


class EKF:
    def __init__(self, R0: float, R1: float, tau: float,
                 Q_Ah: float, ocv_func,
                 Q_noise: float = 1e-5,
                 R_noise: float = 1e-3,
                 P0: float = 0.01):
        """
        Parameters
        ----------
        R0, R1, tau : ECM parameters (Ω, Ω, s)
        Q_Ah        : cycle capacity (Ah)
        ocv_func    : callable SoC → OCV (V)
        Q_noise     : process noise variance
        R_noise     : measurement noise variance (V²)
        P0          : initial state covariance diagonal
        """
        self.R0 = R0
        self.R1 = R1
        self.tau = tau
        self.Q_Ah = Q_Ah
        self.ocv = ocv_func
        self.Q_noise = Q_noise
        self.R_noise = R_noise

        # State [SoC, V_RC]
        self.x = np.array([1.0, 0.0])
        self.P = np.diag([P0, P0])

    def predict(self, I: float, dt: float):
        dt = min(dt, 10.0)
        alpha = np.exp(-dt / self.tau)
        soc, v_rc = self.x

        # State transition
        soc_new  = soc  - I * dt / (3600.0 * self.Q_Ah)
        v_rc_new = alpha * v_rc + self.R1 * (1.0 - alpha) * I

        self.x = np.array([soc_new, v_rc_new])

        # Jacobian of f w.r.t. x
        F = np.array([
            [1.0,   0.0],
            [0.0,   alpha]
        ])

        Q_mat = np.diag([self.Q_noise, self.Q_noise * 0.1])
        self.P = F @ self.P @ F.T + Q_mat

    def update(self, V_meas: float, I: float):
        soc, v_rc = self.x
        soc_c = np.clip(soc, 0.01, 0.99)
        ocv   = float(self.ocv(soc_c))

        # Predicted terminal voltage
        V_pred = ocv - self.R0 * I - v_rc

        # Observation Jacobian H = [dOCV/dSoC, -1]
        eps   = 1e-4
        docv_dsoc = (float(self.ocv(min(soc_c + eps, 0.99))) -
                     float(self.ocv(max(soc_c - eps, 0.01)))) / (2 * eps)
        H = np.array([[docv_dsoc, -1.0]])

        S  = H @ self.P @ H.T + self.R_noise
        K  = (self.P @ H.T) / S[0, 0]

        innovation = V_meas - V_pred
        self.x     = self.x + K.flatten() * innovation
        self.x[0]  = np.clip(self.x[0], 0.0, 1.0)

        self.P = (np.eye(2) - np.outer(K.flatten(), H)) @ self.P
        return innovation


def run_ekf_cycle(seg: pd.DataFrame, ecm_params: dict,
                  ocv_func, Q_Ah: float,
                  Q_noise: float = 1e-5,
                  R_noise: float = 5e-4,
                  soc_init_offset: float = 0.0) -> dict:
    """
    Run EKF on one cycle.  soc_init_offset lets you test wrong initial SoC.
    """
    ekf = EKF(R0=ecm_params['R0'], R1=ecm_params['R1'], tau=ecm_params['tau'],
              Q_Ah=Q_Ah, ocv_func=ocv_func,
              Q_noise=Q_noise, R_noise=R_noise)

    soc_true  = seg['soc'].values
    ekf.x[0]  = np.clip(soc_true[0] + soc_init_offset, 0.0, 1.0)

    t         = seg['time'].values
    I_arr     = seg['current_load'].values
    V_arr     = seg['voltage_load'].values

    soc_est   = np.zeros(len(seg))
    innovations = np.zeros(len(seg))

    for k in range(len(seg)):
        dt = (t[k] - t[k - 1]) if k > 0 else 0.0
        ekf.predict(I_arr[k], dt)
        innov = ekf.update(V_arr[k], I_arr[k])
        soc_est[k]    = ekf.x[0]
        innovations[k] = innov

    # Metrics
    err  = soc_est - soc_true
    rmse = float(np.sqrt(np.mean(err ** 2)))
    mae  = float(np.mean(np.abs(err)))

    return {'soc_true': soc_true, 'soc_est': soc_est,
            'innovations': innovations, 'rmse': rmse, 'mae': mae,
            'time': t}


def run_stage5(soc_segs: list, ecm_results: list, ocv_func,
               capacities: list, output_dir: str = 'outputs') -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    filter_results = []

    for i, (seg, ecm, Q) in enumerate(zip(soc_segs, ecm_results, capacities)):
        res = run_ekf_cycle(seg, ecm, ocv_func, Q)
        filter_results.append(res)
        print(f"[Stage 5] Cycle {i+1}: SoC RMSE={res['rmse']*100:.2f}%  "
              f"MAE={res['mae']*100:.2f}%")

    # SoC estimate plots
    n = len(filter_results)
    fig, axes = plt.subplots(n, 1, figsize=(10, 4 * n))
    if n == 1:
        axes = [axes]
    for i, (res, seg) in enumerate(zip(filter_results, soc_segs)):
        t_min = (res['time'] - res['time'][0]) / 60
        axes[i].plot(t_min, res['soc_true'],  label='Coulomb Reference', lw=1.5)
        axes[i].plot(t_min, res['soc_est'], '--', label=f'EKF (RMSE={res["rmse"]*100:.2f}%)', lw=1.5)
        axes[i].fill_between(t_min, res['soc_true'], res['soc_est'], alpha=0.2)
        axes[i].set_ylabel('SoC')
        axes[i].set_title(f'Cycle {i+1} — SoC Estimation')
        axes[i].legend(fontsize=9)
        axes[i].grid(alpha=0.3)
        # 5 % target line
        axes[i].axhline(y=0, color='k', ls=':', lw=0.5)
    axes[-1].set_xlabel('Time (min)')
    plt.suptitle('EKF SoC vs Coulomb-Counted Reference', fontsize=12, y=1.01)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'stage5_soc_estimation.png'), dpi=150, bbox_inches='tight')
    plt.close()

    # Innovation plot
    fig, axes = plt.subplots(n, 1, figsize=(10, 3 * n))
    if n == 1:
        axes = [axes]
    for i, (res) in enumerate(filter_results):
        t_min = (res['time'] - res['time'][0]) / 60
        axes[i].plot(t_min, res['innovations'] * 1000, lw=0.8)
        axes[i].axhline(0, color='r', ls='--', lw=0.8)
        axes[i].set_ylabel('Innovation (mV)')
        axes[i].set_title(f'Cycle {i+1}')
        axes[i].grid(alpha=0.3)
    axes[-1].set_xlabel('Time (min)')
    plt.suptitle('EKF Voltage Innovation (Residuals)', fontsize=12, y=1.01)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'stage5_innovations.png'), dpi=150, bbox_inches='tight')
    plt.close()

    return filter_results


if __name__ == '__main__':
    import sys; sys.path.insert(0, '.')
    from stage1_data_cleaning import run_stage1
    from stage2_coulomb_counting import run_stage2
    from stage3_ocv_soc import run_stage3
    from stage4_ecm import run_stage4
    clean_segs = run_stage1('data/battery20.csv', output_dir='outputs')
    soc_segs, caps = run_stage2(clean_segs, output_dir='outputs')
    _, _, ocv_func = run_stage3(soc_segs, output_dir='outputs')
    ecm_res = run_stage4(soc_segs, ocv_func, caps, output_dir='outputs')
    run_stage5(soc_segs, ecm_res, ocv_func, caps, output_dir='outputs')
