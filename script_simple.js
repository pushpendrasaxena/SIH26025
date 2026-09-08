/* ============================================================
   MINE SAFETY DASHBOARD - FRONTEND
   Real-time sensor monitoring with risk assessment
   ============================================================ */

const CONFIG = {
  API_URL: "http://127.0.0.1:8000/api/nodes/latest",
  POLL_INTERVAL_MS: 4000,
  OFFLINE_TIMEOUT_MS: 30000, // Mark offline after 30s without update
};

// Risk threshold definitions (from backend risk_engine.py)
const RISK_LEVELS = {
  NORMAL: { min: 0, max: 39, label: "NORMAL", class: "normal" },
  WARNING: { min: 40, max: 69, label: "WARNING", class: "warning" },
  HAZARD: { min: 70, max: 89, label: "HAZARD", class: "hazard" },
  CRITICAL: { min: 90, max: 100, label: "CRITICAL", class: "critical" },
};

// Sensor metadata: label and units
const SENSOR_METADATA = {
  temperature: { label: "Temperature", unit: "°C", threshold: 40 },
  humidity: { label: "Humidity", unit: "%RH", threshold: 85 },
  co_gas_level: { label: "CO Level", unit: "ppm", threshold: 2000 },
  distance_mm: { label: "Distance", unit: "mm", threshold: 100 },
  pitch: { label: "Pitch", unit: "°", threshold: 10 },
  roll: { label: "Roll", unit: "°", threshold: 10 },
  vibration: { label: "Vibration", unit: "m/s²", threshold: 1.0 },
  roof_load_kg: { label: "Load", unit: "kg", threshold: 5 },
  lora_rssi: { label: "Signal (RSSI)", unit: "dBm", threshold: -100 },
  lora_snr: { label: "Signal (SNR)", unit: "dB", threshold: 5 },
  battery_pct: { label: "Battery", unit: "%", threshold: 20 },
};

let appState = {
  nodes: {}, // node_id -> { ...sensor data, lastUpdate, status }
  alerts: [], // array of active alerts
  eventLog: [], // array of log entries
  isAutoRefreshing: true,
  connectionStatus: "disconnected", // "connected", "retrying", "disconnected"
  lastFetchTime: null,
};

// DOM elements cache
const DOM = {
  clock: null,
  connectionDot: null,
  connectionStatus: null,
  totalNodes: null,
  normalCount: null,
  warningCount: null,
  hazardCount: null,
  criticalCount: null,
  offlineCount: null,
  nodesGrid: null,
  alertsSection: null,
  alertsList: null,
  logList: null,
  lastUpdate: null,
  apiStatus: null,
  refreshBtn: null,
  autoRefreshBtn: null,
  evacBanner: null,
};

// Initialize DOM references
function initializeDOMReferences() {
  DOM.clock = document.getElementById("clock");
  DOM.connectionDot = document.getElementById("connectionDot");
  DOM.connectionStatus = document.getElementById("connectionStatus");
  DOM.totalNodes = document.getElementById("totalNodes");
  DOM.normalCount = document.getElementById("normalCount");
  DOM.warningCount = document.getElementById("warningCount");
  DOM.hazardCount = document.getElementById("hazardCount");
  DOM.criticalCount = document.getElementById("criticalCount");
  DOM.offlineCount = document.getElementById("offlineCount");
  DOM.nodesGrid = document.getElementById("nodesGrid");
  DOM.alertsSection = document.getElementById("alertsSection");
  DOM.alertsList = document.getElementById("alertsList");
  DOM.logList = document.getElementById("logList");
  DOM.lastUpdate = document.getElementById("lastUpdate");
  DOM.apiStatus = document.getElementById("apiStatus");
  DOM.refreshBtn = document.getElementById("refreshBtn");
  DOM.autoRefreshBtn = document.getElementById("autoRefreshBtn");
  DOM.evacBanner = document.getElementById("evacBanner");
}

// Update clock every second
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-IN", { hour12: false });
  if (DOM.clock) DOM.clock.textContent = time;
}
setInterval(updateClock, 1000);
updateClock();

// Get risk level object based on score
function getRiskLevel(riskScore) {
  for (let level of [RISK_LEVELS.CRITICAL, RISK_LEVELS.HAZARD, RISK_LEVELS.WARNING]) {
    if (riskScore >= level.min) return level;
  }
  return RISK_LEVELS.NORMAL;
}

// Update connection status indicator
function setConnectionStatus(status) {
  appState.connectionStatus = status;
  if (DOM.connectionDot) {
    DOM.connectionDot.className = `dot ${status}`;
  }
  if (DOM.connectionStatus) {
    DOM.connectionStatus.textContent = 
      status === "connected" ? "Connected" :
      status === "retrying" ? "Retrying..." : "Disconnected";
  }
}

// Fetch latest node data from backend
async function fetchNodesData() {
  try {
    setConnectionStatus("retrying");
    const response = await fetch(CONFIG.API_URL, { 
      timeout: 2000,
      headers: { "Accept": "application/json" }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    appState.lastFetchTime = new Date();
    
    if (Array.isArray(data)) {
      updateNodesData(data);
      setConnectionStatus("connected");
      return true;
    }
  } catch (error) {
    console.error("Fetch error:", error);
    setConnectionStatus("disconnected");
    markNodesOffline();
    return false;
  }
}

// Update nodes data from API response
function updateNodesData(apiData) {
  const now = Date.now();
  const previousStates = {};
  
  // Save previous states for change detection
  Object.keys(appState.nodes).forEach(id => {
    previousStates[id] = appState.nodes[id].anomaly_flag;
  });
  
  // Update nodes
  apiData.forEach(node => {
    const nodeId = node.node_id;
    const riskLevel = getRiskLevel(node.risk_score);
    
    const nodeData = {
      ...node,
      lastUpdate: now,
      status: riskLevel.class,
    };
    
    appState.nodes[nodeId] = nodeData;
    
    // Log state transitions
    if (previousStates[nodeId] && previousStates[nodeId] !== node.anomaly_flag) {
      addEventLog(nodeId, `Status: ${previousStates[nodeId]} → ${node.anomaly_flag}`);
    }
  });
  
  render();
}

// Mark all nodes as offline
function markNodesOffline() {
  const now = Date.now();
  Object.keys(appState.nodes).forEach(id => {
    if (appState.nodes[id]) {
      appState.nodes[id].status = "offline";
    }
  });
  render();
}

// Render all UI components
function render() {
  updateStats();
  renderNodesGrid();
  renderAlerts();
  renderEventLog();
  updateFooter();
  checkCriticalState();
}

// Calculate and update summary statistics
function updateStats() {
  let total = 7; // A1, A2, A3, B1, B2, B3, FACE
  let normal = 0, warning = 0, hazard = 0, critical = 0, offline = 0;
  
  const nodeIds = ["A1", "A2", "A3", "B1", "B2", "B3", "FACE"];
  nodeIds.forEach(id => {
    const node = appState.nodes[id];
    if (!node || node.status === "offline") {
      offline++;
    } else if (node.status === "critical") {
      critical++;
    } else if (node.status === "hazard") {
      hazard++;
    } else if (node.status === "warning") {
      warning++;
    } else {
      normal++;
    }
  });
  
  if (DOM.totalNodes) DOM.totalNodes.textContent = total;
  if (DOM.normalCount) DOM.normalCount.textContent = normal;
  if (DOM.warningCount) DOM.warningCount.textContent = warning;
  if (DOM.hazardCount) DOM.hazardCount.textContent = hazard;
  if (DOM.criticalCount) DOM.criticalCount.textContent = critical;
  if (DOM.offlineCount) DOM.offlineCount.textContent = offline;
}

// Render sensor nodes grid
function renderNodesGrid() {
  if (!DOM.nodesGrid) return;
  
  const nodeIds = ["A1", "A2", "A3", "B1", "B2", "B3", "FACE"];
  DOM.nodesGrid.innerHTML = "";
  
  nodeIds.forEach(nodeId => {
    const node = appState.nodes[nodeId];
    const card = createNodeCard(nodeId, node);
    DOM.nodesGrid.appendChild(card);
  });
}

// Create a node card element
function createNodeCard(nodeId, nodeData) {
  const card = document.createElement("div");
  card.className = "node-card";
  
  if (!nodeData || nodeData.status === "offline") {
    card.classList.add("status-offline");
    card.innerHTML = `
      <div class="node-header">
        <div class="node-title">${nodeId}</div>
        <div class="node-status-badge offline">Offline</div>
      </div>
      <div class="risk-label">No data available</div>
    `;
    return card;
  }
  
  const riskLevel = getRiskLevel(nodeData.risk_score);
  card.classList.add(`status-${riskLevel.class}`);
  
  const sensorHtml = createSensorGrid(nodeData);
  
  card.innerHTML = `
    <div class="node-header">
      <div class="node-title">${nodeId}</div>
      <div class="node-status-badge ${riskLevel.class}">${riskLevel.label}</div>
    </div>
    
    <div class="node-risk-score">
      <div class="risk-label">Risk Score</div>
      <div class="risk-value">${nodeData.risk_score.toFixed(1)}%</div>
      <div class="risk-bar">
        <div class="risk-bar-fill" style="width: ${nodeData.risk_score}%"></div>
      </div>
    </div>
    
    <div class="sensor-grid">
      ${sensorHtml}
    </div>
  `;
  
  return card;
}

// Create sensor grid HTML for a node
function createSensorGrid(nodeData) {
  const criticalSensors = [];
  let html = "";
  
  const sensorKeys = [
    "temperature", "humidity", "co_gas_level", "distance_mm",
    "pitch", "roll", "vibration", "roof_load_kg",
    "lora_rssi", "lora_snr", "battery_pct"
  ];
  
  sensorKeys.forEach(key => {
    const meta = SENSOR_METADATA[key];
    const value = nodeData[key];
    
    if (value === undefined || value === null) return;
    
    let displayValue = typeof value === "number" ? value.toFixed(1) : value;
    let severity = "";
    
    // Determine if sensor reading is concerning
    if (key === "temperature" && value > meta.threshold) severity = "warning-level";
    else if (key === "humidity" && value > meta.threshold) severity = "warning-level";
    else if (key === "co_gas_level" && value > meta.threshold) severity = "hazard-level";
    else if (key === "distance_mm" && value < meta.threshold) severity = "hazard-level";
    else if (key === "vibration" && value > meta.threshold) severity = "warning-level";
    else if (key === "roof_load_kg" && value > meta.threshold) severity = "warning-level";
    else if (key === "battery_pct" && value < meta.threshold) severity = "warning-level";
    
    html += `
      <div class="sensor-item ${severity}">
        <span class="sensor-label">${meta.label}</span>
        <span class="sensor-value">${displayValue}<span class="sensor-unit">${meta.unit}</span></span>
      </div>
    `;
  });
  
  return html;
}

// Render alerts section
function renderAlerts() {
  if (!DOM.alertsSection || !DOM.alertsList) return;
  
  const alerts = [];
  Object.values(appState.nodes).forEach(node => {
    if (!node || node.status === "offline") return;
    
    if (node.status === "warning" || node.status === "hazard" || node.status === "critical") {
      alerts.push({
        nodeId: node.node_id,
        status: node.status,
        riskScore: node.risk_score,
        timestamp: new Date(node.lastUpdate),
      });
    }
  });
  
  if (alerts.length === 0) {
    DOM.alertsSection.style.display = "none";
    return;
  }
  
  DOM.alertsSection.style.display = "block";
  DOM.alertsList.innerHTML = "";
  
  alerts.forEach(alert => {
    const alertEl = document.createElement("div");
    alertEl.className = `alert-item ${alert.status}`;
    alertEl.innerHTML = `
      <div class="alert-icon">⚠️</div>
      <div class="alert-content">
        <div class="alert-title">Node ${alert.nodeId} - ${alert.status.toUpperCase()}</div>
        <div class="alert-message">Risk Score: ${alert.riskScore.toFixed(1)}%</div>
        <div class="alert-time">${alert.timestamp.toLocaleTimeString()}</div>
      </div>
    `;
    DOM.alertsList.appendChild(alertEl);
  });
}

// Add event log entry
function addEventLog(nodeId, message) {
  const entry = {
    timestamp: new Date(),
    nodeId: nodeId,
    message: message,
  };
  
  appState.eventLog.unshift(entry); // Add to beginning
  
  // Keep only last 30 entries
  if (appState.eventLog.length > 30) {
    appState.eventLog.pop();
  }
}

// Render event log
function renderEventLog() {
  if (!DOM.logList) return;
  
  DOM.logList.innerHTML = "";
  
  appState.eventLog.forEach(entry => {
    const logEl = document.createElement("div");
    logEl.className = "log-entry";
    logEl.innerHTML = `
      <span class="log-time">${entry.timestamp.toLocaleTimeString()}</span>
      <span class="log-node">${entry.nodeId}</span>
      <span class="log-message">${entry.message}</span>
    `;
    DOM.logList.appendChild(logEl);
  });
}

// Update footer info
function updateFooter() {
  if (DOM.lastUpdate) {
    const time = appState.lastFetchTime ? appState.lastFetchTime.toLocaleTimeString() : "Never";
    DOM.lastUpdate.textContent = `Last Update: ${time}`;
  }
  
  if (DOM.apiStatus) {
    DOM.apiStatus.textContent = 
      appState.connectionStatus === "connected" ? "✓ Connected" :
      appState.connectionStatus === "retrying" ? "↻ Retrying" : "✗ Offline";
  }
}

// Check if any node is in CRITICAL state and show evacuation banner
function checkCriticalState() {
  const hasCritical = Object.values(appState.nodes).some(
    node => node && node.status === "critical"
  );
  
  if (DOM.evacBanner) {
    if (hasCritical) {
      DOM.evacBanner.style.display = "flex";
      document.body.classList.add("state-critical");
      addEventLog("SYSTEM", "⚠️ CRITICAL CONDITION DETECTED - EVACUATION ALERT");
    } else {
      DOM.evacBanner.style.display = "none";
      document.body.classList.remove("state-critical");
    }
  }
}

// Start auto-refresh polling
function startAutoRefresh() {
  fetchNodesData();
  const interval = setInterval(() => {
    if (appState.isAutoRefreshing) {
      fetchNodesData();
    }
  }, CONFIG.POLL_INTERVAL_MS);
  
  return interval;
}

// Event listeners for buttons
function setupEventListeners() {
  if (DOM.refreshBtn) {
    DOM.refreshBtn.addEventListener("click", () => {
      fetchNodesData();
    });
  }
  
  if (DOM.autoRefreshBtn) {
    DOM.autoRefreshBtn.addEventListener("click", () => {
      appState.isAutoRefreshing = !appState.isAutoRefreshing;
      DOM.autoRefreshBtn.classList.toggle("active", appState.isAutoRefreshing);
      DOM.autoRefreshBtn.textContent = appState.isAutoRefreshing ? "Auto-Refresh: ON" : "Auto-Refresh: OFF";
    });
    // Initialize button state
    DOM.autoRefreshBtn.classList.toggle("active", appState.isAutoRefreshing);
    DOM.autoRefreshBtn.textContent = appState.isAutoRefreshing ? "Auto-Refresh: ON" : "Auto-Refresh: OFF";
  }
}

// Initialize application
async function init() {
  console.log("Initializing Mine Safety Dashboard...");
  initializeDOMReferences();
  setupEventListeners();
  
  // Initial fetch
  await fetchNodesData();
  
  // Start auto-refresh
  startAutoRefresh();
  
  console.log("Dashboard initialized and polling started");
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
