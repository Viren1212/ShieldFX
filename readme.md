# ⚡ ShieldFX — AI Behavioral Trading Guard & Revenge Shield

> **Real-time AI behavioral copilot that intercepts high-risk revenge trades, enforces cooldown periods, and protects retail trading capital across Zerodha, Groww, Binance, and web trading terminals.**

---

## 🎯 Problem Statement
Over **90% of retail traders lose capital** not from faulty strategies, but from psychological breakdown — emotional tilt, aggressive lot-size doubling, and rapid-fire revenge trading following drawdowns.

## 🛡️ The ShieldFX Solution
ShieldFX acts as an invisible, sub-10ms AI behavioral guard that intercepts orders before they hit the broker API. Using a trained **Random Forest Classifier**, it evaluates 5 core behavioral telemetry dimensions:
1. **`time_delta_seconds`**: Turnaround speed since previous trade.
2. **`lot_size_multiplier`**: Position sizing escalation relative to baseline.
3. **`is_unhedged`**: Naked directional risk vs. hedged spread.
4. **`loss_streak_count`**: Number of consecutive losing trades.
5. **`recent_pnl_delta`**: Cumulative loss/drawdown magnitude.

---

## 🚀 Key Features & Architecture
- 🧠 **FastAPI Machine Learning Service**: Micro-latency REST endpoint serving predictions in `< 10ms`.
- 📈 **Trading Terminal & Simulator (`shieldfx_simulator.html`)**: High-DPI candlestick chart with **EMA 9**, **EMA 21**, **Bollinger Bands**, and **Volume Histogram**.
- ⚡ **Multi-Broker Testbench (`broker_demo.html`)**: Interactive mock terminal supporting **Zerodha Kite**, **Groww Pro**, and **Binance Futures**.
- 🧩 **Manifest V3 Chrome Extension**: Live browser extension injecting order interception, floating HUD, and a reload-proof 60-second cooldown lock.

---

## 🛠️ Quick Start Guide

### 1. Start the Machine Learning Backend
```bash
cd Backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000