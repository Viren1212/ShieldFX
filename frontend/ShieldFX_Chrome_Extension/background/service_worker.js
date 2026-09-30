// ─── SHIELDFX BACKGROUND SERVICE WORKER ──────────────────────────────────────
const DEFAULT_CONFIG = {
  backendUrl: "http://127.0.0.1:8000",
  cooldownDuration: 60, // seconds
  strictMode: false,
  autoIntercept: true,
  audioAlerts: true
};

const INITIAL_STATE = {
  activeCooldownUntil: null,
  lossStreak: 0,
  lastOrderTime: null,
  lastOrderLot: null,
  lastResolvedPnl: 0,
  totalBlocked: 0,
  totalWarned: 0,
  totalPassed: 0,
  recentTrades: []
};

// Initialize configuration and storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["config", "state"]);
  if (!current.config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
  if (!current.state) {
    await chrome.storage.local.set({ state: INITIAL_STATE });
  }
  updateBadge("ON", "#0284c7");
  console.log("⚡ ShieldFX Background Service Worker Installed");
});

// Update Chrome extension toolbar badge
function updateBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text: text || "" });
    if (color) {
      chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch (e) {
    // Ignore in non-action contexts
  }
}

// ─── ML PREDICTION RELAY ──────────────────────────────────────────────────────
async function handlePredictRisk(features) {
  const { config } = await chrome.storage.local.get("config");
  const backendUrl = (config && config.backendUrl) || "http://127.0.0.1:8000";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${backendUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(features),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      data,
      source: "ML_BACKEND"
    };
  } catch (error) {
    console.warn("⚠️ ShieldFX Backend unreachable, applying heuristic safety fallback:", error.message);
    
    // Heuristic client-side fallback matching backend logic
    let prob = 0.15;
    const reasons = [];

    if (features.lot_size_multiplier >= 2.0) {
      prob += 0.35;
      reasons.push(`Position size escalated by ${features.lot_size_multiplier.toFixed(1)}x`);
    }
    if (features.time_delta_seconds < 10.0) {
      prob += 0.30;
      reasons.push(`Rapid execution (${features.time_delta_seconds.toFixed(1)}s after previous trade)`);
    }
    if (features.loss_streak_count >= 2) {
      prob += 0.25;
      reasons.push(`Active losing streak (${features.loss_streak_count} consecutive losses)`);
    }
    if (features.is_unhedged === 1) {
      prob += 0.10;
      reasons.push("Unhedged / naked directional exposure");
    }
    if (features.recent_pnl_delta < -2000) {
      prob += 0.15;
      reasons.push(`Significant recent drawdown (-₹${Math.abs(features.recent_pnl_delta).toFixed(2)})`);
    }

    prob = Math.min(Math.max(prob, 0.05), 0.99);

    let risk_tier = "LOW";
    let action = "ALLOW";
    let is_revenge_trade = false;

    if (prob >= 0.55) {
      risk_tier = "HIGH";
      action = "BLOCK";
      is_revenge_trade = true;
    } else if (prob >= 0.35) {
      risk_tier = "MEDIUM";
      action = "WARN";
    }

    return {
      success: true,
      fallback: true,
      error: error.message,
      data: {
        probability: Math.round(prob * 10000) / 10000,
        risk_tier,
        action,
        is_revenge_trade,
        reasons: (risk_tier !== "LOW" ? reasons : [])
      },
      source: "FALLBACK_HEURISTIC"
    };
  }
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  if (type === "PREDICT_RISK") {
    handlePredictRisk(payload.features).then(async (result) => {
      // Update session statistics
      const { state } = await chrome.storage.local.get("state");
      const currentState = state || INITIAL_STATE;

      if (result.data) {
        const tier = result.data.risk_tier;
        if (tier === "HIGH") {
          currentState.totalBlocked = (currentState.totalBlocked || 0) + 1;
          updateBadge("LOCK", "#dc2626");
        } else if (tier === "MEDIUM") {
          currentState.totalWarned = (currentState.totalWarned || 0) + 1;
          updateBadge("WARN", "#d97706");
        } else {
          currentState.totalPassed = (currentState.totalPassed || 0) + 1;
          updateBadge("SAFE", "#16a34a");
        }
      }

      await chrome.storage.local.set({ state: currentState });
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }

  if (type === "CHECK_BACKEND_HEALTH") {
    chrome.storage.local.get("config").then(async ({ config }) => {
      const backendUrl = (config && config.backendUrl) || "http://127.0.0.1:8000";
      try {
        const res = await fetch(`${backendUrl}/health`, { method: "GET" });
        if (res.ok) {
          sendResponse({ healthy: true, url: backendUrl });
        } else {
          sendResponse({ healthy: false, error: `HTTP ${res.status}`, url: backendUrl });
        }
      } catch (e) {
        sendResponse({ healthy: false, error: e.message, url: backendUrl });
      }
    });
    return true;
  }

  if (type === "GET_STATE") {
    chrome.storage.local.get(["state", "config"]).then((data) => {
      sendResponse(data);
    });
    return true;
  }

  if (type === "UPDATE_STATE") {
    chrome.storage.local.get("state").then(async ({ state }) => {
      const updated = { ...(state || INITIAL_STATE), ...payload };
      await chrome.storage.local.set({ state: updated });
      sendResponse({ success: true, state: updated });
    });
    return true;
  }

  if (type === "TRIGGER_COOLDOWN") {
    const duration = payload.duration || 60;
    const cooldownUntil = Date.now() + duration * 1000;
    
    chrome.storage.local.get("state").then(async ({ state }) => {
      const updated = { ...(state || INITIAL_STATE), activeCooldownUntil: cooldownUntil };
      await chrome.storage.local.set({ state: updated });
      updateBadge("LOCK", "#dc2626");

      // Broadcast cooldown to all open tabs
      const tabs = await chrome.tabs.query({});
      const senderTabId = sender && sender.tab && sender.tab.id;
      for (const tab of tabs) {
        if (senderTabId && tab.id === senderTabId) continue; // Skip sender tab!
        try {
          chrome.tabs.sendMessage(tab.id, {
            type: "COOLDOWN_STARTED",
            payload: { cooldownUntil, reasons: payload.reasons || [] }
          });
        } catch (e) {
          // Tab might not have content script
        }
      }

      sendResponse({ success: true, cooldownUntil });
    });
    return true;
  }

  if (type === "RESET_SESSION") {
    chrome.storage.local.set({ state: INITIAL_STATE }).then(() => {
      updateBadge("ON", "#0284c7");
      sendResponse({ success: true, state: INITIAL_STATE });
    });
    return true;
  }

  if (type === "RECORD_TRADE_RESULT") {
    chrome.storage.local.get("state").then(async ({ state }) => {
      const curr = state || INITIAL_STATE;
      const isLoss = payload.pnl < 0;
      curr.lossStreak = isLoss ? (curr.lossStreak || 0) + 1 : 0;
      curr.lastResolvedPnl = payload.pnl;
      curr.recentTrades = [payload, ...(curr.recentTrades || [])].slice(0, 30);
      await chrome.storage.local.set({ state: curr });
      sendResponse({ success: true, state: curr });
    });
    return true;
  }
});
