import datetime
import time


# EMERGENCY CONTACT DATABASE
EMERGENCY_CONTACTS = {
    "supervisor": {
        "name": "Shift Supervisor",
        "phone": "+91-9876543210",
        "email": "supervisor@minesafety.local",
    },
    "chief_engineer": {
        "name": "Chief Engineer",
        "phone": "+91-8765432109",
        "email": "chief@minesafety.local",
    },
    "safety_officer": {
        "name": "Safety Officer",
        "phone": "+91-7654321098",
        "email": "safety@minesafety.local",
    },
    "rescue_team": {
        "name": "Rescue Team Lead",
        "phone": "+91-6543210987",
        "email": "rescue@minesafety.local",
    },
}

# ALERT LOG (In-memory storage for recent alerts)
alert_log = []

def get_alert_log(limit: int = 20) -> list:
    """Returns recent alert history"""
    return alert_log[-limit:]

def clear_alert_log():
    """Clears alert history"""
    global alert_log
    alert_log = []


# MOCKED CLOUD TELEPHONY APIs (Ready for Twilio / Exotel integration)

def dispatch_sms(phone_number: str, message: str, contact_name: str = ""):
    """Simulates sending a priority SMS to a mobile phone."""
    print(f"   📱 [SMS DISPATCHED] To: {contact_name or phone_number}")
    print(f"      -> Phone: {phone_number}")
    print(f"      -> Message: {message}")

def trigger_automated_call(phone_number: str, tts_message: str, contact_name: str = ""):
    """Simulates an automated Voice/Text-to-Speech call."""
    print(f"   📞 [AUTOMATED CALL] To: {contact_name or phone_number}")
    print(f"      -> Phone: {phone_number}")
    time.sleep(0.5)  # Simulating network connection time
    print(f"      -> TTS Message: '{tts_message}'")
    print(f"      ✅ Call logged and recorded")

def send_email_alert(email: str, subject: str, body: str, contact_name: str = ""):
    """Simulates sending an email alert"""
    print(f"   📧 [EMAIL ALERT] To: {contact_name} ({email})")
    print(f"      -> Subject: {subject}")
    print(f"      -> Body: {body[:100]}...")


# CORE ALERT ENGINE LOGIC

def trigger_alerts(reading_id: int, risk_score: float, anomaly_flag: str, node_id: str = "UNKNOWN", prediction: str = ""):
    """
    SIH Alert Engine: Executes multi-tier emergency protocols.
    Runs as a background task so it doesn't block incoming sensor data.
    
    Args:
        reading_id: Database record ID
        risk_score: Calculated risk percentage (0-100)
        anomaly_flag: NORMAL/WARNING/HAZARD/CRITICAL
        node_id: Sensor node identifier (A1, B2, FACE, etc.)
        prediction: Risk prediction message from risk_engine
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Log this alert
    alert_log.append({
        "timestamp": timestamp,
        "reading_id": reading_id,
        "node_id": node_id,
        "risk_score": risk_score,
        "severity": anomaly_flag,
        "prediction": prediction
    })
    
    # Keep only last 50 alerts
    if len(alert_log) > 50:
        alert_log.pop(0)

    print("\n" + "="*70)
    print(f"🚨 [ALERT ENGINE TRIGGERED] - Time: {timestamp}")
    print(f"Reading ID: {reading_id} | Node: {node_id} | Risk: {risk_score}%")
    print(f"Severity: {anomaly_flag} | Prediction: {prediction}")
    print("="*70)

    # 🟡 TIER 1: WARNING LEVEL
    if anomaly_flag == "WARNING":
        print("\n🟡 [TIER 1 PROTOCOL - WARNING]: Elevated environmental parameters detected")
        print("   -> Dashboard Alert: Visible yellow warning banner")
        print("   -> LED Signal: Yellow pulse on sensor node")
        print("   -> Logging: Event recorded in audit trail")
        print("   -> Action: Notify to dashboard clients in real-time")

    # 🟠 TIER 2: HAZARD LEVEL
    elif anomaly_flag == "HAZARD":
        print("\n🟠 [TIER 2 PROTOCOL - HAZARD]: Severe hazard signature identified")
        print("   -> Immediate Actions:")
        print("      • Buzzer activation on sensor node")
        print("      • Red alert on all dashboards")
        print("      • SMS dispatch to supervisor and chief engineer")
        
        supervisor = EMERGENCY_CONTACTS["supervisor"]
        dispatch_sms(supervisor["phone"], 
                     f"HAZARD: Node {node_id} - Risk {risk_score}% | {prediction}",
                     supervisor["name"])
        
        chief = EMERGENCY_CONTACTS["chief_engineer"]
        dispatch_sms(chief["phone"],
                     f"HAZARD ALERT: {node_id} ({risk_score}%) - {prediction}",
                     chief["name"])

    # 🔴 TIER 3: CRITICAL EMERGENCY LEVEL
    elif anomaly_flag == "CRITICAL":
        print("\n🔴 [TIER 3 PROTOCOL - CRITICAL]: CATASTROPHIC HAZARD DETECTED!")
        print("   -> EMERGENCY ESCALATION INITIATED")
        print("   -> Multi-channel alert cascade:")
        
        # SMS to all primary contacts
        supervisor = EMERGENCY_CONTACTS["supervisor"]
        print(f"\n   1. Notifying Supervisor...")
        dispatch_sms(supervisor["phone"],
                     f"🔴 CRITICAL EVACUATION: Node {node_id} - IMMEDIATE ACTION REQUIRED. Risk: {risk_score}%. ID: {reading_id}",
                     supervisor["name"])
        
        # Automated call to chief engineer
        chief = EMERGENCY_CONTACTS["chief_engineer"]
        print(f"\n   2. Calling Chief Engineer (Automated)...")
        tts_speech = f"Critical emergency alert. Sensor node {node_id} has detected catastrophic hazard conditions with {risk_score} percent risk. {prediction}. Initiate immediate mine evacuation protocol."
        trigger_automated_call(chief["phone"], tts_speech, chief["name"])
        
        # SMS to safety officer
        safety = EMERGENCY_CONTACTS["safety_officer"]
        print(f"\n   3. Alerting Safety Officer...")
        dispatch_sms(safety["phone"],
                     f"🔴 CRITICAL: {node_id} at {risk_score}% risk. Evacuation in progress.",
                     safety["name"])
        
        # Call to rescue team
        rescue = EMERGENCY_CONTACTS["rescue_team"]
        print(f"\n   4. Notifying Rescue Team...")
        trigger_automated_call(rescue["phone"],
                               f"Rescue team standby. Critical hazard at node {node_id}. Stand by for evacuation support.",
                               rescue["name"])
        
        # Email alerts (async)
        print(f"\n   5. Sending email notifications...")
        for contact_type, contact_info in EMERGENCY_CONTACTS.items():
            send_email_alert(contact_info["email"],
                            f"🔴 CRITICAL MINE EMERGENCY - Node {node_id}",
                            f"Immediate Action Required!\n\nNode: {node_id}\nRisk Level: {risk_score}%\nPrediction: {prediction}\n\nEvacuation protocol activated.",
                            contact_info["name"])
        
        print("\n   -> Mine-wide evacuation alarm ACTIVATED")
        print("   -> All emergency personnel notified")

    # 🟢 NORMAL STATUS
    else:
        print("\n🟢 [STATUS NORMAL]: All parameters within safe operational limits")

    print("="*70 + "\n")