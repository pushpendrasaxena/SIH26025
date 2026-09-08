# SIH26025 Mine Safety Backend API

## Overview
This is the FastAPI backend for the Coal Mine Subsidence Early Warning Network (SIH26025). It receives sensor data from ESP32 nodes deployed in mine tunnels, calculates risk using an intelligent risk engine, and provides real-time data to the web dashboard.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Server
```bash
python main.py
```

The server will start at `http://127.0.0.1:8000`

### 3. API Documentation
- **Interactive Docs**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc

## API Endpoints

### POST /api/sensor-data
**Submit sensor data from an ESP32 node**

**Request:**
```json
{
  "node_id": "A2",
  "temperature": 25.5,
  "humidity": 60.0,
  "co_gas_level": 350.0,
  "distance_mm": 2500.0,
  "pitch": 0.3,
  "roll": 0.2,
  "vibration": 0.02,
  "roof_load_kg": 1.2
}
```

**Response:**
```json
{
  "status": "success",
  "reading_id": 42,
  "node_id": "A2",
  "calculated_risk_score": 15.5,
  "evaluated_flag": "NORMAL",
  "timestamp": "2024-09-08T10:30:45.123456"
}
```

### GET /api/nodes/latest
**Fetch latest readings from all nodes (used by dashboard)**

**Response:**
```json
[
  {
    "node_id": "A1",
    "node_name": "Tunnel Post A1",
    "timestamp": "2024-09-08T10:30:45.123456",
    "temperature": 24.5,
    "humidity": 55.0,
    "co_gas_level": 300.0,
    "distance_mm": 2000.0,
    "pitch": 0.5,
    "roll": 0.4,
    "vibration": 0.05,
    "roof_load_kg": 0.8,
    "risk_score": 10.0,
    "anomaly_flag": "NORMAL",
    "lora_rssi": -88.0,
    "lora_snr": 7.5,
    "battery_pct": 85.0,
    "gateway_id": "GW-01"
  },
  ...
]
```

## Sensor Nodes
The system supports 7 sensor nodes deployed in a dual-tunnel mine layout:

| Node ID | Location | Status |
|---------|----------|--------|
| A1 | Tunnel A, Post 1 | Active |
| A2 | Tunnel A, Post 2 | Active |
| A3 | Tunnel A, Post 3 | Active |
| B1 | Tunnel B, Post 1 | Active |
| B2 | Tunnel B, Post 2 | Active |
| B3 | Tunnel B, Post 3 | Active |
| FACE | Coal Face (Working Zone) | Active |

## Risk Calculation Engine

The system evaluates 5 risk factors:

### 1. Base Sensor Thresholds
- **Temperature** (DHT22): >40°C = critical, >35°C = warning
- **CO Gas** (MQ-7): >2000 ppm = toxic, >1000 ppm = poor ventilation
- **Vibration** (MPU6050): >1.0 m/s² = severe, >0.5 m/s² = abnormal
- **Roof Distance** (VL53L0X): <100mm = dangerous sag
- **Support Load** (HX711): >5.0 kg = exceeds capacity

### 2. Combinatorial Signatures
- **Underground Fire**: Heat >38°C + CO >1500 ppm → CRITICAL
- **Heat Stroke Risk**: Temp >32°C + Humidity >85% → +40 risk
- **Roof Collapse**: Pitch/Roll >10° + Load >4.0 kg → CRITICAL
- **Rockburst Precursor**: Vibration >0.3 + Load >3.5 kg → +40 risk

### 3. Rate of Change Detection
- **Gas Spike**: >1000 ppm increase in one reading → CRITICAL
- **Load Spike**: >2.0 kg increase in one reading → CRITICAL

### 4. Hardware Validation
- Detects tampered or disconnected sensors
- Marks readings with `TAMPER_ERROR` flag

### 5. Final Scoring
```
Risk Score Range    →    Anomaly Flag
0-39%               →    NORMAL (🟢)
40-69%              →    WARNING (🟡)
70-89%              →    HAZARD (🟠)
90-100%             →    CRITICAL (🔴)
```

## Utility Scripts

### check_risk.py
View the latest sensor reading and detailed risk assessment:
```bash
python check_risk.py
```

### test_api.py
Test the API with realistic sensor scenarios:
```bash
python test_api.py
```

Tests three scenarios:
1. Normal operating conditions
2. Warning conditions (elevated temp + gas)
3. Critical conditions (extreme readings)

### reset_db.py
Send test data to populate the database (deprecated - use test_api.py instead)

## Database

The system uses SQLite for persistent storage. Database file: `mine_safety.db`

### Reset Database
```bash
# Set environment variable and run server
export RESET_DB=true
python main.py
```

### Database Schema
| Field | Type | Description |
|-------|------|-------------|
| id | Integer | Unique record ID (auto-increment) |
| node_id | String | Sensor node identifier (A1-A3, B1-B3, FACE) |
| timestamp | DateTime | When reading was recorded |
| temperature | Float | Celsius |
| humidity | Float | Percentage |
| co_gas_level | Float | PPM (parts per million) |
| distance_mm | Float | Millimeters (ceiling height) |
| pitch | Float | Degrees |
| roll | Float | Degrees |
| vibration | Float | m/s² |
| roof_load_kg | Float | Kilograms |
| risk_score | Float | 0-100% |
| anomaly_flag | String | NORMAL, WARNING, HAZARD, CRITICAL, TAMPER_ERROR |
| lora_rssi | Float | Signal strength (dBm) |
| lora_snr | Float | Signal-to-noise ratio (dB) |
| battery_pct | Float | Battery percentage |

## Configuration

### CORS Settings
All origins allowed by default:
```python
allow_origins=["*"]
```

### Server Settings
- **Host**: 0.0.0.0 (accessible from any device)
- **Port**: 8000
- **Reload**: True (auto-restart on code changes)

## Troubleshooting

### "Could not connect to FastAPI server"
- Make sure the server is running: `python main.py`
- Check that port 8000 is not in use

### "Module not found: risk_engine"
- Make sure you're running from the `backened/` directory
- Check that all Python files are in the same folder

### Database errors
- Delete `mine_safety.db` and restart the server to reset

## Development Tips

1. **Test in real-time**: Open three terminals:
   - Terminal 1: `python main.py` (server)
   - Terminal 2: `python test_api.py` (test data)
   - Terminal 3: Monitor via http://127.0.0.1:8000/docs

2. **Check latest data**: `python check_risk.py`

3. **Debug mode**: Add `print()` statements or use browser DevTools at http://127.0.0.1:8000/docs

## Performance Notes

- Database queries optimized with `.order_by(...).first()`
- CORS middleware enabled for cross-origin requests
- All sensor fields have default values to prevent null errors
- Connection pooling handled by SQLAlchemy

## Future Enhancements

- [ ] WebSocket support for real-time alerts
- [ ] Alert notification system (SMS/Email integration)
- [ ] Historical data analysis and trending
- [ ] Machine learning-based anomaly detection
- [ ] Multi-gateway support
- [ ] Data encryption and authentication
