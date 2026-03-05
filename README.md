# Real-Time Battery SOC Estimation (NASA Dataset)

This repository contains a hybrid Python and Go pipeline for **Equivalent Circuit Model (ECM) parameter extraction** and **real-time, closed-loop State of Charge (SOC) estimation**. It processes the [NASA Battery Dataset](https://data.nasa.gov/Electronics-and-Photovoltaics/Battery-Dataset/8jsk-6s2h) to build a digital twin of a lithium-ion cell, evaluated using a high-performance **Luenberger Observer**.

**Final Model Accuracy**: RMSE of **0.0083 V (8.3 mV)** against NASA hardware sensors over the Beginning-of-Life (BoL) cycle.

## 🏗️ System Architecture \& Theory of Operation

The project separates **offline model characterization** from **embedded hardware inference**, mimicking production BMS environments.

### 1. Data Characterization (`/extract_parameters`)

- **Tech**: Python (pandas, numpy), [batteryDAT](https://github.com/ImperialCollegeLondon/batteryDAT) library
- **Function**: Ingests `battery01.csv`, isolates BoL discharge cycle, extracts **First-Order Thevenin ECM parameters**:


| Parameter  | Description                                                  |
| :--------- | :----------------------------------------------------------- |
| $R_0$      | Ohmic resistance (instantaneous voltage drop)                |
| $R_p, C_p$ | Polarization resistance \& capacitance (transient diffusion) |
| OCV        | Open-circuit voltage curve mapped to SOC breakpoints         |

- **Output**: `ecm_parameters.json` (static Digital Twin)


### 2. Real-Time SOC Estimator (`/src`)

- **Tech**: Go (Golang)
- **Function**: Simulates Electric Vehicle BMS firmware
- **Algorithm** (Luenberger Observer):

1. **Prediction**: Coulomb counting ($SOC_{k} = SOC_{k-1} - \frac{\int I \, dt}{Q_{nom}}$)
2. **Physics**: ECM voltage prediction ($V_{pred} = OCV - I \cdot R_0 - V_p$)
3. **Correction**: $SOC_{corr} = SOC_{pred} + K \cdot (V_{meas} - V_{pred})$ where $K = 0.01$


## 🚀 Getting Started

### Prerequisites

- Python 3.10+ (pandas, numpy)
- Go 1.20+
- [Git LFS](https://git-lfs.com) (for 300MB+ NASA dataset)


### Installation

```bash
git clone https://github.com/SamrudhNelli/battery_modelling.git
cd battery_modelling
git lfs pull
```


## ⚙️ Usage Instructions

### 🐧 Linux/macOS (One-Click)

```bash
chmod +x run.sh
./run.sh
```


### 🪟 Windows

```cmd
run.bat
```


### 🛠️ Manual Execution

1. **Extract Parameters**

```bash
cd extract_parameters
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python extract_parameters.py
```

2. **Run Estimator**

```bash
cd ../src
go run main.go
```


## 📂 Repository Structure

```
battery_modelling/
├── data/
│   └── battery_alt_dataset/
│       └── regular_alt_batteries/
│           └── battery01.csv      # NASA Dataset (Git LFS)
├── extract_parameters/
│   ├── batteryDAT/               # Extraction library
│   ├── ecm_parameters.json       # Digital Twin (auto-generated)
│   ├── extract_parameters.py     # Parameter extraction
│   └── README.md                 # JSON schema
├── src/
│   ├── go.mod                    # Go module
│   └── main.go                   # Luenberger Observer BMS
├── run.sh                        # Linux automation
├── run.bat                       # Windows automation
├── .gitattributes                # Git LFS rules
└── README.md
```


## 📈 Results

- **Voltage RMSE**: 0.0083 V (8.3 mV)
- **Real-time capable**: <1ms inference latency
- **Drift-free**: Closed-loop observer eliminates Coulomb counting drift


## 🔬 Theory

The Luenberger Observer treats SOC as an **unmeasurable state** in the ECM:

```
State Vector: x = [SOC, V_p]^T
A = [[1, 0], [0, exp(-Δt/(Rp·Cp))]]
B = [[-Δt/Q_nom, -Rp·(1-exp(-Δt/(Rp·Cp)))]]^T
C = [dOCV/dSOC, -1]
```


## 🤝 Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Open PR

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## Acknowledgments

- [NASA Battery Dataset](https://data.nasa.gov/dataset/randomized-and-recommissioned-battery-dataset)
- [batteryDAT](https://github.com/ImperialCollegeLondon/batteryDAT) library
