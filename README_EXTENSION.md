# ⚡ ShieldFX Chrome Extension — User & Deployment Guide

> **AI Behavioral Trading Copilot & Revenge Shield**  
> Intercepts high-risk revenge trades, emotional tilt, and oversized positions in real-time across **Zerodha Kite**, **Groww**, **Binance**, and external web trading platforms.

---

## 📁 Extension Location

The extension is ready to load directly from either directory:
- `c:\Users\RADHE SHYAM\OneDrive\Desktop\Shield FX VIREN\ShieldFX_Chrome_Extension`
- `c:\Users\RADHE SHYAM\OneDrive\Desktop\Shield FX VIREN\Front End\ShieldFX_Chrome_Extension`

---

## 🚀 How to Install in Google Chrome (30 Seconds)

1. Open **Google Chrome** and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Browse to and select the `ShieldFX_Chrome_Extension` folder.
5. **Done!** The ⚡ **ShieldFX** extension icon will appear in your Chrome toolbar. Pin it for easy access.

---

## 🌐 Supported Trading Platforms

| Broker / Platform | Supported URLs | Detection Mode |
| :--- | :--- | :--- |
| **Zerodha Kite** | `kite.zerodha.com/*` | Order Window, Buy/Sell triggers, Intraday MIS |
| **Groww** | `groww.in/*` | Stock & F&O Order Pads, Buy/Sell execution |
| **Binance** | `binance.com/*` | Spot & USDT-M / Coin-M Futures Order Forms |
| **Upstox Pro** | `pro.upstox.com/*` | Heuristic Universal Interceptor |
| **Angel One** | `trade.angelone.in/*` | Heuristic Universal Interceptor |
| **TradingView** | `tradingview.com/*` | Broker Panel Order Interception |
| **ShieldFX Simulator** | `Front End/shieldfx_simulator.html` | Built-in Testing & Verification Engine |

---

## 🧠 How ShieldFX ML Guard Operates

ShieldFX uses a **Random Forest ML model** trained on trade behavior telemetry to classify order risk in real time before execution:

```
┌────────────────────────────────────────────────────────┐
│              1. Trader clicks BUY or SELL               │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│       2. Content Script extracts 5 ML Features:        │
│  • time_delta_seconds (Time since last trade)          │
│  • lot_size_multiplier (Current lot / Prev lot)        │
│  • is_unhedged (Directional unhedged exposure)         │
│  • loss_streak_count (Consecutive losses)              │
│  • recent_pnl_delta (Last resolved P&L)                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│     3. Query Backend (http://127.0.0.1:8000/predict)   │
└──────────────────────────┬─────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
  [LOW RISK: <45%]   [MEDIUM: 45-65%]   [HIGH: >=65%]
   Action: ALLOW      Action: WARN       Action: BLOCK
   Order executes    Advisory toast     🚨 60s Full-Screen
   unhindered.       on broker page.    Lockdown Modal.
```

---

## 🛠️ Testing the Extension

### Method 1: On the ShieldFX Simulator
1. Start the FastAPI backend:
   ```powershell
   cd "c:\Users\RADHE SHYAM\OneDrive\Desktop\Shield FX VIREN\Backend"
   uvicorn main:app --reload --port 8000
   ```
2. Open `Front End/shieldfx_simulator.html` in Chrome.
3. Check the **🎬 Demo Mode** checkbox to trigger a losing sequence.
4. Escalate lot sizes rapidly — watch ShieldFX intercept the trade with the **60-Second Full-Screen Lockdown Modal**!

### Method 2: On Live Broker Pages (Zerodha / Groww / Binance)
1. Open [Zerodha Kite](https://kite.zerodha.com) or [Groww](https://groww.in).
2. The **Floating ShieldFX HUD** appears in the bottom right corner showing:
   - Active platform status
   - Live Revenge / Tilt Risk Meter (0–100%)
   - Loss streak counter
   - Manual `+1 Loss` / `Reset` / `Test Demo` quick buttons
3. Click the extension toolbar icon to view session statistics or click **Test Demo Revenge Block** to preview the full-screen lockdown.

---

## ⚙️ Configuration & Options
Click the extension icon -> **⚙️ Settings** (or right-click extension -> Options) to configure:
- **FastAPI Endpoint URL** (Default: `http://127.0.0.1:8000`)
- **Lockdown Cooldown Duration** (30s, 60s, 120s, 300s)
- **Strict Mode** (Requires explicit confirmation on medium-risk trades)
- **Real-Time DOM Interception Toggle**
