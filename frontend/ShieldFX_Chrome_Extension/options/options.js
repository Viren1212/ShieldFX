// ─── SHIELDFX EXTENSION OPTIONS / SETTINGS SCRIPT ────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const backendUrlInput = document.getElementById("backendUrl");
  const cooldownDurationSelect = document.getElementById("cooldownDuration");
  const strictModeInput = document.getElementById("strictMode");
  const autoInterceptInput = document.getElementById("autoIntercept");

  const btnTestBackend = document.getElementById("btnTestBackend");
  const backendStatus = document.getElementById("backendStatus");
  const btnSave = document.getElementById("btnSave");
  const saveMsg = document.getElementById("saveMsg");

  // 1. Load saved config
  const { config } = await chrome.storage.local.get("config");
  if (config) {
    backendUrlInput.value = config.backendUrl || "http://127.0.0.1:8000";
    cooldownDurationSelect.value = String(config.cooldownDuration || 60);
    strictModeInput.checked = Boolean(config.strictMode);
    autoInterceptInput.checked = config.autoIntercept !== false;
  } else {
    backendUrlInput.value = "http://127.0.0.1:8000";
    cooldownDurationSelect.value = "60";
    autoInterceptInput.checked = true;
  }

  // 2. Test backend connection
  btnTestBackend.addEventListener("click", async () => {
    backendStatus.textContent = "Testing connection...";
    backendStatus.className = "status-msg";

    const url = backendUrlInput.value.trim().replace(/\/+$/, "");
    try {
      const res = await fetch(`${url}/health`, { method: "GET" });
      if (res.ok) {
        backendStatus.textContent = "✅ Connected to ShieldFX ML Backend successfully!";
        backendStatus.className = "status-msg success";
      } else {
        backendStatus.textContent = `❌ Backend returned HTTP status ${res.status}`;
        backendStatus.className = "status-msg error";
      }
    } catch (e) {
      backendStatus.textContent = `❌ Connection failed: ${e.message}`;
      backendStatus.className = "status-msg error";
    }
  });

  // 3. Save config
  btnSave.addEventListener("click", async () => {
    const updatedConfig = {
      backendUrl: backendUrlInput.value.trim().replace(/\/+$/, "") || "http://127.0.0.1:8000",
      cooldownDuration: parseInt(cooldownDurationSelect.value) || 60,
      strictMode: strictModeInput.checked,
      autoIntercept: autoInterceptInput.checked
    };

    await chrome.storage.local.set({ config: updatedConfig });
    saveMsg.textContent = "✅ Settings saved successfully!";
    saveMsg.className = "save-msg success";
    setTimeout(() => {
      saveMsg.textContent = "";
    }, 3500);
  });
});
