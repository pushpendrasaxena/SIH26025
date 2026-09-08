"""
Check Risk Script: View the latest sensor reading and risk assessment
"""
from database import SessionLocal
from models import SensorData
from datetime import datetime, timezone

def check_latest_reading():
    db = SessionLocal()
    try:
        # Get the most recent reading
        latest = db.query(SensorData).order_by(SensorData.id.desc()).first()
        
        if latest:
            print("\n" + "="*70)
            print(f"  LATEST SENSOR READING (ID: {latest.id})")
            print("="*70)
            print(f"  Node ID:           {latest.node_id}")
            print(f"  Timestamp:         {latest.timestamp}")
            print(f"\n  ENVIRONMENTAL CONDITIONS:")
            print(f"    Temperature:     {latest.temperature}°C")
            print(f"    Humidity:        {latest.humidity}%")
            print(f"    CO Gas Level:    {latest.co_gas_level} ppm")
            print(f"\n  STRUCTURAL CONDITIONS:")
            print(f"    Roof Distance:   {latest.distance_mm} mm")
            print(f"    Pitch Angle:     {latest.pitch}°")
            print(f"    Roll Angle:      {latest.roll}°")
            print(f"    Support Load:    {latest.roof_load_kg} kg")
            print(f"\n  VIBRATION & COMMUNICATION:")
            print(f"    Vibration:       {latest.vibration} m/s²")
            print(f"    LoRa RSSI:       {latest.lora_rssi} dBm")
            print(f"    LoRa SNR:        {latest.lora_snr} dB")
            print(f"    Battery:         {latest.battery_pct}%")
            print(f"\n  RISK ASSESSMENT:")
            print(f"    Calculated Risk: {latest.risk_score}%")
            print(f"    Anomaly Flag:    {latest.anomaly_flag}")
            
            # Color-coded severity
            if latest.anomaly_flag == "CRITICAL":
                print(f"    Status:          🔴 CRITICAL - IMMEDIATE ACTION REQUIRED")
            elif latest.anomaly_flag == "HAZARD":
                print(f"    Status:          🟠 HAZARD - ELEVATED RISK")
            elif latest.anomaly_flag == "WARNING":
                print(f"    Status:          🟡 WARNING - MONITOR CLOSELY")
            else:
                print(f"    Status:          🟢 NORMAL - ALL CLEAR")
            print("="*70 + "\n")
        else:
            print("❌ No records found in database. Have you run the backend API yet?")
    finally:
        db.close()

if __name__ == "__main__":
    check_latest_reading()
