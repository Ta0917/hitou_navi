from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional, List
import os

from .database import get_db, engine, Base
from .models import Onsen
from .schemas import OnsenResponse, ScoredOnsen

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/onsen/top3/result", response_model=List[ScoredOnsen])
def get_top3(
    quietness_weight: float = Query(0.5),
    solo_weight: float = Query(0.3),
    access_weight: float = Query(0.2),
    db: Session = Depends(get_db)
):
    onsen_list = db.query(Onsen).all()
    scored = []
    for o in onsen_list:
        score = (
            o.quietness * quietness_weight +
            o.solo_score * solo_weight +
            o.access_score * access_weight
        )
        scored.append({"onsen": o, "score": score})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:3]

@app.get("/onsen", response_model=List[OnsenResponse])
def get_onsen_list(
    region: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Onsen)
    if region:
        query = query.filter(Onsen.region == region)
    return query.all()

@app.get("/onsen/{onsen_id}", response_model=OnsenResponse)
def get_onsen_detail(onsen_id: int, db: Session = Depends(get_db)):
    return db.query(Onsen).filter(Onsen.id == onsen_id).first()