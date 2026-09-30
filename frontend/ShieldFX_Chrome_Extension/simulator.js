// ─── STATE ───────────────────────────────────────────────────────────────────
let currentPrice   = 24350.00;
let prevPrice      = currentPrice;
let candles        = [];
let currentCandle  = null;
let tickCountInCandle = 0;
const TICKS_PER_CANDLE = 3;

let orders         = [];
let lastOrderTime  = null;
let lastOrderLot   = null;
let lastResolvedPnl = 0;
let lossStreak     = 0;
let realisedTotal  = 0;
let wins = 0, losses = 0;

let demoMode       = false;
let demoIndex      = 0;
let priceInterval  = null;
let telemetryInterval = null;
let processing     = false;

const demoPrices = [
  24350, 24348, 24345, 24340,
  24340, 24342, 24341,
  24341, 24338, 24334, 24328,
  24328, 24330, 24329,
  24329, 24325, 24320, 24312
];

let cooldownActive = false;
let cooldownTimer  = null;

function initCandles() {
  candles = [];
  let base = 24355;
  for (let i = 0; i < 30; i++) {
    const move = (Math.random() - 0.48) * 8;
    const open = parseFloat(base.toFixed(2));
    const close = parseFloat((base + move).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * 4).toFixed(2));
    const low  = parseFloat((Math.min(open, close) - Math.random() * 4).toFixed(2));
    const volume = Math.floor(Math.random() * 6000) + 4000;
    candles.push({ open, high, low, close, volume, markers: [] });
    base = close;
  }
  currentPrice = base;
  prevPrice = base;
  currentCandle = { open: base, high: base, low: base, close: base, volume: 5200, markers: [] };
}

function startShieldFXCooldown(reasons = [], customRemaining = null) {
    cooldownActive = true;
    updateButtonState();
    if (cooldownTimer) clearInterval(cooldownTimer);

    const overlay = document.getElementById("shieldfx-overlay");
    const countdown = document.getElementById("shieldfx-countdown");
    const reasonsBox = document.getElementById("shieldfx-reasons");

    if (reasonsBox) {
        if (reasons && reasons.length > 0) {
            reasonsBox.style.display = "block";
            reasonsBox.innerHTML = "<strong>Flagged Risk Dimensions:</strong><br/>• " + reasons.join("<br/>• ");
        } else {
            reasonsBox.style.display = "none";
            reasonsBox.innerHTML = "";
        }
    }

    overlay.style.display = "flex";
    const duration = customRemaining !== null ? customRemaining : (demoMode ? 15 : 60);
    const unlockAt = Date.now() + (duration * 1000);

    localStorage.setItem("shieldfx_ext_sim_cooldown", unlockAt.toString());
    localStorage.setItem("shieldfx_ext_sim_reasons", JSON.stringify(reasons));

    function updateCountdown() {
        const savedUntil = parseInt(localStorage.getItem("shieldfx_ext_sim_cooldown") || "0", 10);
        const remaining = Math.max(0, Math.ceil((savedUntil - Date.now()) / 1000));

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        if (remaining <= 0) {
            clearInterval(cooldownTimer);
            cooldownActive = false;
            overlay.style.display = "none";
            processing = false;
            localStorage.removeItem("shieldfx_ext_sim_cooldown");
            localStorage.removeItem("shieldfx_ext_sim_reasons");
            updateButtonState();
            updateRiskMeter(0, 'LOW');
            console.log("✅ ShieldFX cooldown complete — trading unlocked");
            return;
        }
    }

    updateCountdown();
    cooldownTimer = setInterval(updateCountdown, 1000);
}

function updateDemoBanner(html) {
  const banner = document.getElementById("demoProgressBanner");
  if (banner) {
    banner.style.display = demoMode ? "block" : "none";
    if (html) banner.innerHTML = html;
  }
}

function toggleDemoMode() {
  demoMode = document.getElementById('demoMode').checked;
  demoIndex = 0;

  if (demoMode) {
    initCandles();
    currentPrice = demoPrices[0];
    currentCandle = { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, markers: [] };
    renderTicker();
    drawCandles();
    updateDemoBanner("🎬 <strong>Demo Price Feed Active:</strong> NIFTY following scripted trajectory. Place trades manually.");
  } else {
    updateDemoBanner("");
  }
}

function resetSession() {
  if (cooldownActive) {
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownActive = false;
    document.getElementById("shieldfx-overlay").style.display = "none";
  }
  localStorage.removeItem("shieldfx_ext_sim_cooldown");
  localStorage.removeItem("shieldfx_ext_sim_reasons");

  orders = [];
  lastOrderTime = null;
  lastOrderLot = null;
  lastResolvedPnl = 0;
  lossStreak = 0;
  realisedTotal = 0;
  wins = 0;
  losses = 0;
  processing = false;

  renderOrders();
  renderSummary();
  updateButtonState();
  updateRiskMeter(0, 'LOW');

  const timeVal = document.getElementById('timeDeltaVal');
  if (timeVal) {
    timeVal.textContent = 'Ready (No previous trade)';
    timeVal.className = 'time-delta-val';
  }

  const latencyEl = document.getElementById('latencyDisplay');
  if (latencyEl) {
    latencyEl.textContent = '~0.0 ms';
  }

  const panel = document.getElementById('debugPanel');
  if (panel) {
    panel.innerHTML = '<em style="color:#475569">Session reset. Real-time trade telemetry will appear here on order submission...</em>';
  }

  const toast = document.getElementById('advisoryToast');
  if (toast) toast.style.display = 'none';

  console.log("🔄 ShieldFX session reset complete.");
}

function updateTimeDeltaTelemetry() {
  const valEl = document.getElementById('timeDeltaVal');
  if (!valEl) return;

  if (lastOrderTime === null) {
    valEl.textContent = 'Ready (No previous trade)';
    valEl.className = 'time-delta-val';
    return;
  }

  const secs = ((Date.now() - lastOrderTime) / 1000).toFixed(1);
  valEl.textContent = `${secs}s ago`;

  if (parseFloat(secs) < 10.0) {
    valEl.className = 'time-delta-val danger';
  } else {
    valEl.className = 'time-delta-val';
  }
}

// ─── CANDLESTICK & TECHNICAL INDICATOR ENGINE ───────────────────────────────
let chartIndicators = { ema9: true, ema21: true, bollinger: true, volume: true };
let hoverMouseX = null;
let hoverMouseY = null;

function toggleChartInd(ind) {
  chartIndicators[ind] = !chartIndicators[ind];
  const pill = document.getElementById('pill' + ind.toUpperCase());
  if (pill) {
    pill.classList.toggle('off', !chartIndicators[ind]);
  }
  drawCandles();
}

function setTimeframe(tf) {
  document.querySelectorAll('.tf-tab').forEach(t => t.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.tf-tab')).find(t => t.textContent === tf);
  if (activeBtn) activeBtn.classList.add('active');
  drawCandles();
}

// Attach crosshair listener
const canvasEl = document.getElementById('chartCanvas');
if (canvasEl) {
  canvasEl.addEventListener('mousemove', (e) => {
    const rect = canvasEl.getBoundingClientRect();
    hoverMouseX = e.clientX - rect.left;
    hoverMouseY = e.clientY - rect.top;
    drawCandles();
  });
  canvasEl.addEventListener('mouseleave', () => {
    hoverMouseX = null;
    hoverMouseY = null;
    drawCandles();
  });
}

function computeEMA(data, period) {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const emaValues = [];
  let prevEma = data[0].close;
  
  for (let i = 0; i < data.length; i++) {
    const close = data[i].close;
    const currentEma = (close * k) + (prevEma * (1 - k));
    emaValues.push(currentEma);
    prevEma = currentEma;
  }
  return emaValues;
}

function computeBollinger(data, period = 20, multiplier = 2) {
  const bands = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = data.slice(start, i + 1);
    const mean = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);
    bands.push({
      middle: mean,
      upper: mean + (multiplier * stdDev),
      lower: mean - (multiplier * stdDev)
    });
  }
  return bands;
}

function drawCandles() {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // High-DPI Retina scaling
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.parentElement.clientWidth - 32;
  const displayHeight = 270;

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';

  ctx.scale(dpr, dpr);

  const w = displayWidth;
  const h = displayHeight;
  const rightGutter = 60;
  const chartWidth = w - rightGutter;
  const volumeHeight = chartIndicators.volume ? 45 : 0;
  const priceChartHeight = h - volumeHeight - 20;

  ctx.clearRect(0, 0, w, h);

  const allVisibleCandles = [...candles];
  if (currentCandle) allVisibleCandles.push(currentCandle);
  if (allVisibleCandles.length === 0) return;

  // Price Range Calculation
  let minP = Math.min(...allVisibleCandles.map(c => c.low));
  let maxP = Math.max(...allVisibleCandles.map(c => c.high));

  let bollingerBands = [];
  if (chartIndicators.bollinger) {
    bollingerBands = computeBollinger(allVisibleCandles);
    const upperMax = Math.max(...bollingerBands.map(b => b.upper));
    const lowerMin = Math.min(...bollingerBands.map(b => b.lower));
    maxP = Math.max(maxP, upperMax);
    minP = Math.min(minP, lowerMin);
  }

  const padding = (maxP - minP) * 0.08 || 2;
  minP -= padding;
  maxP += padding;
  const range = (maxP - minP) || 1;

  // Grid Lines & Right Price Scale
  ctx.strokeStyle = '#151d2c';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';

  const gridSteps = 4;
  for (let i = 1; i <= gridSteps; i++) {
    const y = (priceChartHeight / (gridSteps + 1)) * i + 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();

    const priceAtY = maxP - ((y - 10) / priceChartHeight) * range;
    ctx.fillText(priceAtY.toFixed(2), chartWidth + 6, y + 3);
  }
  ctx.setLineDash([]);

  // Axis separator line
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(chartWidth, 0);
  ctx.lineTo(chartWidth, h);
  ctx.stroke();

  const numCandles = allVisibleCandles.length;
  const slotW = chartWidth / numCandles;
  const bodyW = Math.max(slotW * 0.65, 3);

  const getY = (val) => 10 + priceChartHeight - ((val - minP) / range) * priceChartHeight;

  // 1. Draw Bollinger Bands Envelope
  if (chartIndicators.bollinger && bollingerBands.length > 0) {
    ctx.fillStyle = 'rgba(168, 85, 247, 0.07)';
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    bollingerBands.forEach((b, i) => {
      const x = i * slotW + slotW / 2;
      const y = getY(b.upper);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = bollingerBands.length - 1; i >= 0; i--) {
      const x = i * slotW + slotW / 2;
      const y = getY(bollingerBands[i].lower);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    bollingerBands.forEach((b, i) => {
      const x = i * slotW + slotW / 2;
      const y = getY(b.upper);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.beginPath();
    bollingerBands.forEach((b, i) => {
      const x = i * slotW + slotW / 2;
      const y = getY(b.lower);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 2. Draw Volume Histogram at bottom
  if (chartIndicators.volume) {
    const maxVol = Math.max(...allVisibleCandles.map(c => c.volume || 1500));
    const volBaseY = h - 6;

    allVisibleCandles.forEach((c, i) => {
      const isBull = c.close >= c.open;
      const x = i * slotW + slotW / 2;
      const vol = c.volume || 1500;
      const barH = (vol / maxVol) * (volumeHeight - 8);

      ctx.fillStyle = isBull ? 'rgba(0, 230, 118, 0.28)' : 'rgba(255, 82, 82, 0.28)';
      ctx.fillRect(x - bodyW / 2, volBaseY - barH, bodyW, barH);
    });
  }

  // 3. Draw Candlesticks
  let hoveredCandle = null;
  allVisibleCandles.forEach((c, i) => {
    const isBull = c.close >= c.open;
    const color = isBull ? '#00e676' : '#ff5252';
    const centerX = i * slotW + slotW / 2;

    const yHigh = getY(c.high);
    const yLow  = getY(c.low);
    const yOpen = getY(c.open);
    const yClose = getY(c.close);

    if (hoverMouseX !== null && hoverMouseX >= i * slotW && hoverMouseX < (i + 1) * slotW) {
      hoveredCandle = { ...c, centerX, yClose, index: i };
    }

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(centerX, yHigh);
    ctx.lineTo(centerX, yLow);
    ctx.stroke();

    // Body
    const top = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(Math.abs(yClose - yOpen), 2);
    ctx.fillStyle = color;
    ctx.fillRect(centerX - bodyW / 2, top, bodyW, bodyHeight);

    // Markers (BUY / SELL / BLOCK)
    if (c.markers && c.markers.length > 0) {
      c.markers.forEach(m => {
        if (m.type === 'BUY') {
          ctx.fillStyle = '#00e676';
          ctx.beginPath();
          ctx.moveTo(centerX, yLow + 4);
          ctx.lineTo(centerX - 4, yLow + 10);
          ctx.lineTo(centerX + 4, yLow + 10);
          ctx.closePath();
          ctx.fill();
        } else if (m.type === 'SELL') {
          ctx.fillStyle = '#ff5252';
          ctx.beginPath();
          ctx.moveTo(centerX, yHigh - 4);
          ctx.lineTo(centerX - 4, yHigh - 10);
          ctx.lineTo(centerX + 4, yHigh - 10);
          ctx.closePath();
          ctx.fill();
        } else if (m.type === 'BLOCK') {
          ctx.fillStyle = '#ef4444';
          ctx.font = '11px sans-serif';
          ctx.fillText('🚨', centerX - 6, yHigh - 8);
        }
      });
    }
  });

  // 4. Draw EMA 9 & EMA 21
  const ema9Data = computeEMA(allVisibleCandles, 9);
  const ema21Data = computeEMA(allVisibleCandles, 21);

  if (chartIndicators.ema9 && ema9Data.length > 0) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ema9Data.forEach((val, i) => {
      const x = i * slotW + slotW / 2;
      const y = getY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  if (chartIndicators.ema21 && ema21Data.length > 0) {
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ema21Data.forEach((val, i) => {
      const x = i * slotW + slotW / 2;
      const y = getY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 5. Real-Time LTP Line & Right Tag
  const currentY = getY(currentPrice);
  if (currentY >= 0 && currentY <= h) {
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(chartWidth, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right-hand LTP badge
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(chartWidth + 2, currentY - 8, rightGutter - 4, 16);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(currentPrice.toFixed(2), chartWidth + 5, currentY + 3);
  }

  // 6. Update Top Telemetry Bar
  const displayCandle = hoveredCandle || allVisibleCandles[allVisibleCandles.length - 1];
  const lastIndex = hoveredCandle
      ? hoveredCandle.index
      : (allVisibleCandles.length - 1);
  
  if (displayCandle) {
    const elOpen = document.getElementById('ohlcOpen');
    if (elOpen) elOpen.textContent = displayCandle.open.toFixed(2);
    const elHigh = document.getElementById('ohlcHigh');
    if (elHigh) elHigh.textContent = displayCandle.high.toFixed(2);
    const elLow = document.getElementById('ohlcLow');
    if (elLow) elLow.textContent = displayCandle.low.toFixed(2);
    const elClose = document.getElementById('ohlcClose');
    if (elClose) elClose.textContent = displayCandle.close.toFixed(2);
    const elVol = document.getElementById('ohlcVol');
    if (elVol) elVol.textContent = (displayCandle.volume || 11509).toLocaleString();
  }

  if (ema9Data.length > 0) {
    const e9 = ema9Data[lastIndex] || ema9Data[ema9Data.length - 1];
    const elE9 = document.getElementById('ema9Telemetry');
    if (elE9) elE9.textContent = `EMA(9): ${e9.toFixed(2)}`;
  }
  if (ema21Data.length > 0) {
    const e21 = ema21Data[lastIndex] || ema21Data[ema21Data.length - 1];
    const elE21 = document.getElementById('ema21Telemetry');
    if (elE21) elE21.textContent = `EMA(21): ${e21.toFixed(2)}`;
  }

  // 7. Interactive Hover Crosshair
  if (hoverMouseX !== null && hoverMouseY !== null && hoverMouseX <= chartWidth) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(hoverMouseX, 0);
    ctx.lineTo(hoverMouseX, h);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, hoverMouseY);
    ctx.lineTo(chartWidth, hoverMouseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function nextRandomPrice(base) {
  const move = (Math.random() - 0.48) * 8;
  return parseFloat((base + move).toFixed(2));
}

function tickPrice() {
  prevPrice = currentPrice;

  if (demoMode) {
    currentPrice = demoPrices[demoIndex % demoPrices.length];
    demoIndex++;
  } else {
    currentPrice = nextRandomPrice(currentPrice);
  }

  // Update Current Candle (OHLC) & Volume
  if (!currentCandle) {
    currentCandle = { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: 1500, markers: [] };
  } else {
    currentCandle.high = parseFloat(Math.max(currentCandle.high, currentPrice).toFixed(2));
    currentCandle.low  = parseFloat(Math.min(currentCandle.low, currentPrice).toFixed(2));
    currentCandle.close = currentPrice;
    currentCandle.volume = (currentCandle.volume || 1500) + Math.floor(Math.random() * 250) + 100;
  }

  tickCountInCandle++;

  // Close Candle and push after every TICKS_PER_CANDLE ticks
  if (tickCountInCandle >= TICKS_PER_CANDLE) {
    candles.push(currentCandle);
    if (candles.length > 30) candles.shift();
    currentCandle = { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: Math.floor(Math.random() * 2000) + 2000, markers: [] };
    tickCountInCandle = 0;
  }

  renderTicker();
  drawCandles();
  resolveOpenTrades();
}

function renderTicker() {
  const sym = document.getElementById('symbolInput') ? document.getElementById('symbolInput').value : 'NIFTY';
  const el = document.getElementById('ltpDisplay');
  if (el) {
    el.textContent = currentPrice.toFixed(2);
    el.className = 'ltp ' + (currentPrice > prevPrice ? 'up' : currentPrice < prevPrice ? 'down' : '');
  }
  
  const symTag = document.getElementById('symbolTag');
  if (symTag) symTag.textContent = sym;

  // Update top chart header
  const chartHdrLtp = document.getElementById('chartHeaderLtp');
  if (chartHdrLtp) {
    chartHdrLtp.textContent = `₹${currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const chartSymTxt = document.getElementById('chartSymbolText');
  if (chartSymTxt) {
    chartSymTxt.textContent = `${sym} 50 INDEX (₹${currentPrice.toFixed(2)})`;
  }
}

function computeFeatures(lotSize) {
  const now = Date.now();
  const time_delta_seconds = lastOrderTime === null
    ? 300.0
    : parseFloat(((now - lastOrderTime) / 1000).toFixed(2));

  const lot_size_multiplier = lastOrderLot === null
    ? 1.0
    : parseFloat((lotSize / lastOrderLot).toFixed(4));

  const is_unhedged = document.getElementById('hedgeSelect').value === 'naked' ? 1 : 0;
  const loss_streak_count = lossStreak;
  const recent_pnl_delta = parseFloat(lastResolvedPnl.toFixed(2));

  return {
    time_delta_seconds,
    lot_size_multiplier,
    is_unhedged,
    loss_streak_count,
    recent_pnl_delta,
  };
}

function evaluateLocalHeuristic(f) {
  let score = 0.05;
  const reasons = [];
  if (f.time_delta_seconds < 8.0) {
    score += 0.35;
    reasons.push(`Rapid trade turnaround (${f.time_delta_seconds}s)`);
  } else if (f.time_delta_seconds < 20.0) {
    score += 0.15;
  }
  if (f.lot_size_multiplier >= 2.0) {
    score += 0.35;
    reasons.push(`Lot size escalated by ${f.lot_size_multiplier}x`);
  } else if (f.lot_size_multiplier > 1.3) {
    score += 0.15;
  }
  if (f.loss_streak_count >= 2) {
    score += 0.25;
    reasons.push(`Loss streak of ${f.loss_streak_count} consecutive trades`);
  }
  if (f.is_unhedged === 1) {
    score += 0.05;
  }
  score = Math.min(Math.max(score, 0.02), 0.98);
  
  let risk_tier = 'LOW';
  let action = 'ALLOW';
  if (score >= 0.65) {
    risk_tier = 'HIGH';
    action = 'BLOCK';
  } else if (score >= 0.45) {
    risk_tier = 'MEDIUM';
    action = 'WARN';
  }
  return {
    probability: parseFloat(score.toFixed(3)),
    risk_tier,
    action,
    is_revenge_trade: score >= 0.65,
    reasons
  };
}

async function getRiskPrediction(features) {
  try {
    const response = await fetch("http://127.0.0.1:8000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features)
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("[ShieldFX] Backend unreachable / CORS preflight, running client heuristic:", err);
  }
  return evaluateLocalHeuristic(features);
}

function updateRiskMeter(prob, tier) {
    const bar = document.getElementById("riskProgressBar");
    const valText = document.getElementById("riskValueText");
    const pill = document.getElementById("riskTierPill");

    const pct = Math.min(Math.max((prob * 100), 0), 100).toFixed(1);
    bar.style.width = pct + "%";
    valText.textContent = pct + "%";

    if (tier === 'HIGH') {
        bar.style.backgroundColor = "#ef4444";
        pill.style.background = "#7f1d1d";
        pill.style.color = "#fca5a5";
        pill.textContent = "🔴 HIGH RISK — HARD BLOCK";
    } else if (tier === 'MEDIUM') {
        bar.style.backgroundColor = "#f59e0b";
        pill.style.background = "#78350f";
        pill.style.color = "#fde68a";
        pill.textContent = "🟡 MEDIUM RISK — ADVISORY";
    } else {
        bar.style.backgroundColor = "#4ade80";
        pill.style.background = "#14532d";
        pill.style.color = "#86efac";
        pill.textContent = "🟢 LOW RISK — SAFE";
    }
}

async function placeOrder(direction) {
  if (cooldownActive) return;
  if (processing) return;
  const hasOpenOrder = orders.some(o => o.status === 'OPEN');
  if (hasOpenOrder) return;

  const lotSize = parseInt(document.getElementById('lotInput').value) || 1;
  const symbol  = document.getElementById('symbolInput').value || 'NIFTY';
  const hedge   = document.getElementById('hedgeSelect').value;

  const features = computeFeatures(lotSize);
  const startTime = performance.now();

  const result = await getRiskPrediction(features);

  const latencyMs = (performance.now() - startTime).toFixed(1);
  const latencyEl = document.getElementById('latencyDisplay');
  if (latencyEl) {
    latencyEl.textContent = `${latencyMs} ms`;
  }

  const riskTier = result.risk_tier || result.risk_level || 'LOW';
  const reasons = result.reasons || [];
  const prob = result.probability || 0;

  updateRiskMeter(prob, riskTier);

  const toast = document.getElementById("advisoryToast");
  const advText = document.getElementById("advisoryText");

  if (riskTier === 'HIGH' || result.action === 'BLOCK') {
      if (currentCandle) currentCandle.markers.push({ type: 'BLOCK' });
      drawCandles();

      const blockedOrder = {
        id: orders.length + 1,
        time: new Date(),
        symbol,
        direction,
        lotSize,
        hedge,
        entryPrice: currentPrice,
        exitPrice: null,
        pnl: null,
        status: 'BLOCKED',
        ticksAfterEntry: 0,
        features,
        reasons
      };
      orders.push(blockedOrder);
      logFeatures(blockedOrder, features, true);
      renderOrders();
      renderSummary();

      toast.style.display = "none";
      if (demoMode) {
        updateDemoBanner("🚨 <strong>High-Risk Revenge Trade Blocked!</strong> ShieldFX Random Forest model intercepted execution.");
      }
      startShieldFXCooldown(reasons);
      processing = false;
      updateButtonState();
      return;
  } else if (riskTier === 'MEDIUM' || result.action === 'WARN') {
      advText.textContent = reasons.length > 0 ? reasons.join(" • ") : "Slight tilt pattern detected. Trade executed with caution.";
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 5000);
  } else {
      toast.style.display = "none";
  }

  if (currentCandle) currentCandle.markers.push({ type: direction });
  drawCandles();

  processing = true;
  updateButtonState();

  const order = {
    id: orders.length + 1,
    time: new Date(),
    symbol,
    direction,
    lotSize,
    hedge,
    entryPrice: currentPrice,
    exitPrice: null,
    pnl: null,
    status: 'OPEN',
    ticksAfterEntry: 0,
    features,
  };

  orders.push(order);
  lastOrderTime = Date.now();
  lastOrderLot  = lotSize;

  logFeatures(order, features, false);
  renderOrders();
  renderSummary();

  setTimeout(() => {
    processing = false;
    updateButtonState();
  }, 600);
}

function resolveOpenTrades() {
  let changed = false;
  for (const order of orders) {
    if (order.status !== 'OPEN') continue;
    order.ticksAfterEntry++;
    if (order.ticksAfterEntry >= 3) {
      order.exitPrice = currentPrice;
      const rawPnl = order.direction === 'BUY'
        ? (order.exitPrice - order.entryPrice) * order.lotSize * 50
        : (order.entryPrice - order.exitPrice) * order.lotSize * 50;
      order.pnl = parseFloat(rawPnl.toFixed(2));
      order.status = 'CLOSED';

      lastResolvedPnl = order.pnl;
      if (order.pnl < 0) lossStreak++; else lossStreak = 0;
      realisedTotal += order.pnl;
      if (order.pnl > 0) wins++; else losses++;

      changed = true;
    }
  }
  if (changed) {
    renderOrders();
    renderSummary();
    updateButtonState();
  }
}

function renderOrders() {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '';
  const reversed = [...orders].reverse();
  for (const o of reversed) {
    const tr = document.createElement('tr');
    
    if (o.status === 'BLOCKED') {
      tr.className = 'row-blocked';
      tr.innerHTML = `
        <td>${o.id}</td>
        <td>${o.time.toTimeString().slice(0,8)}</td>
        <td>${o.symbol}</td>
        <td style="color:${o.direction==='BUY'?'#4ade80':'#f87171'};font-weight:bold">${o.direction}</td>
        <td>${o.lotSize}</td>
        <td style="color:#94a3b8">${o.hedge}</td>
        <td>${o.entryPrice.toFixed(2)}</td>
        <td style="color:#64748b">—</td>
        <td style="color:#ef4444;font-weight:bold">₹0.00 (Saved)</td>
        <td style="color:#ef4444;font-weight:bold;letter-spacing:0.5px">🚨 BLOCKED BY ML</td>
      `;
    } else {
      if (o.status === 'OPEN') tr.className = 'row-open';

      const pnlStr = o.pnl !== null
        ? (o.pnl >= 0 ? `+₹${o.pnl.toFixed(2)}` : `-₹${Math.abs(o.pnl).toFixed(2)}`)
        : '—';
      const pnlCls = o.pnl === null ? '' : (o.pnl >= 0 ? 'pos' : 'neg');
      const exitStr = o.exitPrice !== null ? o.exitPrice.toFixed(2) : '—';

      tr.innerHTML = `
        <td>${o.id}</td>
        <td>${o.time.toTimeString().slice(0,8)}</td>
        <td>${o.symbol}</td>
        <td style="color:${o.direction==='BUY'?'#4ade80':'#f87171'};font-weight:bold">${o.direction}</td>
        <td>${o.lotSize}</td>
        <td style="color:#94a3b8">${o.hedge}</td>
        <td>${o.entryPrice.toFixed(2)}</td>
        <td>${exitStr}</td>
        <td class="${pnlCls}">${pnlStr}</td>
        <td class="${o.status==='OPEN'?'pending':''}">${o.status}</td>
      `;
    }
    tbody.appendChild(tr);
  }
}

function renderSummary() {
  const sign = realisedTotal >= 0 ? '+' : '';
  const el = document.getElementById('realisedPnl');
  el.textContent = `${sign}₹${realisedTotal.toFixed(2)}`;
  el.style.color = realisedTotal >= 0 ? '#4ade80' : '#f87171';
  document.getElementById('totalTrades').textContent = orders.length;
  document.getElementById('winLoss').textContent = `${wins} / ${losses}`;
}

function updateButtonState() {
  const hasOpenOrder = orders.some(o => o.status === 'OPEN');
  document.getElementById('buyBtn').disabled = processing || hasOpenOrder || cooldownActive;
  document.getElementById('sellBtn').disabled = processing || hasOpenOrder || cooldownActive;
}

function logFeatures(order, f, isBlocked = false) {
  const panel = document.getElementById('debugPanel');
  const placeholder = panel.querySelector('em');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'debug-entry';
  const headerClass = isBlocked ? 'debug-head blocked' : 'debug-head';
  const tag = isBlocked ? '[INTERCEPTED BY ML] ' : '';

  entry.innerHTML = `
    <span class="${headerClass}">${tag}Order #${order.id} — ${order.direction} ${order.symbol} @ ${order.entryPrice.toFixed(2)}</span><br/>
    <span class="debug-key">time_delta_seconds</span>: <span class="debug-val">${f.time_delta_seconds}s</span> &nbsp;
    <span class="debug-key">lot_size_multiplier</span>: <span class="debug-val">${f.lot_size_multiplier}x</span> &nbsp;
    <span class="debug-key">is_unhedged</span>: <span class="debug-val">${f.is_unhedged}</span><br/>
    <span class="debug-key">loss_streak_count</span>: <span class="debug-val">${f.loss_streak_count}</span> &nbsp;
    <span class="debug-key">recent_pnl_delta</span>: <span class="debug-val">₹${f.recent_pnl_delta}</span>
  `;
  panel.insertBefore(entry, panel.firstChild);
}

// Check if an active cooldown was running prior to reload
function checkPersistedCooldown() {
  const savedUntil = parseInt(localStorage.getItem("shieldfx_ext_sim_cooldown") || "0", 10);
  if (savedUntil && Date.now() < savedUntil) {
    const remainingSecs = Math.ceil((savedUntil - Date.now()) / 1000);
    const savedReasons = JSON.parse(localStorage.getItem("shieldfx_ext_sim_reasons") || "[]");
    console.warn(`⏳ Resuming active extension simulator cooldown: ${remainingSecs}s remaining`);
    startShieldFXCooldown(savedReasons, remainingSecs);
  } else {
    localStorage.removeItem("shieldfx_ext_sim_cooldown");
    localStorage.removeItem("shieldfx_ext_sim_reasons");
  }
}

// ─── ATTACH DOM LISTENERS & INIT ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("buyBtn").addEventListener("click", () => placeOrder("BUY"));
  document.getElementById("sellBtn").addEventListener("click", () => placeOrder("SELL"));
  document.getElementById("demoMode").addEventListener("change", toggleDemoMode);
  document.getElementById("btnResetSession").addEventListener("click", resetSession);

  initCandles();
  renderTicker();
  drawCandles();
  priceInterval = setInterval(tickPrice, 1200);
  telemetryInterval = setInterval(updateTimeDeltaTelemetry, 150);

  window.addEventListener('resize', drawCandles);

  // 🔒 Enforce persistent cooldown on reload
  checkPersistedCooldown();
});