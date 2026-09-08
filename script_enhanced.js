/* ============================================================
   MINE SAFETY DASHBOARD - ENHANCED VERSION
   Combines modern UI with advanced mine map & analytics
   ============================================================ */

const CONFIG = {
  API_URL: "http://127.0.0.1:8000/api/nodes/latest",
  POLL_INTERVAL_MS: 4000,
  OFFLINE_TIMEOUT_MS: 30000,
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
  eventLog: [],
  selectedNodeId: null,
  isAutoRefreshing: true,
  audioEnabled: true,
  connectionStatus: "disconnected",
  lastFetchTime: null,
  audioContext: null,
  oscillator: null,
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
  nodeList: null,
  mapSvg: null,
  nodeDetailsContainer: null,
  alertsSection: null,
  alertsList: null,
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
  DOM.nodeList = document.getElementById("nodeList");
  DOM.mapSvg = document.getElementById("mapSvg");
  DOM.nodeDetailsContainer = document.getElementById("nodeDetailsContainer");
  DOM.alertsSection = document.getElementById("alertsSection");
  DOM.alertsList = document.getElementById("alertsList");
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

// Update clock
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-IN", { hour12: false });
  if (DOM.clock) DOM.clock.textContent = time;
}
setInterval(updateClock, 1000);
updateClock();

// Get risk level from score
function getRiskLevel(riskScore) {
  for (let level of [RISK_LEVELS.CRITICAL, RISK_LEVELS.HAZARD, RISK_LEVELS.WARNING]) {
    if (riskScore >= level.min) return level;
  }
  return RISK_LEVELS.NORMAL;
}

// Set connection status
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

// Fetch data from backend
async function fetchNodesData() {
  try {
    setConnectionStatus("retrying");
    const response = await fetch(CONFIG.API_URL);
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

// Update nodes data
function updateNodesData(apiData) {
  const now = Date.now();
  apiData.forEach(node => {
    const nodeId = node.node_id;
    const riskLevel = getRiskLevel(node.risk_score);
    
    appState.nodes[nodeId] = {
      ...node,
      lastUpdate: now,
      status: riskLevel.class,
    };
  });
  
  render();
}

// Mark all as offline
function markNodesOffline() {
  Object.keys(appState.nodes).forEach(id => {
    if (appState.nodes[id]) {
      appState.nodes[id].status = "offline";
    }
  });
  render();
}

// Render everything
function render() {
  updateStats();
  renderNodeList();
  renderMap();
  renderSelectedNodeDetails();
  renderAlerts();
  renderEventLog();
  updateFooter();
  checkCriticalState();
}

// Update statistics
function updateStats() {
  let normal = 0, warning = 0, hazard = 0, critical = 0, offline = 0;
  
  SENSOR_NODES.forEach(id => {
    const node = appState.nodes[id];
    if (!node || node.status === "offline") offline++;
    else if (node.status === "critical") critical++;
    else if (node.status === "hazard") hazard++;
    else if (node.status === "warning") warning++;
    else normal++;
  });
  
  if (DOM.totalNodes) DOM.totalNodes.textContent = SENSOR_NODES.length;
  if (DOM.normalCount) DOM.normalCount.textContent = normal;
  if (DOM.warningCount) DOM.warningCount.textContent = warning;
  if (DOM.hazardCount) DOM.hazardCount.textContent = hazard;
  if (DOM.criticalCount) DOM.criticalCount.textContent = critical;
  if (DOM.offlineCount) DOM.offlineCount.textContent = offline;
}

// Render node list
function renderNodeList() {
  if (!DOM.nodeList) return;
  DOM.nodeList.innerHTML = "";
  
  SENSOR_NODES.forEach(nodeId => {
    const node = appState.nodes[nodeId];
    const item = document.createElement("div");
    item.className = "node-list-item";
    if (node?.status === "offline") item.classList.add("offline");
    if (appState.selectedNodeId === nodeId) item.classList.add("selected");
    
    const riskScore = node ? node.risk_score.toFixed(0) : "—";
    const statusLabel = node ? node.status.toUpperCase() : "OFFLINE";
    
    item.innerHTML = `
      <div class="node-status-dot" style="background: ${getStatusColor(node?.status || "offline")}"></div>
      <div class="node-list-info">
        <div class="node-list-name">${nodeId}</div>
        <div class="node-list-risk">${riskScore}% • ${statusLabel}</div>
      </div>
    `;
    
    item.addEventListener("click", () => selectNode(nodeId));
    DOM.nodeList.appendChild(item);
  });
}

// Select node
function selectNode(nodeId) {
  appState.selectedNodeId = nodeId;
  render();
}

// Render mine map
function renderMap() {
  if (!DOM.mapSvg) return;
  
  const edges = DOM.mapSvg.querySelector("#edges");
  const nodes = DOM.mapSvg.querySelector("#nodes");
  const labels = DOM.mapSvg.querySelector("#labels");
  
  edges.innerHTML = "";
  nodes.innerHTML = "";
  labels.innerHTML = "";
  
  // Draw edges
  GRAPH_EDGES.forEach(([a, b]) => {
    const nodeA = MINE_GRAPH[a];
    const nodeB = MINE_GRAPH[b];
    if (!nodeA || !nodeB) return;
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", nodeA.x);
    line.setAttribute("y1", nodeA.y);
    line.setAttribute("x2", nodeB.x);
    line.setAttribute("y2", nodeB.y);
    line.setAttribute("class", "tunnel-edge");
    
    // Color based on worst status along edge
    const statusA = appState.nodes[a]?.status || "offline";
    const statusB = appState.nodes[b]?.status || "offline";
    const worstStatus = getWorstStatus(statusA, statusB);
    if (worstStatus !== "normal") line.classList.add(worstStatus);
    
    edges.appendChild(line);
  });
  
  // Draw nodes
  Object.entries(MINE_GRAPH).forEach(([id, pos]) => {
    if (pos.endpoint) {
      // Endpoint
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "14");
      circle.setAttribute("class", "map-endpoint-circle");
      nodes.appendChild(circle);
    } else {
      // Sensor node
      const node = appState.nodes[id];
      const status = node?.status || "offline";
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", "16");
      circle.setAttribute("class", `map-node-circle ${status}`);
      if (appState.selectedNodeId === id) circle.classList.add("selected");
      
      circle.addEventListener("click", () => selectNode(id));
      nodes.appendChild(circle);
    }
    
    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y);
    label.setAttribute("dy", pos.endpoint ? "-20" : "4");
    label.setAttribute("class", pos.endpoint ? "map-endpoint-label" : "map-node-label");
    label.textContent = pos.label;
    labels.appendChild(label);
  });
}

// Get status color
function getStatusColor(status) {
  const colors = {
    normal: "#10b981",
    warning: "#f59e0b",
    hazard: "#ef4444",
    critical: "#dc2626",
    offline: "#6b7280",
  };
  return colors[status] || "#6b7280";
}

// Get worst status
function getWorstStatus(s1, s2) {
  const priority = { critical: 4, hazard: 3, warning: 2, offline: 1, normal: 0 };
  return priority[s1] > priority[s2] ? s1 : s2;
}

// Render selected node details
function renderSelectedNodeDetails() {
  if (!DOM.nodeDetailsContainer) return;
  
  if (!appState.selectedNodeId) {
    DOM.nodeDetailsContainer.innerHTML = `
      <p style="color: var(--text-muted); text-align: center; margin-top: 40px;">
        Select a node to view details
      </p>
    `;
    return;
  }
  
  const node = appState.nodes[appState.selectedNodeId];
  if (!node || node.status === "offline") {
    DOM.nodeDetailsContainer.innerHTML = `
      <p style="color: var(--text-muted);">No data available for this node</p>
    `;
    return;
  }
  
  const riskLevel = getRiskLevel(node.risk_score);
  
  let html = `
    <div class="node-detail-header">
      <div class="node-detail-title">${appState.selectedNodeId}</div>
      <div class="node-detail-status" style="background: ${getStatusColor(riskLevel.class)}20; color: ${getStatusColor(riskLevel.class)}">
        ${riskLevel.label}
      </div>
    </div>
  `;
  
  // Gauge
  const gaugeFill = (node.risk_score / 100) * 360;
  html += `
    <div class="gauge-container">
      <svg class="gauge-svg" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
        <path class="gauge-track" d="M 30,100 A 70,70 0 0,1 170,100"></path>
        <path class="gauge-fill" d="M 30,100 A 70,70 0 0,1 170,100" 
              style="stroke-dasharray: ${gaugeFill}, 360; stroke: ${getStatusColor(riskLevel.class)}"></path>
        <text class="gauge-label" x="100" y="75">${node.risk_score.toFixed(1)}%</text>
      </svg>
    </div>
  `;
  
  // Link Quality
  html += `
    <div class="link-quality-section">
      <div class="link-quality-title">Signal & Battery</div>
      <div class="link-row">
        <span>RSSI:</span>
        <span>${node.lora_rssi} dBm</span>
      </div>
      <div class="link-row">
        <span>SNR:</span>
        <span>${node.lora_snr} dB</span>
      </div>
      <div class="link-row">
        <span>Battery:</span>
        <span>${node.battery_pct}%</span>
      </div>
      <div style="margin-top: 8px;">
        <div class="battery-bar">
          <div class="battery-fill" style="width: ${node.battery_pct}%; background: ${node.battery_pct > 50 ? '#10b981' : node.battery_pct > 20 ? '#f59e0b' : '#ef4444'}"></div>
        </div>
      </div>
    </div>
  `;
  
  // Telemetry
  html += `<div class="telemetry-grid">`;
  const sensorKeys = ["temperature", "humidity", "co_gas_level", "distance_mm", "pitch", "roll", "vibration", "roof_load_kg"];
  sensorKeys.forEach(key => {
    const meta = SENSOR_METADATA[key];
    const value = node[key];
    if (value === undefined) return;
    
    html += `
      <div class="telem-card">
        <div class="telem-label">${meta.label}</div>
        <div class="telem-value">${typeof value === "number" ? value.toFixed(1) : value}<small>${meta.unit}</small></div>
      </div>
    `;
  });
  html += `</div>`;
  
  DOM.nodeDetailsContainer.innerHTML = html;
}

// Render alerts
function renderAlerts() {
  if (!DOM.alertsSection || !DOM.alertsList) return;
  
  const alerts = [];
  Object.entries(appState.nodes).forEach(([nodeId, node]) => {
    if (!node || node.status === "offline" || node.status === "normal") return;
    alerts.push({ nodeId, ...node });
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
        <div class="alert-message">Risk Score: ${alert.risk_score.toFixed(1)}%</div>
        <div class="alert-time">${new Date(alert.lastUpdate).toLocaleTimeString()}</div>
      </div>
    `;
    DOM.alertsList.appendChild(alertEl);
    
    // Trigger alert if necessary
    triggerAlertEngine(alert.node_id || alert.nodeId, alert.risk_score, alert.anomaly_flag || alert.status.toUpperCase());
  });
}

// Alert engine integration
function triggerAlertEngine(nodeId, riskScore, severity) {
  const timestamp = new Date().toLocaleTimeString();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚨 [ALERT ENGINE] - ${timestamp}`);
  console.log(`Node: ${nodeId} | Risk: ${riskScore}% | Severity: ${severity}`);
  console.log('='.repeat(60));
  
  if (severity === "CRITICAL") {
    console.log("🔴 [TIER 3 PROTOCOL] CATASTROPHIC HAZARD DETECTED!");
    console.log("   -> Initiating MINE-WIDE EVACUATION ALARM");
    console.log(`   -> Dispatching SMS alerts to supervisors`);
    playAlarmSound(3); // Intense alarm
    addEventLog("SYSTEM", `🚨 CRITICAL ALERT: Node ${nodeId} requires immediate evacuation!`);
  } else if (severity === "HAZARD") {
    console.log("🟠 [TIER 2 PROTOCOL] SEVERE HAZARD SIGNATURE");
    console.log("   -> Activating local buzzer on ESP32");
    console.log(`   -> Dispatching SMS to supervisor`);
    playAlarmSound(2); // Medium alarm
    addEventLog("SYSTEM", `⚠️ HAZARD: Node ${nodeId} - immediate attention required`);
  } else if (severity === "WARNING") {
    console.log("🟡 [TIER 1 PROTOCOL] ELEVATED ENVIRONMENTAL PARAMETERS");
    console.log("   -> Logging warning to dashboard");
    playAlarmSound(1); // Gentle beep
    addEventLog("SYSTEM", `⚠️ WARNING: Node ${nodeId} - elevated parameters detected`);
  }
}

// Play alarm sound
function playAlarmSound(intensity) {
  if (!appState.audioEnabled || !DOM.audioToggle) return;
  
  try {
    if (!appState.audioContext) {
      appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const ctx = appState.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Different frequencies and patterns based on intensity
    if (intensity === 1) {
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (intensity === 2) {
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (intensity === 3) {
      // Alternating high-low pattern
      for (let i = 0; i < 3; i++) {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc2.frequency.value = i % 2 === 0 ? 1200 : 800;
        gain2.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.15);
        osc2.start(ctx.currentTime + i * 0.2);
        osc2.stop(ctx.currentTime + i * 0.2 + 0.15);
      }
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// Add event log
function addEventLog(nodeId, message) {
  const entry = {
    timestamp: new Date(),
    nodeId: nodeId,
    message: message,
  };
  appState.eventLog.unshift(entry);
  if (appState.eventLog.length > 30) appState.eventLog.pop();
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

// Update footer
function updateFooter() {
  if (DOM.lastUpdate) {
    const time = appState.lastFetchTime ? appState.lastFetchTime.toLocaleTimeString() : "Never";
    DOM.lastUpdate.textContent = time;
  }
  if (DOM.apiStatus) {
    DOM.apiStatus.textContent = 
      appState.connectionStatus === "connected" ? "✓ Connected" :
      appState.connectionStatus === "retrying" ? "↻ Retrying" : "✗ Offline";
  }
}

// Check critical state
function checkCriticalState() {
  const hasCritical = Object.values(appState.nodes).some(
    node => node && node.status === "critical"
  );
  if (DOM.evacBanner) {
    DOM.evacBanner.style.display = hasCritical ? "flex" : "none";
    if (hasCritical) document.body.classList.add("state-critical");
    else document.body.classList.remove("state-critical");
  }
}

// Route planning algorithm (BFS)
function planRoute(destination) {
  const start = "ENTRANCE";
  if (destination === start) return { path: [start], distance: 0 };
  
  const queue = [[start]];
  const visited = new Set([start]);
  
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    
    if (current === destination) {
      return { path, distance: path.length - 1 };
    }
    
    if (adjacency[current]) {
      adjacency[current].forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      });
    }
  }
  
  return null;
}

// Setup event listeners
function setupEventListeners() {
  if (DOM.refreshBtn) {
    DOM.refreshBtn.addEventListener("click", () => fetchNodesData());
  }
  
  if (DOM.autoRefreshBtn) {
    DOM.autoRefreshBtn.addEventListener("click", () => {
      appState.isAutoRefreshing = !appState.isAutoRefreshing;
      DOM.autoRefreshBtn.textContent = appState.isAutoRefreshing ? 
        "⏱️ Auto-Refresh: ON" : "⏱️ Auto-Refresh: OFF";
    });
  }
  
  if (DOM.audioToggle) {
    DOM.audioToggle.addEventListener("click", () => {
      appState.audioEnabled = !appState.audioEnabled;
      DOM.audioToggle.textContent = appState.audioEnabled ? 
        "🔊 Sound: ON" : "🔇 Sound: OFF";
    });
  }
  
  if (DOM.routeBtn) {
    DOM.routeBtn.addEventListener("click", () => {
      const destination = DOM.routeTo.value;
      const route = planRoute(destination);
      
      if (route) {
        const worstStatus = route.path
          .filter(id => appState.nodes[id])
          .map(id => appState.nodes[id].status)
          .sort((a, b) => {
            const priority = { critical: 4, hazard: 3, warning: 2, offline: 1, normal: 0 };
            return priority[b] - priority[a];
          })[0];
        
        const statusText = worstStatus === "critical" ? "ROUTE BLOCKED - CRITICAL" :
                          worstStatus === "hazard" ? "DANGEROUS ROUTE" :
                          worstStatus === "warning" ? "CAUTION ADVISED" : "SAFE ROUTE";
        
        const routeClass = worstStatus === "critical" || worstStatus === "hazard" ? "blocked" :
                          worstStatus === "warning" ? "warning" : "safe";
        
        DOM.routeResult.innerHTML = `
          <strong>${statusText}</strong><br>
          Path: ${route.path.join(" → ")} (${route.distance} segments)
        `;
        DOM.routeResult.className = `route-result ${routeClass}`;
      }
    });
  }
}

// Start auto-refresh
function startAutoRefresh() {
  fetchNodesData();
  setInterval(() => {
    if (appState.isAutoRefreshing) fetchNodesData();
  }, CONFIG.POLL_INTERVAL_MS);
}

// Initialize
async function init() {
  console.log("🚀 Initializing Mine Safety Dashboard (Enhanced)...");
  initializeDOMReferences();
  setupEventListeners();
  
  await fetchNodesData();
  startAutoRefresh();
  
  console.log("✓ Dashboard initialized and polling started");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
