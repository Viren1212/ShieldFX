# ⚡ ShieldFX — AI Behavioral Trading Risk Management System

> **An AI-powered behavioral risk management system that detects potentially impulsive and revenge-trading behavior and provides real-time Allow, Warning, or Block interventions for retail traders.**

---

## 🎯 Problem

Retail traders can make emotionally driven decisions after losses, such as:

- Increasing position size after a loss
- Taking trades too quickly
- Continuing to trade during a losing streak
- Taking unhedged positions
- Trading despite increasing drawdown

These behavioral patterns can increase trading risk.

---

## 🛡️ ShieldFX Solution

ShieldFX focuses on **trader behavior rather than market-price prediction**.

Before a trade is executed, ShieldFX analyzes recent behavioral signals and uses a trained **Random Forest Classifier** to estimate the probability of potentially risky or revenge-trading behavior.

The decision engine then provides:

| Risk Level | Action |
|---|---|
| 🟢 Low | **ALLOW** |
| 🟡 Medium | **WARNING** |
| 🔴 High | **BLOCK + COOLDOWN** |

The goal is to provide a behavioral intervention before a potentially impulsive trade is executed.

---

## 🧠 Machine Learning Features

The final Random Forest model uses **7 behavioral features**:

1. `time_delta_seconds` — Time since the previous trade
2. `lot_size_multiplier` — Change in lot size relative to the previous trade
3. `position_size_change` — Change in position size
4. `is_unhedged` — Whether the position is unhedged
5. `loss_streak_count` — Number of consecutive losing trades
6. `recent_pnl_delta` — Recent change in P&L
7. `current_drawdown_pct` — Current drawdown percentage

The model is trained to classify trading behavior as:

- **Normal**
- **Potential Revenge**

---

## 🏗️ Architecture

```text
Trader
   ↓
Chrome Extension
   ↓
Behavioral Feature Extraction
   ↓
FastAPI Backend
   ↓
Random Forest Model
   ↓
Behavioral Risk Probability
   ↓
Decision Engine
   ↓
┌─────────┬──────────┬─────────────────┐
│  ALLOW  │ WARNING  │ BLOCK + COOLDOWN│
└─────────┴──────────┴─────────────────┘
