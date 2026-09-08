from sqlalchemy.orm import Session
from models import SensorData

def evaluate_node_risk(db: Session, reading_id: int) -> dict:
    """
    SIH Intelligence Engine: State-Aware Risk & Prediction Calculator.
    Evaluates raw sensor data, historical rate-of-change, and generates frontend predictions.
    """
    # 1. Fetch the exact reading that was just saved by main.py
    current = db.query(SensorData).filter(SensorData.id == reading_id).first()
    if not current:
        return {"risk_score": 0.0, "anomaly_flag": "NORMAL", "prediction": "No data found."}
        
    # 2. Fetch the IMMEDIATE PREVIOUS reading FOR THIS SPECIFIC NODE to calculate Rate-of-Change
    previous = db.query(SensorData).filter(
        SensorData.node_id == current.node_id, 
        SensorData.id < reading_id
    ).order_by(SensorData.id.desc()).first()

    risk_score = 0.0
    prediction_messages = []
    
    # =====================================================================
    # FEATURE 1: HARDWARE TAMPER & DISCONNECT CHECK
    # =====================================================================
    if current.distance_mm >= 8000 and current.roof_load_kg <= 0.1 and current.pitch == 0:
        current.risk_score = 0.0
        current.anomaly_flag = "OFFLINE"
        db.commit()
        return {
            "risk_score": 0.0, 
            "anomaly_flag": "OFFLINE", 
            "prediction": "Hardware tampered or disconnected from tunnel wall."
        }

    # =====================================================================
    # FEATURE 2: BASE THRESHOLDS (Isolated Hazards)
    # =====================================================================
    
    # Heat & Ventilation
    if current.temperature > 40.0:
        risk_score += 40
        prediction_messages.append("Critical heat detected")
    elif current.temperature > 35.0:
        risk_score += 20
        prediction_messages.append("Heat levels rising")

    # CO Gas
    if current.co_gas_level > 2000:
        risk_score += 50
        prediction_messages.append("Toxic CO levels (Asphyxiation risk)")
    elif current.co_gas_level > 1000:
        risk_score += 30
        prediction_messages.append("Poor ventilation (CO building up)")

    # Seismic Vibration
    if current.vibration > 1.0:
        risk_score += 50
        prediction_messages.append("Severe seismic instability")
    elif current.vibration > 0.5:
        risk_score += 20
        prediction_messages.append("Abnormal structural rumbling")

    # Roof Sagging (Distance convergence)
    if 0 < current.distance_mm < 1000: 
        risk_score += 40
        prediction_messages.append("Roof sagging dangerously low")

    # Support Load
    if current.roof_load_kg > 4.0:
        risk_score += 30
        prediction_messages.append("Support beams exceeding safe load capacity")

    # =====================================================================
    # FEATURE 3: COMBINATORIAL SIGNATURES (The "Smart" Logic)
    # =====================================================================
    if current.temperature > 38.0 and current.co_gas_level > 1500:
        risk_score = 100
        prediction_messages.append("ACTIVE FIRE PREDICTION")
        
    if (abs(current.pitch) > 10 or abs(current.roll) > 10) and current.roof_load_kg > 4.0:
        risk_score = 100
        prediction_messages.append("IMMINENT ROOF COLLAPSE PREDICTED")

    # =====================================================================
    # FEATURE 4: RATE OF CHANGE (Sudden Spikes)
    # =====================================================================
    if previous:
        # Gas pocket breached
        gas_spike = current.co_gas_level - previous.co_gas_level
        if gas_spike > 500:
            risk_score += 50
            prediction_messages.append("SUDDEN GAS LEAK (Toxic seam breached)")
            
        # Roof dropping rapidly
        load_spike = current.roof_load_kg - previous.roof_load_kg
        if load_spike > 1.5:
            risk_score = 100
            prediction_messages.append("RAPID ROOF DROP (Evacuate instantly)")
            
        # Flash heating
        temp_spike = current.temperature - previous.temperature
        if temp_spike > 5.0:
            risk_score += 30
            prediction_messages.append("Flash heating (Friction/Electrical fire starting)")

    # =====================================================================
    # FEATURE 5: FINALIZE, SAVE & RETURN TO FRONTEND
    # =====================================================================
    
    final_score = min(risk_score, 100.0)
    
    if final_score >= 90:
        anomaly_flag = "CRITICAL"
    elif final_score >= 70:
        anomaly_flag = "HAZARD"
    elif final_score >= 40:
        anomaly_flag = "WARNING"
    else:
        anomaly_flag = "NORMAL"
        if not prediction_messages:
            prediction_messages.append("Conditions stable. No immediate threats.")

    # Combine all warnings into one readable AI prediction string for the dashboard
    final_prediction = " | ".join(prediction_messages)

    # Save the calculated intelligence directly back to the database row
    current.risk_score = final_score
    current.anomaly_flag = anomaly_flag
    db.commit()
    db.refresh(current)

    # Return the clean data dictionary so main.py can pass it straight to the web dashboard
    return {
        "risk_score": final_score,
        "anomaly_flag": anomaly_flag,
        "prediction": final_prediction
    }