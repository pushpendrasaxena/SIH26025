const express = require('express');
const cors = require('cors');
const twilio = require('twilio'); // <-- Add Twilio
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- TWILIO CONFIGURATION ---
const accountSid = 'YOUR_TWILIO_ACCOUNT_SID'; // Paste your SID here
const authToken = 'YOUR_TWILIO_AUTH_TOKEN';   // Paste your Token here
const client = new twilio(accountSid, authToken);

const twilioNumber = '+1234567890'; // Your Twilio Trial Number
const emergencyContactNumber = '+919876543210'; // Your Verified Personal Number (Include +91)

// Flag to prevent spamming calls every 3 seconds
let emergencyCallActive = false; 

// --- MAKE PHONE CALL FUNCTION ---
function triggerEmergencyCall(reason) {
    if (emergencyCallActive) return; // Don't call if we already just called
    emergencyCallActive = true;

    console.log("🚨 TRIGGERING AUTOMATED PHONE CALL...");

    client.calls.create({
        // The robotic voice will read this exact sentence:
        twiml: `<Response><Say voice="alice">Emergency! Mine Shaft critical alert. ${reason}. Evacuate immediately. I repeat, Evacuate immediately.</Say></Response>`,
        to: emergencyContactNumber,
        from: twilioNumber
    })
    .then(call => console.log('📞 Call successfully dispatched! SID:', call.sid))
    .catch(err => console.error('❌ Call failed:', err));

    // Reset the flag after 2 minutes so it can call again if another emergency happens
    setTimeout(() => { emergencyCallActive = false; }, 120000); 
}

// --- RECEIVE LORA DATA FROM ESP32-C6 ---
app.post('/api/telemetry', (req, res) => {
    const data = req.body;
    console.log("📥 Telemetry Updated:", data);

    // EMERGENCY LOGIC: Trigger call if sensors go crazy
    if (data.gas > 2000) {
        triggerEmergencyCall(`Toxic gas levels reached ${data.gas}`);
    } else if (data.accel_z > 15 || data.accel_z < 5) {
        triggerEmergencyCall("Severe structural vibration detected");
    }

    res.status(200).json({ status: "success" });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});