"""Optional FastAPI/GeoPandas implementation for synthetic CASHNET geography."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from shapely.geometry import Point
from sklearn.cluster import DBSCAN

ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = ROOT / "services" / "geospatial" / "data" / "synthetic-geospatial.json"
app = FastAPI(title="CASHNET synthetic geospatial provider", version="0.1.0")


def load_data() -> dict:
    if not DATA_FILE.exists():
        raise HTTPException(
            503,
            "Synthetic data is not seeded. Run scripts/generate_synthetic_geo_data.py first.",
        )
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def records_frame(records: list[dict]) -> gpd.GeoDataFrame:
    frame = pd.DataFrame(records)
    if frame.empty:
        return gpd.GeoDataFrame(frame, geometry=[], crs="EPSG:4326")
    return gpd.GeoDataFrame(
        frame,
        geometry=[
            Point(lng, lat)
            for lat, lng in zip(frame.latitude, frame.longitude, strict=True)
        ],
        crs="EPSG:4326",
    )


def filtered(
    records: list[dict],
    city: str | None,
    state: str | None,
    district: str | None,
    fraud_type: str | None,
    risk_category: str | None,
    location_type: str | None,
    min_amount: float | None,
    max_amount: float | None,
    min_risk_score: int | None,
) -> list[dict]:
    return [
        item
        for item in records
        if (not city or item["city"] == city)
        and (not state or item["state"] == state)
        and (not district or item["district"] == district)
        and (not fraud_type or item["fraud_type"] == fraud_type)
        and (not risk_category or item["risk_category"] == risk_category)
        and (not location_type or item["location_type"] == location_type)
        and (min_amount is None or item["amount"] >= min_amount)
        and (max_amount is None or item["amount"] <= max_amount)
        and (min_risk_score is None or item["risk_score"] >= min_risk_score)
    ]


def hotspots(records: list[dict]) -> list[dict]:
    """Cluster in a metre CRS. Scores are calculated, never pre-filled."""
    points = records_frame(records)
    if len(points) < 5:
        return []
    projected = points.to_crs("EPSG:3857")
    labels = DBSCAN(eps=1750, min_samples=5).fit_predict(
        np.c_[projected.geometry.x, projected.geometry.y]
    )
    points["cluster"] = labels
    output = []
    valid = points[points.cluster >= 0]
    if valid.empty:
        return output
    groups = list(valid.groupby("cluster"))
    max_count = max(len(group) for _, group in groups)
    max_amount = max(float(group.amount.sum()) for _, group in groups)
    newest = pd.to_datetime(valid.timestamp).max()
    oldest = pd.to_datetime(valid.timestamp).min()
    span = max((newest - oldest).total_seconds(), 1)
    for label, group in groups:
        centre = group.to_crs("EPSG:3857").unary_union.centroid
        centre_wgs = (
            gpd.GeoSeries([centre], crs="EPSG:3857").to_crs("EPSG:4326").iloc[0]
        )
        recency = (
            pd.to_datetime(group.timestamp).max() - oldest
        ).total_seconds() / span
        score = 100 * (
            0.4 * len(group) / max_count
            + 0.25 * group.risk_score.mean() / 100
            + 0.2 * float(group.amount.sum()) / max_amount
            + 0.15 * recency
        )
        distribution = Counter(group.fraud_type)
        output.append(
            {
                "cluster_id": f"HSP-{int(label) + 1:02}",
                "transaction_count": len(group),
                "total_amount": round(float(group.amount.sum())),
                "average_amount": round(float(group.amount.mean())),
                "maximum_amount": round(float(group.amount.max())),
                "risk_average": round(float(group.risk_score.mean())),
                "risk_max": int(group.risk_score.max()),
                "first_transaction": group.timestamp.min(),
                "last_transaction": group.timestamp.max(),
                "centroid_latitude": centre_wgs.y,
                "centroid_longitude": centre_wgs.x,
                "fraud_type_distribution": dict(distribution),
                "primary_fraud_type": distribution.most_common(1)[0][0],
                "historical_score": round(min(score, 100)),
                "city": group.city.mode().iat[0],
                "data_source": "SYNTHETIC",
            }
        )
    return sorted(output, key=lambda item: item["historical_score"], reverse=True)


@app.get("/api/geospatial/historical-transactions")
def historical_transactions(
    city: str | None = None,
    state: str | None = None,
    district: str | None = None,
    fraud_type: str | None = None,
    risk_category: str | None = None,
    location_type: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    min_risk_score: int | None = None,
):
    records = filtered(
        load_data()["transactions"],
        city,
        state,
        district,
        fraud_type,
        risk_category,
        location_type,
        min_amount,
        max_amount,
        min_risk_score,
    )
    return {"data_source": "SYNTHETIC", "total": len(records), "transactions": records}


@app.get("/api/geospatial/historical-hotspots")
def historical_hotspots(
    city: str | None = None,
    state: str | None = None,
    district: str | None = None,
    fraud_type: str | None = None,
    risk_category: str | None = None,
    location_type: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    min_risk_score: int | None = None,
):
    records = filtered(
        load_data()["transactions"],
        city,
        state,
        district,
        fraud_type,
        risk_category,
        location_type,
        min_amount,
        max_amount,
        min_risk_score,
    )
    return {"data_source": "SYNTHETIC", "hotspots": hotspots(records)}
