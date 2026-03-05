package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ECMParameters struct {
	CapacityAh      float64   `json:"Capacity_Ah"`
	R0              float64   `json:"R0_Ohms"`
	Rp              float64   `json:"Rp_Ohms"`
	Cp              float64   `json:"Cp_Farads"`
	OCVSOCTable     []float64 `json:"OCV_SOC_Table"`
	OCVVoltageTable []float64 `json:"OCV_Voltage_Table"`
}

type BatteryState struct {
	SOC float64
	IR1 float64
}

func getOCV(soc float64, params ECMParameters) float64 {
	if soc >= 1.0 { return params.OCVVoltageTable[0] }
	if soc <= 0.0 { return params.OCVVoltageTable[len(params.OCVVoltageTable)-1] }

	for i := 0; i < len(params.OCVSOCTable)-1; i++ {
		highSOC := params.OCVSOCTable[i]
		lowSOC := params.OCVSOCTable[i+1]
		if soc <= highSOC && soc >= lowSOC {
			vHigh := params.OCVVoltageTable[i]
			vLow := params.OCVVoltageTable[i+1]
			ratio := (soc - lowSOC) / (highSOC - lowSOC)
			return vLow + ratio*(vHigh - vLow)
		}
	}
	return params.OCVVoltageTable[len(params.OCVVoltageTable)-1]
}

func main() {
	paramFile, err := os.ReadFile("../extract_parameters/all_ecm_parameters.json")
	if err != nil {
		fmt.Println("FATAL: Could not read JSON file.", err)
		return
	}
	
	var allParams map[string]ECMParameters
	if err := json.Unmarshal(paramFile, &allParams); err != nil {
		fmt.Println("FATAL: Could not parse JSON.", err)
		return
	}

	datasetPath := "../data/battery_alt_dataset/regular_alt_batteries/*.csv"
	files, err := filepath.Glob(datasetPath)
	if err != nil || len(files) == 0 {
		fmt.Println("FATAL: No CSV files found at:", datasetPath)
		return
	}

	fmt.Println("-----------------------------------------------------------------")
	fmt.Printf("🔋 Initializing Batch Simulation for %d Battery Files...\n", len(files))
	fmt.Println("-----------------------------------------------------------------")
	fmt.Printf("%-20s | %-15s | %-15s\n", "File Name", "Data Points", "Final RMSE (V)")
	fmt.Println("-----------------------------------------------------------------")

	for _, file := range files {
		baseName := strings.TrimSuffix(filepath.Base(file), filepath.Ext(file))
		params, exists := allParams[baseName]
		if !exists {
			fmt.Printf("%-20s | %-15s | %-15s\n", filepath.Base(file), "NO PARAMS", "N/A")
			continue
		}
		runSimulation(file, params)
	}
	
	fmt.Println("-----------------------------------------------------------------")
	fmt.Println("✅ Batch Processing Complete.")
}

// runSimulation now tracks both Voltage and SOC Error
func runSimulation(filePath string, params ECMParameters) {
	csvFile, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("%-20s | %-12s | %-12s\n", filepath.Base(filePath), "ERROR", "N/A")
		return
	}
	defer csvFile.Close()

	reader := csv.NewReader(csvFile)
	reader.FieldsPerRecord = -1 
	reader.Read() // Skip header

	const colTime, colVoltageCharger, colVoltageLoad, colCurrent = 1, 3, 5, 6

	state := BatteryState{SOC: 1.0, IR1: 0.0}
	TrueSOC := 1.0 // This is our "Benchmark" SOC
	const K = 0.01 // Observer Gain
	
	var lastTime float64
	var totalSqErrV float64
	var totalSqErrSOC float64
	var count int

	for {
		row, err := reader.Read()
		if err == io.EOF { break }
		if len(row) < 7 { continue } 
		
		currentTime, _ := strconv.ParseFloat(strings.TrimSpace(row[colTime]), 64)
		voltage, _ := strconv.ParseFloat(strings.TrimSpace(row[colVoltageLoad]), 64)
		if voltage == 0 { voltage, _ = strconv.ParseFloat(strings.TrimSpace(row[colVoltageCharger]), 64) }
		currentRaw, _ := strconv.ParseFloat(strings.TrimSpace(row[colCurrent]), 64)
		
		current := math.Abs(currentRaw) // Discharge current is positive per Slide 10
		
		if current < 0.1 || voltage < 1.0 { 
			lastTime = currentTime
			continue 
		}
	
		dt := currentTime - lastTime
		if dt <= 0 || dt > 100 { dt = 1.0 }

		// ----------------------------------------------------------------
		// 1. BENCHMARK (Pure Coulomb Counting)
		// ----------------------------------------------------------------
		TrueSOC = TrueSOC - (current * (dt / 3600.0)) / params.CapacityAh

		// ----------------------------------------------------------------
		// 2. THE ESTIMATOR (Luenberger Observer)
		// ----------------------------------------------------------------
		// Prediction (Coulomb Counting)
		state.SOC = state.SOC - (current * (dt / 3600.0)) / params.CapacityAh

		// Physics (Diffusion Current iR1) - Slide 35
		tau := params.Rp * params.Cp
		expFact := math.Exp(-dt / tau)
		state.IR1 = (state.IR1 * expFact) + ((1.0 - expFact) * current)

		// Observation (Predicted Voltage) - Slide 36
		predictedV := getOCV(state.SOC, params) - (params.Rp * state.IR1) - (params.R0 * current)
		
		// Feedback Correction (The Luenberger Gain)
		errorV := voltage - predictedV
		state.SOC += K * errorV 

		// ----------------------------------------------------------------
		// 3. ERROR CALCULATION
		// ----------------------------------------------------------------
		totalSqErrV += errorV * errorV
		
		socErr := TrueSOC - state.SOC
		totalSqErrSOC += socErr * socErr
		
		count++
		lastTime = currentTime

		if state.SOC <= 0.05 { break }
	}

	if count > 0 {
		rmseV := math.Sqrt(totalSqErrV / float64(count))
		rmseSOC := math.Sqrt(totalSqErrSOC / float64(count))
		// Format output to show SOC error as a percentage
		fmt.Printf("%-20s | %-12d | %.4f V | %.4f %%\n", 
            filepath.Base(filePath), count, rmseV, rmseSOC*100)
	}
}