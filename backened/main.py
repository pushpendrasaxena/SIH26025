from datetime import datetime, timezone
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from typing import Optional
import os
from database import engine, Base, get_db
import models
from risk_engine import evaluate_node_risk
from alert_engine import trigger_alerts

# Initialize database tables (only create, don't drop existing data)
Base.metadata.create_all(bind=engine)

# Optional: Reset database only if RESET_DB environment variable is set
if os.getenv("RESET_DB", "false").lower() == "true":
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✓ Database reset complete")
app = FastAPI(title="Mine Safety API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SensorInputSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    node_id: Optional[str] = "A2"
    temperature: Optional[float] = 25.0
    humidity: Optional[float] = 55.0
    co_gas_level: Optional[float] = 300.0
    distance_mm: Optional[float] = 2000.0
    pitch: Optional[float] = 0.5
    roll: Optional[float] = 0.4
    vibration: Optional[float] = 0.05
    roof_load_kg: Optional[float] = 0.8
    risk_score: Optional[float] = 10.0
    anomaly_flag: Optional[str] = "NORMAL"

# POST ROUTE: Receive sensor data and calculate risk
@app.post("/api/sensor-data")
def receive_hardware_data(payload: SensorInputSchema, db: Session = Depends(get_db)):
    try:
        # 1. Save raw data first so the Risk Engine can access it via ID
        db_item = models.SensorData(
            node_id=payload.node_id or "A2",
            temperature=payload.temperature or 25.0,
            humidity=payload.humidity or 55.0,
            co_gas_level=payload.co_gas_level or 300.0,
            distance_mm=payload.distance_mm or 2000.0,
            pitch=payload.pitch or 0.5,
            roll=payload.roll or 0.4,
            vibration=payload.vibration or 0.05,
            roof_load_kg=payload.roof_load_kg or 0.8,
            risk_score=0.0,
            anomaly_flag="NORMAL"
        )
        db.add(db_item)
        db.commit()
        db.refresh(db_item)

        # 2. Let the Intelligence Engine analyze it and update the row
        risk_result = evaluate_node_risk(db, db_item.id)
        risk_score = risk_result["risk_score"]
        anomaly_flag = risk_result["anomaly_flag"]
        prediction_text = risk_result["prediction"]

        # 3. Trigger your alert engine for WARNING/HAZARD/CRITICAL alerts
        if anomaly_flag in ["WARNING", "HAZARD", "CRITICAL"]:
            # Pass node_id and prediction to enhanced alert engine
            trigger_alerts(db_item.id, risk_score, anomaly_flag, payload.node_id, prediction_text)
        
        print(f"✓ Node {payload.node_id}: Risk={risk_score:.1f}% | Flag={anomaly_flag} | Msg={prediction_text}")
        
        return {
            "status": "success",
            "reading_id": db_item.id,
            "node_id": payload.node_id,
            "calculated_risk_score": risk_score,
            "evaluated_flag": anomaly_flag,
            "prediction": prediction_text,
            "timestamp": db_item.timestamp.isoformat() if hasattr(db_item, 'timestamp') else None
        }
        
    except Exception as e:
        db.rollback()
        print(f"⚠️ RISK ENGINE ERROR: {str(e)}")
        return {"status": "error", "detail": str(e), "node_id": payload.node_id}

@app.get("/api/nodes/latest")
def get_all_nodes_latest(db: Session = Depends(get_db)):
    """
    Returns the latest sensor reading for each node in the mine network.
    Used by the web dashboard for real-time visualization.
    """
    node_ids = ["A1", "A2", "A3", "B1", "B2", "B3", "FACE"]
    nodes_response = []
    
    for node_id in node_ids:
        # Try to fetch the latest record for this node
        latest_record = db.query(models.SensorData).filter(
            models.SensorData.node_id == node_id
        ).order_by(models.SensorData.id.desc()).first()
        
        if latest_record:
            # Use actual timestamp from database record
            timestamp = latest_record.timestamp.isoformat() if hasattr(latest_record, 'timestamp') and latest_record.timestamp else datetime.now(timezone.utc).isoformat()
            
            # Get raw risk score
            risk_score = float(latest_record.risk_score or 10.0)
            anomaly_flag = str(latest_record.anomaly_flag or "NORMAL")
            
            nodes_response.append({
                "node_id": node_id,
                "node_name": f"Tunnel Post {node_id}",
                "timestamp": timestamp,
                "temperature": float(latest_record.temperature or 24.0),
                "humidity": float(latest_record.humidity or 55.0),
                "co_gas_level": float(latest_record.co_gas_level or 300.0),
                "distance_mm": float(latest_record.distance_mm or 2000.0),
                "pitch": float(latest_record.pitch or 0.5),
                "roll": float(latest_record.roll or 0.4),
                "vibration": float(latest_record.vibration or 0.05),
                "roof_load_kg": float(latest_record.roof_load_kg or 0.8),
                "risk_score": risk_score,
                "anomaly_flag": anomaly_flag,
                "lora_rssi": float(latest_record.lora_rssi or -88.0),
                "lora_snr": float(latest_record.lora_snr or 7.5),
                "battery_pct": float(latest_record.battery_pct or 85.0),
                "gateway_id": "GW-01"
            })
        else:
            # Return placeholder data for nodes with no readings yet
            nodes_response.append({
                "node_id": node_id,
                "node_name": f"Tunnel Post {node_id}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "temperature": 24.0,
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
            })

    return nodes_response
if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Mine Safety API Server...")
    print("   Available at: http://127.0.0.1:8000")
    print("   API Docs: http://127.0.0.1:8000/docs")
    print("   Health: http://127.0.0.1:8000/api/nodes/latest")
    # host="0.0.0.0" allows both local test clients and physical ESP32 hardware to connect
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
