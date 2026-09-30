from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Literal
import joblib


app = FastAPI(title="ShieldFX Prediction API")


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Load trained model
# ============================================================

model_artifact = joblib.load("rf_model.pkl")

model = model_artifact["model"]
FEATURE_ORDER = model_artifact["features"]
MODEL_THRESHOLD = model_artifact["threshold"]


# ============================================================
# ShieldFX Risk Thresholds
# ============================================================

# Binary ML threshold selected during validation
REVENGE_THRESHOLD = MODEL_THRESHOLD

# Product-level risk bands
MEDIUM_RISK_THRESHOLD = 0.35
HIGH_RISK_THRESHOLD = REVENGE_THRESHOLD


# ============================================================
# Input Schema
# ============================================================

class TradeFeatures(BaseModel):

    time_delta_seconds: float = Field(..., ge=0)

    lot_size_multiplier: float = Field(..., gt=0)

    position_size_change: float = Field(..., gt=0)

    is_unhedged: int = Field(..., ge=0, le=1)

    loss_streak_count: int = Field(..., ge=0)

    recent_pnl_delta: float

    current_drawdown_pct: float = Field(..., ge=0)


# ============================================================
# Response Schema
# ============================================================

class PredictionResponse(BaseModel):

    probability: float

    risk_tier: Literal["LOW", "MEDIUM", "HIGH"]

    action: Literal["ALLOW", "WARN", "BLOCK"]

    is_revenge_trade: bool

    reasons: List[str]


# ============================================================
# Descriptive Reasons
# ============================================================

def generate_descriptive_reasons(
    features: TradeFeatures
) -> List[str]:

    reasons = []

    # Position sizing
    if features.lot_size_multiplier >= 2.0:
        reasons.append(
            f"Position size escalated by "
            f"{features.lot_size_multiplier:.1f}x"
        )

    elif features.lot_size_multiplier > 1.3:
        reasons.append(
            f"Position size increased by "
            f"{features.lot_size_multiplier:.1f}x"
        )

    # Rapid execution
    if features.time_delta_seconds < 10.0:
        reasons.append(
            f"Rapid execution "
            f"({features.time_delta_seconds:.1f}s after previous trade)"
        )

    elif features.time_delta_seconds < 25.0:
        reasons.append(
            f"Fast trade turnaround "
            f"({features.time_delta_seconds:.1f}s)"
        )

    # Position size change
    if features.position_size_change > 1.7:
        reasons.append(
            f"Large position-size change "
            f"({features.position_size_change:.2f}x)"
        )

    # Unhedged exposure
    if features.is_unhedged == 1:
        reasons.append(
            "Unhedged / naked directional exposure"
        )

    # Loss streak
    if features.loss_streak_count >= 2:
        reasons.append(
            f"Active losing streak "
            f"({features.loss_streak_count} consecutive losses)"
        )

    elif features.loss_streak_count == 1:
        reasons.append(
            "Immediate entry following a previous loss"
        )

    # Recent loss
    if features.recent_pnl_delta < -2000:
        reasons.append(
            f"Recent trade closed at substantial loss "
            f"(-₹{abs(features.recent_pnl_delta):.2f})"
        )

    # Drawdown
    if features.current_drawdown_pct > 10:
        reasons.append(
            f"Elevated account drawdown "
            f"({features.current_drawdown_pct:.1f}%)"
        )

    return reasons


# ============================================================
# Prediction Endpoint
# ============================================================

@app.post(
    "/predict",
    response_model=PredictionResponse
)
def predict(features: TradeFeatures):

    try:

        # Maintain exact training feature order
        row = [[
            getattr(features, feature)
            for feature in FEATURE_ORDER
        ]]

        # Random Forest probability
        prob = float(
            model.predict_proba(row)[0][1]
        )

        # ----------------------------------------------------
        # Three-tier ShieldFX risk system
        # ----------------------------------------------------

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

        # Generate explanations for elevated risk
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

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "model": "Random Forest",
        "threshold": MODEL_THRESHOLD
    }