from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Literal
import joblib

app = FastAPI(title="ShieldFX Prediction API")

# Chrome extension / simulator CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load trained model once at startup
model = joblib.load("model2.pkl")

# Single source of truth for feature order — MUST match training exactly
FEATURE_ORDER = [
    "time_delta_seconds",
    "lot_size_multiplier",
    "is_unhedged",
    "loss_streak_count",
    "recent_pnl_delta",
]

# Empirically tuned thresholds from held-out test sweep (1,000 trades)
MEDIUM_RISK_THRESHOLD = 0.45
HIGH_RISK_THRESHOLD = 0.65


class TradeFeatures(BaseModel):
    time_delta_seconds: float = Field(..., ge=0)
    lot_size_multiplier: float = Field(..., gt=0)
    is_unhedged: int = Field(..., ge=0, le=1)
    loss_streak_count: int = Field(..., ge=0)
    recent_pnl_delta: float


class PredictionResponse(BaseModel):
    probability: float
    risk_tier: Literal["LOW", "MEDIUM", "HIGH"]
    action: Literal["ALLOW", "WARN", "BLOCK"]
    is_revenge_trade: bool
    reasons: List[str]


def generate_descriptive_reasons(features: TradeFeatures) -> List[str]:
    """
    Descriptive behavioral layer: Highlights notable anomalous dimensions
    present in the order context. Note: Actual ML classification is determined
    by multi-feature Random Forest splits.
    """
    reasons = []

    # Standalone Lot Escalation check
    if features.lot_size_multiplier >= 2.0:
        reasons.append(f"Position size escalated by {features.lot_size_multiplier:.1f}x vs previous trade")
    elif features.lot_size_multiplier > 1.3:
        reasons.append(f"Position size increased by {features.lot_size_multiplier:.1f}x")

    # Execution Speed check
    if features.time_delta_seconds < 10.0:
        reasons.append(f"Rapid execution ({features.time_delta_seconds:.1f}s after previous trade)")
    elif features.time_delta_seconds < 25.0:
        reasons.append(f"Fast trade turnaround ({features.time_delta_seconds:.1f}s)")

    # Unhedged Exposure check
    if features.is_unhedged == 1:
        reasons.append("Unhedged / naked directional exposure")

    # Loss Streak check
    if features.loss_streak_count >= 2:
        reasons.append(f"Active losing streak ({features.loss_streak_count} consecutive losses)")
    elif features.loss_streak_count == 1:
        reasons.append("Immediate entry following a previous loss")

    # Drawdown check
    if features.recent_pnl_delta < -2000.0:
        reasons.append(f"Recent trade closed at substantial loss (-₹{abs(features.recent_pnl_delta):.2f})")

    return reasons


@app.post("/predict", response_model=PredictionResponse)
def predict(features: TradeFeatures):
    try:
        row = [[getattr(features, f) for f in FEATURE_ORDER]]
        prob = float(model.predict_proba(row)[0][1])

        # 3-Tier Risk Hierarchy
        if prob >= HIGH_RISK_THRESHOLD:
            risk_tier = "HIGH"
            action = "BLOCK"
            is_revenge = True
        elif prob >= MEDIUM_RISK_THRESHOLD:
            risk_tier = "MEDIUM"
            action = "WARN"
            is_revenge = False
        else:
            risk_tier = "LOW"
            action = "ALLOW"
            is_revenge = False

        reasons = (
            generate_descriptive_reasons(features)
            if risk_tier in ["MEDIUM", "HIGH"]
            else []
        )

        return PredictionResponse(
            probability=round(prob, 4),
            risk_tier=risk_tier,
            action=action,
            is_revenge_trade=is_revenge,
            reasons=reasons,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}