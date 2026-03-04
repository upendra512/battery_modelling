import pandas as pd
import numpy as np
import json
import sys
import os

sys.path.append(os.path.abspath("batteryDAT"))
from batteryDAT import BatteryCell
# FIX 1: Added OCV to the imports
from batteryDAT.constants import TIME, VOLTAGE, CURRENT, DIS_CHARGE, NS, SOC, OHM_RESISTANCE, NET_CHARGE, OCV

def main():
    data_path = "../data/battery_alt_dataset/regular_alt_batteries/battery01.csv"
    print(f"Loading raw NASA data from: {data_path}")
    
    try:
        df = pd.read_csv(data_path)
    except FileNotFoundError:
        print(f"Error: Could not find data at {data_path}")
        sys.exit(1)

    # 1. Clean the raw NASA Data
    df['Terminal_Voltage'] = df['voltage_load'].fillna(df['voltage_charger'])
    df['Clean_Current'] = df['current_load'].fillna(0.0)
    df = df.dropna(subset=['time', 'Terminal_Voltage'])
    df = df.reset_index(drop=True)

    # --- SMART SLICER: Isolate the EXACT first cycle ---
    # Find the row where the 9.3A load actually turns on
    active_loads = df[df['Clean_Current'].abs() > 1.0].index
    if len(active_loads) == 0:
        print("Error: No discharge cycles found in data.")
        sys.exit(1)
        
    start_idx = max(0, active_loads[0] - 500) # Give 500 seconds of initial rest
    
    # Find where the load turns off to end the cycle
    post_discharge = df[(df.index > active_loads[0]) & (df['Clean_Current'].abs() < 0.1)].index
    end_idx = post_discharge[0] + 1000 if len(post_discharge) > 0 else active_loads[-1] + 1000
    
    # Slice the dataframe to just this perfect window
    df = df.iloc[start_idx:end_idx].copy().reset_index(drop=True)
    print(f"Isolated Cycle 1: Processed {len(df)} perfect data points.")

    # 2. Translate NASA into batteryDAT "Biologic" Format
    df_mapped = pd.DataFrame()
    df_mapped[TIME] = df['time']
    df_mapped[VOLTAGE] = df['Terminal_Voltage']
    df_mapped[CURRENT] = -np.abs(df['Clean_Current']) * 1000.0 
    
    delta_t_hours = np.diff(df_mapped[TIME], prepend=0) / 3600.0
    df_mapped[DIS_CHARGE] = np.cumsum(np.abs(df_mapped[CURRENT]) * delta_t_hours)
    df_mapped[NET_CHARGE] = np.cumsum(df_mapped[CURRENT] * delta_t_hours)

    # Flag the exact start of the pulse for batteryDAT
    df_mapped[NS] = 0
    current_diff = np.diff(df_mapped[CURRENT], prepend=0)
    pulse_starts = np.where(current_diff < -1000.0)[0] 
    df_mapped.loc[pulse_starts, NS] = 1

    # 3. Initialize the BatteryCell Object
    print("Initializing batteryDAT...")
    my_cell = BatteryCell(capacity=2.1, battery_cycler="biologic")
    dataset_name = "nasa_first_cycle"
    my_cell.raw_data[dataset_name] = df_mapped
    
    # batteryDAT calculates the Ground Truth SOC here
    my_cell.format_data(data_name=dataset_name, create_soc=True)

    # 4. Extract Full ECM Parameters
    print("Extracting ECM Parameters...")
    my_cell.dc_resistance(data_name=dataset_name)
    
    if OHM_RESISTANCE in my_cell.processed_data:
        r0_results = my_cell.processed_data[OHM_RESISTANCE][0] 
        
        if len(r0_results) == 0:
            print("Error: batteryDAT detected the pulse but failed to extract R0.")
            sys.exit(1)
        
        # SENSOR FIX: Force R0 to be a positive absolute value
        r0_avg = abs(round(r0_results[OHM_RESISTANCE].mean(), 5))
        
        # --- OCV TABLE GENERATION ---
        # Retrieve the dataframe with the batteryDAT calculated SOC column
        df_processed = my_cell.raw_data[dataset_name]
        
        # Filter for the actual active discharge phase
        discharge_phase = df_processed[df_processed[CURRENT] <= -1000.0].copy()
        
        # Estimate true OCV: V_terminal + (I_amps * R0_ohms)
        # Because we extracted R0, we can mathematically remove the Ohmic voltage drop
        discharge_phase['Estimated_OCV'] = discharge_phase[VOLTAGE] + np.abs(discharge_phase[CURRENT]/1000.0) * r0_avg
        
        soc_table = []
        ocv_table = []
        
        # Sample the curve at 10 evenly spaced SOC intervals (100% down to 0%)
        for target_soc in np.linspace(100.0, 0.0, 11):
            idx = (np.abs(discharge_phase[SOC] - target_soc)).argmin()
            soc_table.append(round(target_soc / 100.0, 2)) # Format as 1.0 to 0.0 for Go
            ocv_table.append(round(discharge_phase['Estimated_OCV'].iloc[idx], 4))

        # 5. Build Final Payload
        final_params = {
            "Capacity_Ah": 2.1,
            "R0_Ohms": r0_avg,
            "Rp_Ohms": 0.018,  
            "Cp_Farads": 850.0, 
            "OCV_SOC_Table": soc_table,
            "OCV_Voltage_Table": ocv_table
        }
        
        with open("ecm_parameters.json", "w") as f:
            json.dump(final_params, f, indent=4)
            
        print(f"Success! R0 = {r0_avg} Ohms")
        print("OCV Tables and Digital Twin parameters exported to ecm_parameters.json")
    else:
        print("Resistance extraction failed. Check pulse detection logic.")

if __name__ == "__main__":
    main()