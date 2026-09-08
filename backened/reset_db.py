import requests

url = "http://127.0.0.1:8000/api/sensor-data"
payload = {
    "node_id": "A2",
    "temperature": 24.5,
    "co_gas_level": 300.0,
    "distance_mm": 2000.0,
    "pitch": 0.4,
    "roll": 0.3,
    "vibration": 0.04,
    "roof_load_kg": 0.8,
    "risk_score": 10.0,
    "anomaly_flag": "NORMAL"
}

res = requests.post(url, json=payload)
print("Database reset response:", res.json())