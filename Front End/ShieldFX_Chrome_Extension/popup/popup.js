// ─── SHIELDFX EXTENSION POPUP SCRIPT ─────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const healthDot = document.getElementById("healthDot");
  const healthText = document.getElementById("healthText");
  const platformText = document.getElementById("activePlatformText");
  const metricBlocked = document.getElementById("metricBlocked");
  const metricWarned = document.getElementById("metricWarned");
  const metricStreak = document.getElementById("metricStreak");
  const metricPassed = document.getElementById("metricPassed");

  const btnTestTilt = document.getElementById("btnTestTilt");
  const btnResetSession = document.getElementById("btnResetSession");
  const btnOpenOptions = document.getElementById("btnOpenOptions");
  const btnOpenSimulator = document.getElementById("btnOpenSimulator");

  // 1. Check Backend ML Health
  chrome.runtime.sendMessage({ type: "CHECK_BACKEND_HEALTH" }, (res) => {
    if (res && res.healthy) {
      healthDot.className = "dot online";
      healthText.textContent = "ML Online";
      healthText.style.color = "#4ade80";
    } else {
      healthDot.className = "dot offline";
      healthText.textContent = "Offline (Local Heuristic)";
      healthText.style.color = "#ef4444";
    }
  });

  // 2. Identify Active Tab Platform
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab && activeTab.url) {
    const url = activeTab.url.toLowerCase();
    if (url.includes("kite.zerodha") || url.includes("zerodha")) {
      platformText.textContent = "Zerodha Kite";
      platformText.style.color = "#38bdf8";
    } else if (url.includes("groww.in")) {
      platformText.textContent = "Groww Terminal";
      platformText.style.color = "#00d09c";
    } else if (url.includes("binance.com")) {
      platformText.textContent = "Binance Exchange";
      platformText.style.color = "#f0b90b";
    } else if (url.includes("upstox")) {
      platformText.textContent = "Upstox Pro";
      platformText.style.color = "#a855f7";
    } else if (url.includes("shieldfx_simulator") || url.includes("temp.html")) {
      platformText.textContent = "ShieldFX Simulator";
      platformText.style.color = "#38bdf8";
    } else {
      platformText.textContent = "Universal Guard Active";
      platformText.style.color = "#94a3b8";
    }
  } else {
    platformText.textContent = "No Active Tab";
  }

  // 3. Load & Render Session Stats
  function renderMetrics(state) {
    if (!state) return;
    metricBlocked.textContent = state.totalBlocked || 0;
    metricWarned.textContent = state.totalWarned || 0;
    metricStreak.textContent = state.lossStreak || 0;
    metricPassed.textContent = state.totalPassed || 0;
  }

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (data) => {
    if (data && data.state) {
      renderMetrics(data.state);
    }
  });

  // 4. Test Demo Revenge Block on Active Tab
  btnTestTilt.addEventListener("click", () => {
    if (!activeTab || !activeTab.id) return;

    chrome.tabs.sendMessage(
      activeTab.id,
      {
        type: "COOLDOWN_STARTED",
        payload: {
          cooldownUntil: Date.now() + 60000,
          reasons: [
            "Position size escalated by 3.0x vs previous trade",
            "Rapid turnaround execution (3.8s after previous order)",
            "Active loss streak (3 consecutive losses)",
            "Recent drawdown exceeding threshold (-₹5,000.00)"
          ]
        }
      },
      () => {
        // Increment blocked stat
        chrome.runtime.sendMessage({ type: "GET_STATE" }, (data) => {
          if (data && data.state) {
            data.state.totalBlocked = (data.state.totalBlocked || 0) + 1;
            renderMetrics(data.state);
          }
        });
        window.close(); // Close popup to let user see overlay
      }
    );
  });

  // 5. Reset Session Metrics
  btnResetSession.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESET_SESSION" }, (res) => {
      if (res && res.state) {
        renderMetrics(res.state);
      }
    });
  });

  // 6. Settings / Options
  btnOpenOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // 7. Open Simulator
  btnOpenSimulator.addEventListener("click", () => {
    const simUrl = chrome.runtime.getURL("simulator.html");
    chrome.tabs.create({ url: simUrl });
  });
});
