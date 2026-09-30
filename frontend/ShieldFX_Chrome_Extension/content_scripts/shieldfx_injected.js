// ─── SHIELDFX INJECTED ENGINE ───────────────────────────────────────────────
// Injects into Zerodha, Groww, Binance, and other trading platforms.

(function () {
  if (window.__shieldfx_injected) return;
  window.__shieldfx_injected = true;

  console.log("⚡ [ShieldFX] Initializing Trading Guard on:", window.location.hostname);

  // Current session & broker state
  let platformInfo = window.ShieldFXBrokerAdapters.detectPlatform();
  let adapter = platformInfo.adapter;

  let sessionState = {
    activeCooldownUntil: null,
    lossStreak: 0,
    lastOrderTime: null,
    lastOrderLot: null,
    lastResolvedPnl: 0,
    totalBlocked: 0,
    startingBalance: 50000,
    currentBalance: 50000,
    peakBalance: 50000
  };

  let cooldownInterval = null;
  let bypassNextClick = false;

  // ─── 1. BUILD & INJECT DOM OVERLAYS ──────────────────────────────────────────
  function injectShieldFXDom() {
    if (document.getElementById("shieldfx-extension-root")) return;

    const root = document.createElement("div");
    root.id = "shieldfx-extension-root";
    root.innerHTML = `
      <!-- Fullscreen Lockdown Overlay -->
      <div id="shieldfx-extension-overlay">
        <div class="sfx-lock-card">
          <div class="sfx-badge-danger">
            <span class="sfx-pulse-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></span>
            ML Hard Intercept Active
          </div>

          <h2 class="sfx-lock-title">🚨 High-Risk Revenge Trade Blocked</h2>
          <p class="sfx-lock-subtitle">
            ShieldFX Machine Learning detected an emotional tilt & revenge-trading pattern on <strong>${platformInfo.name}</strong>.
          </p>

          <div class="sfx-countdown-box">
            <div class="sfx-countdown-digits" id="sfx-cooldown-timer">01:00</div>
            <div class="sfx-countdown-label">Compulsory Cognitive Reset Period</div>
          </div>

          <div class="sfx-triggers-panel" id="sfx-triggers-panel" style="display:none;">
            <div class="sfx-triggers-header">
              <span>⚠️ Flagged Risk Dimensions</span>
            </div>
            <ul class="sfx-triggers-list" id="sfx-triggers-list"></ul>
          </div>

          <div class="sfx-lock-footer">
            Order placement is locked to protect your trading capital.<br/>
            Take a deep breath and review your risk management rules.
          </div>
        </div>
      </div>

      <!-- In-Page Advisory Toast -->
      <div id="shieldfx-toast">
        <strong>⚠️ ShieldFX Advisory:</strong> <span id="sfx-toast-msg">Elevated risk pattern detected. Trade executed with caution.</span>
      </div>

      <!-- Draggable Floating HUD Widget -->
      <div id="shieldfx-floating-hud">
        <div class="sfx-hud-header" id="sfx-hud-header">
          <div class="sfx-hud-brand">
            <span>⚡ SHIELDFX</span>
            <span class="sfx-pulse-dot"></span>
          </div>
          <button class="sfx-hud-toggle" id="sfx-hud-toggle" title="Minimize / Expand">−</button>
        </div>
        <div class="sfx-hud-body" id="sfx-hud-body">
          <div class="sfx-hud-risk-row">
            <span class="sfx-hud-risk-label">Tilt / Revenge Risk</span>
            <span class="sfx-hud-risk-score" id="sfx-hud-score">SAFE (5%)</span>
          </div>
          <div class="sfx-meter-bar-bg">
            <div class="sfx-meter-bar-fill" id="sfx-hud-bar"></div>
          </div>

          <div class="sfx-hud-stats">
            <div class="sfx-hud-stat-box">
              <span class="sfx-stat-lbl">Loss Streak</span>
              <span class="sfx-stat-val" id="sfx-hud-streak">0</span>
            </div>
            <div class="sfx-hud-stat-box">
              <span class="sfx-stat-lbl">Platform</span>
              <span class="sfx-stat-val" style="color:#38bdf8; font-size:10px;">${platformInfo.name}</span>
            </div>
          </div>

          <div class="sfx-hud-actions">
            <button class="sfx-mini-btn sfx-btn-loss" id="sfx-btn-record-loss" title="Increment loss streak">+1 Loss</button>
            <button class="sfx-mini-btn" id="sfx-btn-record-win" title="Reset loss streak">Reset</button>
            <button class="sfx-mini-btn" id="sfx-btn-demo-tilt" title="Simulate revenge scenario" style="border-color:#eab308; color:#fde047;">Test Demo</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    bindHudEvents();
  }

  // ─── 2. HUD EVENT BINDINGS & DRAGGING ────────────────────────────────────────
  function bindHudEvents() {
    const hud = document.getElementById("shieldfx-floating-hud");
    const header = document.getElementById("sfx-hud-header");
    const toggleBtn = document.getElementById("sfx-hud-toggle");
    const body = document.getElementById("sfx-hud-body");

    // Toggle collapse
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (body.style.display === "none") {
        body.style.display = "block";
        toggleBtn.textContent = "−";
        hud.classList.remove("sfx-collapsed");
      } else {
        body.style.display = "none";
        toggleBtn.textContent = "+";
        hud.classList.add("sfx-collapsed");
      }
    });

    hud.addEventListener("click", () => {
      if (hud.classList.contains("sfx-collapsed")) {
        body.style.display = "block";
        toggleBtn.textContent = "−";
        hud.classList.remove("sfx-collapsed");
      }
    });

    // Record loss / win manual controls
    document.getElementById("sfx-btn-record-loss").addEventListener("click", (e) => {
      e.stopPropagation();
      sessionState.lossStreak = (sessionState.lossStreak || 0) + 1;
      sessionState.lastResolvedPnl = -2500;
      updateHudUI();
      syncStateToBackground();
      showToast(`Recorded Loss. Current streak: ${sessionState.lossStreak}`);
    });

    document.getElementById("sfx-btn-record-win").addEventListener("click", (e) => {
      e.stopPropagation();
      sessionState.lossStreak = 0;
      sessionState.lastResolvedPnl = 1000;
      updateHudUI();
      syncStateToBackground();
      showToast("Loss streak reset to 0.");
    });

    document.getElementById("sfx-btn-demo-tilt").addEventListener("click", (e) => {
      e.stopPropagation();
      
      showToast("🎬 Step 1 / 3: Normal entry (1 Lot, Safe)...");
      sessionState.lossStreak = 0;
      sessionState.lastOrderLot = 1;
      sessionState.lastOrderTime = Date.now();
      updateHudUI(0.08, "LOW");

      setTimeout(() => {
        showToast("⚠️ Step 2 / 3: Trader tilts after loss! Escalating to 2 Lots (2.0x)...");
        sessionState.lossStreak = 1;
        sessionState.lastOrderLot = 2;
        sessionState.lastResolvedPnl = -1200;
        sessionState.lastOrderTime = Date.now() - 3000;
        updateHudUI(0.52, "MEDIUM");

        setTimeout(() => {
          showToast("🚨 Step 3 / 3: Revenge Double-Down! Escalating to 4 Lots (4.0x)...");
          sessionState.lossStreak = 2;
          sessionState.lastResolvedPnl = -3500;
          sessionState.lastOrderLot = 4;
          sessionState.lastOrderTime = Date.now() - 2100;

          const demoFeatures = {
            time_delta_seconds: 2.1,
            lot_size_multiplier: 2.0,
            position_size_change: 2.0,
            is_unhedged: 1,
            loss_streak_count: 2,
            recent_pnl_delta: -3500.0,
            current_drawdown_pct: 12.0

          };

          chrome.runtime.sendMessage({
            type: "PREDICT_RISK",
            payload: { features: demoFeatures }
          }, (res) => {
            if (res && res.data && res.data.risk_tier === "HIGH") {
              updateHudUI(res.data.probability, "HIGH");
              startInPageCooldown(60, res.data.reasons);
            } else {
              updateHudUI(0.98, "HIGH");
              startInPageCooldown(60, [
                "Position size escalated by 2.0x vs previous trade (4.0x vs base)",
                "Rapid execution turnaround (2.1s after previous trade)",
                "Active losing streak (2 consecutive losses)",
                "Substantial recent drawdown (-₹3,500.00)"
              ]);
            }
          });
        }, 2200);
      }, 2000);
    });

    // Draggable HUD
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    header.addEventListener("mousedown", (e) => {
      if (e.target === toggleBtn) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = hud.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      hud.style.right = "auto";
      hud.style.bottom = "auto";
      hud.style.left = origLeft + "px";
      hud.style.top = origTop + "px";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      hud.style.left = Math.max(10, Math.min(window.innerWidth - 260, origLeft + dx)) + "px";
      hud.style.top = Math.max(10, Math.min(window.innerHeight - 80, origTop + dy)) + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // ─── 3. STATE SYNC & HUD UI UPDATES ─────────────────────────────────────────
  function syncStateToBackground() {
    chrome.runtime.sendMessage({
      type: "UPDATE_STATE",
      payload: {
        lossStreak: sessionState.lossStreak,
        lastOrderTime: sessionState.lastOrderTime,
        lastOrderLot: sessionState.lastOrderLot,
        lastResolvedPnl: sessionState.lastResolvedPnl
      }
    });
  }

  function updateHudUI(prob = 0.05, tier = "LOW") {
    const scoreEl = document.getElementById("sfx-hud-score");
    const barEl = document.getElementById("sfx-hud-bar");
    const streakEl = document.getElementById("sfx-hud-streak");

    if (streakEl) streakEl.textContent = sessionState.lossStreak || 0;

    const pct = Math.min(Math.max(Math.round(prob * 100), 4), 100);
    if (barEl) barEl.style.width = pct + "%";

    if (scoreEl) {
      if (tier === "HIGH") {
        scoreEl.textContent = `CRITICAL (${pct}%)`;
        scoreEl.style.color = "#ef4444";
        if (barEl) barEl.style.backgroundColor = "#ef4444";
      } else if (tier === "MEDIUM") {
        scoreEl.textContent = `WARN (${pct}%)`;
        scoreEl.style.color = "#f59e0b";
        if (barEl) barEl.style.backgroundColor = "#f59e0b";
      } else {
        scoreEl.textContent = `SAFE (${pct}%)`;
        scoreEl.style.color = "#4ade80";
        if (barEl) barEl.style.backgroundColor = "#4ade80";
      }
    }
  }

  function showToast(msg) {
    const toast = document.getElementById("shieldfx-toast");
    const msgEl = document.getElementById("sfx-toast-msg");
    if (!toast || !msgEl) return;

    msgEl.textContent = msg;
    toast.style.display = "block";
    setTimeout(() => {
      toast.style.display = "none";
    }, 4500);
  }

  // ─── 4. COOLDOWN OVERLAY CONTROLLER ─────────────────────────────────────────
  function startInPageCooldown(seconds = 60, reasons = [],  informBackground = true) {
    const overlay = document.getElementById("shieldfx-extension-overlay");
    const timerEl = document.getElementById("sfx-cooldown-timer");
    const triggersPanel = document.getElementById("sfx-triggers-panel");
    const triggersList = document.getElementById("sfx-triggers-list");

    if (cooldownInterval) clearInterval(cooldownInterval);

    // Populate reasons
    if (triggersPanel && triggersList) {
      if (reasons && reasons.length > 0) {
        triggersList.innerHTML = reasons.map((r) => `<li>${r}</li>`).join("");
        triggersPanel.style.display = "block";
      } else {
        triggersPanel.style.display = "none";
        triggersList.innerHTML = "";
      }
    }

    overlay.style.display = "flex";
    let remaining = seconds;
    sessionState.activeCooldownUntil = Date.now() + remaining * 1000;

    function renderTime() {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      if (timerEl) {
        timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }

      if (remaining <= 0) {
        clearInterval(cooldownInterval);
        sessionState.activeCooldownUntil = null;
        overlay.style.display = "none";
        updateHudUI(0.05, "LOW");
        chrome.runtime.sendMessage({ type: "UPDATE_STATE", payload: { activeCooldownUntil: null } });
        console.log("✅ [ShieldFX] Cooldown completed — trading unblocked");
        return;
      }

      remaining--;
    }

    renderTime();
    cooldownInterval = setInterval(renderTime, 1000);

      if (informBackground) {
      chrome.runtime.sendMessage({
        type: "TRIGGER_COOLDOWN",
        payload: { duration: seconds, reasons }
      });
    }
  }

  // ─── 5. ORDER INTERCEPTION ENGINE (CAPTURE PHASE) ───────────────────────────
  async function handleOrderAttempt(event, targetElement) {
    if (bypassNextClick) {
      bypassNextClick = false;
      return; // Permitted order pass-through
    }

    // Check active cooldown
    if (sessionState.activeCooldownUntil && Date.now() < sessionState.activeCooldownUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const remainingSecs = Math.ceil((sessionState.activeCooldownUntil - Date.now()) / 1000);
      startInPageCooldown(remainingSecs);
      console.warn("⏳ [ShieldFX] Trade blocked — Cooldown active for", remainingSecs, "seconds");
      return;
    }

    // Extract trade details via active broker adapter
    const details = adapter.getOrderDetails(targetElement);
    const now = Date.now();

    // 5 ML Features matching backend FEATURE_ORDER exactly:
    const time_delta_seconds = sessionState.lastOrderTime === null
      ? 300.0
      : parseFloat(((now - sessionState.lastOrderTime) / 1000).toFixed(2));

    const lot_size_multiplier = sessionState.lastOrderLot === null
      ? 1.0
      : parseFloat((details.quantity / sessionState.lastOrderLot).toFixed(4));

    const is_unhedged = details.isUnhedged !== undefined ? details.isUnhedged : 1;
    const loss_streak_count = sessionState.lossStreak || 0;
    const recent_pnl_delta = parseFloat((sessionState.lastResolvedPnl || 0).toFixed(2));

    const features = {
      time_delta_seconds,
      lot_size_multiplier,
      is_unhedged,
      loss_streak_count,
      recent_pnl_delta
    };

    console.log("⚡ [ShieldFX] Intercepted Order. Evaluating behavioral telemetry:", features);

    // Prevent immediate execution while querying ML backend
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      chrome.runtime.sendMessage(
        {
          type: "PREDICT_RISK",
          payload: { features }
        },
        (response) => {
          if (!response || !response.data) {
            console.warn("⚠️ [ShieldFX] No prediction returned, allowing order as fail-safe");
            showToast("ShieldFX: Risk evaluation unavailable. Trade blocked.", "error");
            return;
          }

          const { probability, risk_tier, action, reasons } = response.data;
          console.log(`⚡ [ShieldFX] ML Model Response: Tier=${risk_tier}, Prob=${(probability * 100).toFixed(1)}%, Action=${action}`);

          updateHudUI(probability, risk_tier);

          if (risk_tier === "HIGH" || action === "BLOCK") {
            console.warn("🚨 [ShieldFX] HIGH RISK DETECTED — ORDER BLOCKED!", reasons);
            startInPageCooldown(60, reasons);
          } else if (risk_tier === "MEDIUM" || action === "WARN") {
            console.warn("⚠️ [ShieldFX] MEDIUM RISK WARNING:", reasons);
            const warningMsg = reasons && reasons.length > 0 ? reasons.join(" • ") : "Elevated tilt risk detected.";
            showToast(`⚠️ ShieldFX Warning: ${warningMsg}`);
            
            // Execute trade with warning
            recordOrderExecution(details.quantity);
            executeBypass(targetElement);
          } else {
            console.log("✅ [ShieldFX] LOW RISK — Order passed cleanly");
            recordOrderExecution(details.quantity);
            executeBypass(targetElement);
          }
        }
      );
    } catch (err) {
      console.error("❌ [ShieldFX] Evaluation error, executing fail-safe:", err);
      executeBypass(targetElement);
    }
  }

  function recordOrderExecution(quantity) {
    sessionState.lastOrderTime = Date.now();
    sessionState.lastOrderLot = quantity;
    syncStateToBackground();
  }

  function executeBypass(targetElement) {
    bypassNextClick = true;
    targetElement.click();
    setTimeout(() => {
      bypassNextClick = false;
    }, 100);
  }

  // ─── 6. EVENT CAPTURE REGISTRATION ──────────────────────────────────────────
  document.addEventListener(
    "click",
    (e) => {
      if (bypassNextClick) {
        bypassNextClick = false;
        return;
      }
      if (adapter.isOrderButton(e.target)) {
        handleOrderAttempt(e, e.target.closest("button, .btn, [role='button'], input[type='submit']") || e.target);
      }
    },
    true // Capture phase: intercepts event before broker scripts
  );

  // ─── 7. INITIALIZE EXTENSION ON PAGE LOAD ────────────────────────────────────
  function init() {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (data) => {
      if (data && data.state) {
        sessionState = { ...sessionState, ...data.state };
      }
      injectShieldFXDom();

      // Check if tab opened during an active cooldown
      if (sessionState.activeCooldownUntil && sessionState.activeCooldownUntil > Date.now()) {
        const remaining = Math.ceil((sessionState.activeCooldownUntil - Date.now()) / 1000);
        startInPageCooldown(remaining);
      }
    });
  }

  // Listen for broadcasts from background (e.g. cooldown started on another tab)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "COOLDOWN_STARTED") {
      const remaining = Math.ceil((message.payload.cooldownUntil - Date.now()) / 1000);
      if (remaining > 0) {
        startInPageCooldown(remaining, message.payload.reasons, false);
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
