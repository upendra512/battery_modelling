# Li-ion Digital Twin: ECM Parameter Extraction

This directory contains the data extraction pipeline for estimating Equivalent Circuit Model (ECM) parameters and Open-Circuit Voltage (OCV) characteristics of Lithium-ion cells using the NASA Battery Dataset.

The pipeline utilizes the `batteryDAT` library to process Beginning-of-Life (BoL) charge/discharge cycles and outputs a static, data-driven "Digital Twin" of the battery into a lightweight JSON format (`ecm_parameters.json`).

## `ecm_parameters.json` Structure

The output JSON file acts as the configuration payload for the real-time SOC Extended Kalman Filter (EKF) estimator. It contains the following parameters:

### Static Cell Properties
* **`Capacity_Ah`** *(float)*: The nominal capacity of the battery pack in Ampere-hours (Ah) derived from Coulomb counting integration.

### Dynamic ECM Parameters (First-Order Thevenin Model)
* **`R0_Ohms`** *(float)*: The Ohmic Resistance. Represents the instantaneous voltage drop across the battery terminals and electrolyte the moment a load is applied or removed.
* **`Rp_Ohms`** *(float)*: The Polarization Resistance. Represents the sluggish resistance caused by internal chemical reactions and charge transfer.
* **`Cp_Farads`** *(float)*: The Polarization Capacitance. Represents the delay in voltage response due to the slow diffusion of lithium ions within the cell.

### OCV-SOC Characterization (Lookup Tables)
* **`OCV_SOC_Table`** *(array of floats)*: An array of State of Charge (SOC) breakpoints, ranging from `1.0` (100% full) down to `0.0` (fully discharged).
* **`OCV_Voltage_Table`** *(array of floats)*: The corresponding estimated Open-Circuit Voltages (OCV) for each SOC breakpoint. This curve is mathematically reconstructed by removing the Ohmic voltage drop ($I \cdot R_0$) from the terminal voltage during the discharge phase.

## Usage

This JSON file is designed to be unmarshaled directly into the real-time Go/C++ SOC Estimator. The estimator uses the `OCV_SOC_Table` and `OCV_Voltage_Table` for linear interpolation of the resting voltage, and the $R_0$, $R_p$, and $C_p$ values to predict the transient terminal voltage under varying loads.