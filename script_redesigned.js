/* ============================================================
   MINE SAFETY DASHBOARD - REDESIGNED JAVASCRIPT
   Sensor-data-first with vibration analysis & engineer alerts
   ============================================================ */

const CONFIG = {
  API_URL: "http://127.0.0.1:8000/api/nodes/latest",
  POST_API: "http://127.0.0.1:8000/api/sensor-data",
  POLL_INTERVAL_MS: 4000,
  OFFLINE_TIMEOUT_MS: 30000,
  VIBRATION_HISTORY_SIZE: 30, // Store last 30 vibration readings
};

const RISK_LEVELS = {
  NORMAL: { min: 0, max: 39, label: "NORMAL", class: "normal" },
  WARNING: { min: 40, max: 69, label: "WARNING", class: "warning" },
  HAZARD: { min: 70, max: 89, label: "HAZARD", class: "hazard" },
  CRITICAL: { min: 90, max: 100, label: "CRITICAL", class: "critical" },
};

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

// Mine tunnel graph structure
const MINE_GRAPH = {
  ENTRANCE: { x: 50, y: 210, label: "Entrance", endpoint: true },
  A1: { x: 220, y: 100, label: "A1", name: "Tunnel A · Post 1" },
  A2: { x: 420, y: 100, label: "A2", name: "Tunnel A · Post 2" },
  A3: { x: 620, y: 100, label: "A3", name: "Tunnel A · Post 3" },
  B1: { x: 220, y: 320, label: "B1", name: "Tunnel B · Post 1" },
  B2: { x: 420, y: 320, label: "B2", name: "Tunnel B · Post 2" },
  B3: { x: 620, y: 320, label: "B3", name: "Tunnel B · Post 3" },
  FACE: { x: 750, y: 210, label: "Face", endpoint: true, name: "Coal Face" },
};

const GRAPH_EDGES = [
  ["ENTRANCE", "A1"], ["ENTRANCE", "B1"],
  ["A1", "A2"], ["A2", "A3"], ["A3", "FACE"],
  ["B1", "B2"], ["B2", "B3"], ["B3", "FACE"],
  ["A1", "B1"], ["A2", "B2"],
];

const SENSOR_NODES = ["A1", "A2", "A3", "B1", "B2", "B3", "FACE"];
const TRAVERSABLE_NODES = ["ENTRANCE", ...SENSOR_NODES];

// Build adjacency map
const adjacency = {};
TRAVERSABLE_NODES.forEach(id => adjacency[id] = []);
GRAPH_EDGES.forEach(([a, b]) => {
  adjacency[a].push(b);
  adjacency[b].push(a);
});

let appState = {
  nodes: {},
  alerts: [],
  alertHistory: [],
  eventLog: [],
  selectedNodeId: "A1",
  isAutoRefreshing: true,
  audioEnabled: true,
  connectionStatus: "disconnected",
  lastFetchTime: null,
  vibrationHistory: {}, // { nodeId: [vibrations...] }
  audioContext: null,
};

// DOM references
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
  nodeSelector: null,
  selectedNodeTitle: null,
  mapSvg: null,
  riskBanner: null,
  riskCircle: null,
  riskValue: null,
  riskLabel: null,
  readingTime: null,
  predictionsList: null,
  telemetryGrid: null,
  vibrationChart: null,
  manualAlertBtn: null,
  supervisorPhone: null,
  chiefPhone: null,
  alertsList: null,
  activeAlerts: null,
  alertsBannerList: null,
  logList: null,
  lastUpdate: null,
  apiStatus: null,
  refreshBtn: null,
  autoRefreshBtn: null,
  audioToggle: null,
  routeResult: null,
  routeBtn: null,
  routeTo: null,
  evacBanner: null,
};

// ============================================================
// INITIALIZATION
// ============================================================

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
  DOM.nodeSelector = document.getElementById("nodeSelector");
  DOM.selectedNodeTitle = document.getElementById("selectedNodeTitle");
  DOM.mapSvg = document.getElementById("mapSvg");
  DOM.riskBanner = document.getElementById("riskBanner");
  DOM.riskCircle = document.getElementById("riskCircle");
  DOM.riskValue = document.getElementById("riskValue");
  DOM.riskLabel = document.getElementById("riskLabel");
  DOM.readingTime = document.getElementById("readingTime");
  DOM.predictionsList = document.getElementById("predictionsList");
  DOM.telemetryGrid = document.getElementById("telemetryGrid");
  DOM.vibrationChart = document.getElementById("vibrationChart");
  DOM.manualAlertBtn = document.getElementById("manualAlertBtn");
  DOM.supervisorPhone = document.getElementById("supervisorPhone");
  DOM.chiefPhone = document.getElementById("chiefPhone");
  DOM.alertsList = document.getElementById("alertsList");
  DOM.activeAlerts = document.getElementById("activeAlerts");
  DOM.alertsBannerList = document.getElementById("alertsBannerList");
  DOM.logList = document.getElementById("logList");
  DOM.lastUpdate = document.getElementById("lastUpdate");
  DOM.apiStatus = document.getElementById("apiStatus");
  DOM.refreshBtn = document.getElementById("refreshBtn");
  DOM.autoRefreshBtn = document.getElementById("autoRefreshBtn");
  DOM.audioToggle = document.getElementById("audioToggle");
  DOM.routeResult = document.getElementById("route-result");
  DOM.routeBtn = document.getElementById("route-btn");
  DOM.routeTo = document.getElementById("route-to");
  DOM.evacBanner = document.getElementById("evacBanner");
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  DOM.clock.textContent = `${hours}:${minutes}:${seconds}`;
}

function getRiskLevel(riskScore) {
  const score = Math.min(100, Math.max(0, riskScore));
  if (score >= RISK_LEVELS.CRITICAL.min) return RISK_LEVELS.CRITICAL;
  if (score >= RISK_LEVELS.HAZARD.min) return RISK_LEVELS.HAZARD;
  if (score >= RISK_LEVELS.WARNING.min) return RISK_LEVELS.WARNING;
  return RISK_LEVELS.NORMAL;
}

function getStatusColor(riskLevel) {
  const colorMap = {
    normal: "#10b981",
    warning: "#f59e0b",
    hazard: "#ef6e35",
    critical: "#dc2626",
  };
  return colorMap[riskLevel.class] || "#666";
}

function setConnectionStatus(status) {
  appState.connectionStatus = status;
  const dot = DOM.connectionDot;
  const text = DOM.connectionStatus;
  
  dot.classList.remove("connected", "retrying", "disconnected");
  
  if (status === "connected") {
    dot.classList.add("connected");
    text.textContent = "Connected";
  } else if (status === "retrying") {
    dot.classList.add("retrying");
    text.textContent = "Retrying...";
  } else {
    dot.classList.add("disconnected");
    text.textContent = "Disconnected";
  }
}

function addEventLog(nodeId, message) {
  const timestamp = new Date().toLocaleTimeString();
  appState.eventLog.unshift({ nodeId, message, timestamp });
  if (appState.eventLog.length > 30) appState.eventLog.pop();
}

// ============================================================
// API FETCH
// ============================================================

async function fetchNodesData() {
  try {
    setConnectionStatus("retrying");
    const response = await fetch(CONFIG.API_URL);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    setConnectionStatus("connected");
    updateNodesData(data);
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    setConnectionStatus("disconnected");
    markNodesOffline();
  }
}

function updateNodesData(apiData) {
  appState.lastFetchTime = new Date();
  
  apiData.forEach(node => {
    const nodeId = node.node_id;
    const riskLevel = getRiskLevel(node.risk_score);
    
    appState.nodes[nodeId] = {
      ...node,
      status: riskLevel.class,
      riskLevel: riskLevel,
    };
    
    // Store vibration history
    if (!appState.vibrationHistory[nodeId]) {
      appState.vibrationHistory[nodeId] = [];
    }
    appState.vibrationHistory[nodeId].push(node.vibration || 0);
    if (appState.vibrationHistory[nodeId].length > CONFIG.VIBRATION_HISTORY_SIZE) {
      appState.vibrationHistory[nodeId].shift();
    }
  });
  
  render();
}

function markNodesOffline() {
  SENSOR_NODES.forEach(nodeId => {
    appState.nodes[nodeId] = {
      ...appState.nodes[nodeId],
      status: "offline",
      riskLevel: RISK_LEVELS.NORMAL,
    };
  });
  render();
}

// ============================================================
// RENDERING
// ============================================================

function render() {
  updateStats();
  renderNodeSelector();
  renderSelectedNodeDetails();
  renderMap();
  renderAlerts();
  renderEventLog();
  updateFooter();
  checkCriticalState();
}

function updateStats() {
  let normal = 0, warning = 0, hazard = 0, critical = 0, offline = 0;
  
  SENSOR_NODES.forEach(nodeId => {
    const node = appState.nodes[nodeId];
    if (!node) return;
    
    if (node.status === "offline") offline++;
    else if (node.status === "normal") normal++;
    else if (node.status === "warning") warning++;
    else if (node.status === "hazard") hazard++;
    else if (node.status === "critical") critical++;
  });
  
  DOM.totalNodes.textContent = SENSOR_NODES.length;
  DOM.normalCount.textContent = normal;
  DOM.warningCount.textContent = warning;
  DOM.hazardCount.textContent = hazard;
  DOM.criticalCount.textContent = critical;
  DOM.offlineCount.textContent = offline;
}

function renderNodeSelector() {
  DOM.nodeSelector.innerHTML = "";
  
  SENSOR_NODES.forEach(nodeId => {
    const node = appState.nodes[nodeId] || {};
    const isActive = nodeId === appState.selectedNodeId;
    
    const tab = document.createElement("div");
    tab.className = `node-tab ${isActive ? "active" : ""}`;
    tab.textContent = nodeId;
    tab.style.borderLeftColor = getStatusColor(node.riskLevel || RISK_LEVELS.NORMAL);
    tab.onclick = () => selectNode(nodeId);
    
    DOM.nodeSelector.appendChild(tab);
  });
}

function selectNode(nodeId) {
  appState.selectedNodeId = nodeId;
  addEventLog(nodeId, `Node selected`);
  render();
}

function renderSelectedNodeDetails() {
  const node = appState.nodes[appState.selectedNodeId];
  
  if (!node) {
    DOM.selectedNodeTitle.textContent = "Node Details";
    DOM.telemetryGrid.innerHTML = "<p>No data available</p>";
    return;
  }
  
  DOM.selectedNodeTitle.textContent = `${appState.selectedNodeId} - ${node.node_name || "Sensor Node"}`;
  
  // Update Risk Banner
  const riskLevel = node.riskLevel || RISK_LEVELS.NORMAL;
  DOM.riskValue.textContent = Math.round(node.risk_score || 0);
  DOM.riskLabel.textContent = riskLevel.label;
  DOM.riskLabel.style.color = getStatusColor(riskLevel);
  DOM.readingTime.textContent = new Date(node.timestamp).toLocaleTimeString();
  
  // Update risk circle gradient
  const percentage = (Math.round(node.risk_score || 0) / 100) * 360;
  DOM.riskCircle.className = `risk-circle ${riskLevel.class}`;
  DOM.riskCircle.style.background = `conic-gradient(${getStatusColor(riskLevel)} ${percentage}deg, #333 ${percentage}deg)`;
  
  // Render Predictions
  renderPredictions(node);
  
  // Render Telemetry
  renderTelemetry(node);
  
  // Render Vibration Graph
  renderVibrationGraph(appState.selectedNodeId);
}

function renderPredictions(node) {
  const predictionText = node.prediction || "No predictions available";
  const predictions = predictionText.split(" | ").filter(p => p.trim());
  
  DOM.predictionsList.innerHTML = "";
  
  if (predictions.length === 0) {
    DOM.predictionsList.innerHTML = "<p style='color: var(--text-muted);'>No warnings</p>";
    return;
  }
  
  predictions.forEach(pred => {
    if (pred.trim()) {
      const div = document.createElement("div");
      div.className = "prediction-item";
      div.textContent = "• " + pred.trim();
      DOM.predictionsList.appendChild(div);
    }
  });
}

function renderTelemetry(node) {
  DOM.telemetryGrid.innerHTML = "";
  
  const sensorOrder = [
    "temperature", "humidity", "co_gas_level", "distance_mm",
    "pitch", "roll", "vibration", "roof_load_kg",
    "lora_rssi", "lora_snr", "battery_pct"
  ];
  
  sensorOrder.forEach(key => {
    const meta = SENSOR_METADATA[key];
    const value = node[key];
    const thresholdExceeded = value > meta.threshold;
    
    const card = document.createElement("div");
    card.className = `telemetry-card ${thresholdExceeded ? "threshold-exceeded" : ""}`;
    card.innerHTML = `
      <div class="telemetry-label">${meta.label}</div>
      <div class="telemetry-value">${typeof value === "number" ? value.toFixed(1) : value}</div>
      <div class="telemetry-unit">${meta.unit}</div>
    `;
    
    DOM.telemetryGrid.appendChild(card);
  });
}

function renderVibrationGraph(nodeId) {
  const canvas = DOM.vibrationChart;
  const ctx = canvas.getContext("2d");
  const history = appState.vibrationHistory[nodeId] || [];
  
  // Set canvas size
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  const width = canvas.width;
  const height = canvas.height;
  const padding = 10;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  
  // Clear canvas
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.fillRect(0, 0, width, height);
  
  // Draw threshold line (red zone)
  const thresholdY = height - padding - (SENSOR_METADATA.vibration.threshold / 2) * (graphHeight / 2);
  ctx.strokeStyle = "rgba(220, 38, 38, 0.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding, thresholdY);
  ctx.lineTo(width - padding, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw graph line
  if (history.length > 1) {
    ctx.strokeStyle = "rgba(6, 182, 212, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    history.forEach((value, index) => {
      const x = padding + (index / (history.length - 1)) * graphWidth;
      const y = height - padding - (value / 2) * (graphHeight / 2);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  }
  
  // Draw points
  ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
  history.forEach((value, index) => {
    const x = padding + (index / (history.length - 1 || 1)) * graphWidth;
    const y = height - padding - (value / 2) * (graphHeight / 2);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  });
}

function renderMap() {
  const svg = DOM.mapSvg;
  svg.innerHTML = "";
  
  const edges = svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));
  const nodes = svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));
  const labels = svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));
  
  // Draw edges
  GRAPH_EDGES.forEach(([from, to]) => {
    const p1 = MINE_GRAPH[from];
    const p2 = MINE_GRAPH[to];
    
    let worst = "normal";
    if (from !== "ENTRANCE") {
      const node1 = appState.nodes[from];
      if (node1 && node1.status) worst = node1.status;
    }
    if (to !== "ENTRANCE" && to !== "FACE") {
      const node2 = appState.nodes[to];
      if (node2 && node2.status) {
        if (node2.status === "critical" || worst === "critical") worst = "critical";
        else if (node2.status === "hazard" || worst === "hazard") worst = "hazard";
        else if (node2.status === "warning" || worst === "warning") worst = "warning";
      }
    }
    
    const colorMap = {
      normal: "#10b981",
      warning: "#f59e0b",
      hazard: "#ef6e35",
      critical: "#dc2626",
      offline: "#4b5563",
    };
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
    line.setAttribute("stroke", colorMap[worst] || "#666");
    line.setAttribute("stroke-width", "3");
    edges.appendChild(line);
  });
  
  // Draw nodes
  SENSOR_NODES.forEach(nodeId => {
    const nodeData = MINE_GRAPH[nodeId];
    const node = appState.nodes[nodeId];
    const status = node ? node.status : "offline";
    
    const colorMap = {
      normal: "#10b981",
      warning: "#f59e0b",
      hazard: "#ef6e35",
      critical: "#dc2626",
      offline: "#4b5563",
    };
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", nodeData.x);
    circle.setAttribute("cy", nodeData.y);
    circle.setAttribute("r", appState.selectedNodeId === nodeId ? "20" : "15");
    circle.setAttribute("fill", colorMap[status]);
    circle.setAttribute("opacity", "0.8");
    circle.style.cursor = "pointer";
    
    if (status === "critical") {
      circle.style.animation = "pulse 1s infinite";
    }
    
    circle.onclick = () => selectNode(nodeId);
    nodes.appendChild(circle);
    
    // Add label
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", nodeData.x);
    text.setAttribute("y", nodeData.y + 4);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "white");
    text.setAttribute("font-size", "12");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("pointer-events", "none");
    text.textContent = nodeId;
    labels.appendChild(text);
  });
}

function renderAlerts() {
  const alertNodes = SENSOR_NODES.filter(id => {
    const node = appState.nodes[id];
    return node && (node.status === "warning" || node.status === "hazard" || node.status === "critical");
  });
  
  if (alertNodes.length === 0) {
    DOM.activeAlerts.style.display = "none";
    DOM.alertsList.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>No alerts</p>";
    return;
  }
  
  DOM.activeAlerts.style.display = "block";
  DOM.alertsBannerList.innerHTML = "";
  
  alertNodes.forEach(nodeId => {
    const node = appState.nodes[nodeId];
    
    const item = document.createElement("div");
    item.className = `alert-banner-item`;
    item.innerHTML = `<strong>${nodeId}:</strong> ${node.prediction || "Alert triggered"}`;
    DOM.alertsBannerList.appendChild(item);
    
    // Add to history
    const timestamp = new Date().toLocaleTimeString();
    if (!appState.alertHistory.find(a => a.nodeId === nodeId && a.time === timestamp)) {
      appState.alertHistory.unshift({ nodeId, status: node.status, time: timestamp });
      if (appState.alertHistory.length > 10) appState.alertHistory.pop();
      
      playAlarmSound(node.status);
    }
  });
  
  // Render alert history
  DOM.alertsList.innerHTML = "";
  appState.alertHistory.forEach(alert => {
    const item = document.createElement("div");
    item.className = `alert-item ${alert.status}`;
    item.innerHTML = `
      <strong>${alert.nodeId}</strong>
      <span class="alert-time">${alert.time}</span>
    `;
    DOM.alertsList.appendChild(item);
  });
}

function renderEventLog() {
  DOM.logList.innerHTML = "";
  
  appState.eventLog.slice(0, 8).forEach(entry => {
    const item = document.createElement("div");
    item.className = "log-entry";
    item.innerHTML = `
      <span class="log-time">${entry.timestamp}</span>
      <span class="log-node">${entry.nodeId}</span>:
      ${entry.message}
    `;
    DOM.logList.appendChild(item);
  });
}

function updateFooter() {
  if (appState.lastFetchTime) {
    DOM.lastUpdate.textContent = appState.lastFetchTime.toLocaleTimeString();
  }
  DOM.apiStatus.textContent = appState.connectionStatus === "connected" ? "Connected" : "Disconnected";
}

function checkCriticalState() {
  const hasCritical = SENSOR_NODES.some(id => {
    const node = appState.nodes[id];
    return node && node.status === "critical";
  });
  
  if (hasCritical) {
    document.body.classList.add("state-critical");
    DOM.evacBanner.style.display = "flex";
  } else {
    document.body.classList.remove("state-critical");
    DOM.evacBanner.style.display = "none";
  }
}

// ============================================================
// AUDIO ALERTS
// ============================================================

function playAlarmSound(intensity) {
  if (!appState.audioEnabled) return;
  
  if (!appState.audioContext) {
    appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  const ctx = appState.audioContext;
  const now = ctx.currentTime;
  
  if (intensity === "warning") {
    // Gentle beep
    playTone(ctx, 800, now, 0.3, 0.1);
  } else if (intensity === "hazard") {
    // Medium beep
    playTone(ctx, 1000, now, 0.3, 0.15);
    playTone(ctx, 1000, now + 0.2, 0.3, 0.15);
  } else if (intensity === "critical") {
    // Alternating alarm
    playTone(ctx, 1200, now, 0.3, 0.1);
    playTone(ctx, 800, now + 0.15, 0.3, 0.1);
    playTone(ctx, 1200, now + 0.3, 0.3, 0.1);
  }
}

function playTone(ctx, frequency, startTime, duration, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ============================================================
// MANUAL ALERT TO ENGINEERS
// ============================================================

async function sendManualAlert() {
  const nodeId = appState.selectedNodeId;
  const node = appState.nodes[nodeId];
  
  if (!node) {
    alert("No node selected");
    return;
  }
  
  const message = `MANUAL ALERT from Node ${nodeId}. Risk: ${Math.round(node.risk_score)}%. Status: ${node.status.toUpperCase()}. Prediction: ${node.prediction}`;
  
  try {
    // Simulate sending alert via backend
    const response = await fetch(CONFIG.POST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: nodeId,
        temperature: node.temperature,
        humidity: node.humidity,
        co_gas_level: node.co_gas_level,
        distance_mm: node.distance_mm,
        pitch: node.pitch,
        roll: node.roll,
        vibration: node.vibration,
        roof_load_kg: node.roof_load_kg,
      })
    });
    
    if (response.ok) {
      addEventLog(nodeId, "Manual alert sent to engineers");
      alert("✅ Alert sent to supervisors and engineers!");
      playAlarmSound("critical");
    }
  } catch (error) {
    console.error("Alert send error:", error);
    alert("⚠️ Failed to send alert. Check console.");
  }
}

// ============================================================
// ROUTE PLANNING (BFS)
// ============================================================

function planRoute(destination) {
  const start = "ENTRANCE";
  const queue = [[start]];
  const visited = new Set([start]);
  let foundPath = null;
  
  while (queue.length > 0 && !foundPath) {
    const path = queue.shift();
    const current = path[path.length - 1];
    
    if (current === destination) {
      foundPath = path;
      break;
    }
    
    const neighbors = adjacency[current] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  
  if (!foundPath) return null;
  
  // Assess route danger
  let worstStatus = "normal";
  foundPath.forEach(nodeId => {
    if (nodeId === "ENTRANCE" || nodeId === "FACE") return;
    const node = appState.nodes[nodeId];
    if (node) {
      if (node.status === "critical" || worstStatus === "critical") worstStatus = "critical";
      else if (node.status === "hazard" || worstStatus === "hazard") worstStatus = "hazard";
      else if (node.status === "warning" || worstStatus === "warning") worstStatus = "warning";
    }
  });
  
  const statusMap = {
    normal: "✅ SAFE ROUTE",
    warning: "⚠️ CAUTION ADVISED",
    hazard: "🚫 DANGEROUS",
    critical: "❌ ROUTE BLOCKED",
  };
  
  return {
    path: foundPath,
    distance: foundPath.length - 1,
    status: statusMap[worstStatus],
  };
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners() {
  DOM.refreshBtn.addEventListener("click", fetchNodesData);
  
  DOM.autoRefreshBtn.addEventListener("click", () => {
    appState.isAutoRefreshing = !appState.isAutoRefreshing;
    DOM.autoRefreshBtn.textContent = `⏱️ Auto: ${appState.isAutoRefreshing ? "ON" : "OFF"}`;
  });
  
  DOM.audioToggle.addEventListener("click", () => {
    appState.audioEnabled = !appState.audioEnabled;
    DOM.audioToggle.textContent = `🔊 Sound: ${appState.audioEnabled ? "ON" : "OFF"}`;
  });
  
  DOM.manualAlertBtn.addEventListener("click", sendManualAlert);
  
  DOM.routeBtn.addEventListener("click", () => {
    const destination = DOM.routeTo.value;
    const route = planRoute(destination);
    
    if (route) {
      DOM.routeResult.innerHTML = `
        <strong>${route.status}</strong><br>
        Path: ${route.path.join(" → ")}<br>
        Distance: ${route.distance} segments
      `;
    } else {
      DOM.routeResult.innerHTML = "No route found";
    }
  });
}

// ============================================================
// AUTO REFRESH
// ============================================================

function startAutoRefresh() {
  fetchNodesData();
  setInterval(() => {
    if (appState.isAutoRefreshing) {
      fetchNodesData();
    }
  }, CONFIG.POLL_INTERVAL_MS);
}

// ============================================================
// INITIALIZATION
// ============================================================

function init() {
  initializeDOMReferences();
  updateClock();
  setInterval(updateClock, 1000);
  setupEventListeners();
  startAutoRefresh();
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
