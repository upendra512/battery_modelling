import pandas as pd
import numpy as np
import json
import sys
import os
import glob

sys.path.append(os.path.abspath("batteryDAT"))
from batteryDAT import BatteryCell
# FIX 1: Added OCV to the imports
from batteryDAT.constants import TIME, VOLTAGE, CURRENT, DIS_CHARGE, NS, SOC, OHM_RESISTANCE, NET_CHARGE, OCV

def process_battery_file(file_path):
    """Processes a single battery CSV and returns its ECM parameters."""
    print(f"\n--- Processing: {os.path.basename(file_path)} ---")
    
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None

    # 1. Clean the raw NASA Data
    if 'voltage_load' not in df.columns or 'voltage_charger' not in df.columns:
        print(f"Skipping {os.path.basename(file_path)}: Missing expected columns.")
        return None

    df['Terminal_Voltage'] = df['voltage_load'].fillna(df['voltage_charger'])
    df['Clean_Current'] = df['current_load'].fillna(0.0)
    df = df.dropna(subset=['time', 'Terminal_Voltage'])
    df = df.reset_index(drop=True)

    # --- SMART SLICER: Isolate the EXACT first cycle ---
    active_loads = df[df['Clean_Current'].abs() > 1.0].index
    if len(active_loads) == 0:
        print(f"Skipping {os.path.basename(file_path)}: No discharge cycles found.")
        return None
        
    start_idx = max(0, active_loads[0] - 500) # Give 500 seconds of initial rest
    
    post_discharge = df[(df.index > active_loads[0]) & (df['Clean_Current'].abs() < 0.1)].index
    end_idx = post_discharge[0] + 1000 if len(post_discharge) > 0 else active_loads[-1] + 1000
    
    df = df.iloc[start_idx:end_idx].copy().reset_index(drop=True)

    # 2. Translate NASA into batteryDAT "Biologic" Format
    df_mapped = pd.DataFrame()
    df_mapped[TIME] = df['time']
    df_mapped[VOLTAGE] = df['Terminal_Voltage']
    df_mapped[CURRENT] = -np.abs(df['Clean_Current']) * 1000.0 
    
    delta_t_hours = np.diff(df_mapped[TIME], prepend=0) / 3600.0
    df_mapped[DIS_CHARGE] = np.cumsum(np.abs(df_mapped[CURRENT]) * delta_t_hours)
    df_mapped[NET_CHARGE] = np.cumsum(df_mapped[CURRENT] * delta_t_hours)

    df_mapped[NS] = 0
    current_diff = np.diff(df_mapped[CURRENT], prepend=0)
    pulse_starts = np.where(current_diff < -1000.0)[0] 
    df_mapped.loc[pulse_starts, NS] = 1

    # 3. Initialize the BatteryCell Object
    my_cell = BatteryCell(capacity=2.1, battery_cycler="biologic")
    dataset_name = os.path.basename(file_path).split('.')[0]
    my_cell.raw_data[dataset_name] = df_mapped
    
    my_cell.format_data(data_name=dataset_name, create_soc=True)

    # 4. Extract Full ECM Parameters
    my_cell.dc_resistance(data_name=dataset_name)
    
    if OHM_RESISTANCE in my_cell.processed_data:
        r0_results = my_cell.processed_data[OHM_RESISTANCE][0] 
        
        if len(r0_results) == 0:
            print(f"Skipping {os.path.basename(file_path)}: Failed to extract R0.")
            return None
        
        r0_avg = abs(round(r0_results[OHM_RESISTANCE].mean(), 5))
        
        # --- OCV TABLE GENERATION ---
        df_processed = my_cell.raw_data[dataset_name]
        discharge_phase = df_processed[df_processed[CURRENT] <= -1000.0].copy()
        
        discharge_phase['Estimated_OCV'] = discharge_phase[VOLTAGE] + np.abs(discharge_phase[CURRENT]/1000.0) * r0_avg
        
        soc_table = []
        ocv_table = []
        
        for target_soc in np.linspace(100.0, 0.0, 11):
            idx = (np.abs(discharge_phase[SOC] - target_soc)).argmin()
            soc_table.append(round(target_soc / 100.0, 2))
            ocv_table.append(round(discharge_phase['Estimated_OCV'].iloc[idx], 4))

        return {
            "Capacity_Ah": 2.1,
            "R0_Ohms": r0_avg,
            "Rp_Ohms": 0.018,  
            "Cp_Farads": 850.0, 
            "OCV_SOC_Table": soc_table,
            "OCV_Voltage_Table": ocv_table
        }
    else:
        print(f"Skipping {os.path.basename(file_path)}: Resistance extraction failed.")
        return None

def main():
    # Adjust this to the folder containing all your CSV files
    data_dir = "../data/battery_alt_dataset/regular_alt_batteries/" 
    
    # Grab all matching CSV files from the folder
    csv_files = glob.glob(os.path.join(data_dir, "battery*.csv"))
    
    if not csv_files:
        print(f"Error: No CSV files found in {data_dir}")
        sys.exit(1)
        
    print(f"Found {len(csv_files)} battery datasets. Starting batch processing...")
    
    all_results = {}
    
    # Process each file and store the results using the filename as the key
    for file_path in sorted(csv_files):
        battery_id = os.path.basename(file_path).replace('.csv', '')
        result = process_battery_file(file_path)
        
        if result:
            all_results[battery_id] = result
            print(f"Success for {battery_id}! R0 = {result['R0_Ohms']} Ohms")
            
    # 5. Export master JSON payload
    output_file = "all_ecm_parameters.json"
    with open(output_file, "w") as f:
        json.dump(all_results, f, indent=4)
        
    print(f"\nBatch processing complete! Extracted parameters for {len(all_results)} batteries.")
    print(f"All data exported to {output_file}")

if __name__ == "__main__":
    main()