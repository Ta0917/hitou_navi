from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Any
from decimal import Decimal
from datetime import date, datetime
import os

from .database import get_db, engine, Base
from .models import (
    Onsen, OnsenSpringInfo, OnsenAccommodation, OnsenAccess,
    OnsenNearbySpot, OnsenPhoto, OnsenBookingLinks, Tag, OnsenTag,
)
from .schemas import OnsenSummaryResponse, OnsenDetailResponse

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TABLE_MAP = {
    "onsens": Onsen,
    "onsen_spring_info": OnsenSpringInfo,
    "onsen_accommodation": OnsenAccommodation,
    "onsen_access": OnsenAccess,
    "onsen_nearby_spots": OnsenNearbySpot,
    "onsen_photos": OnsenPhoto,
    "onsen_booking_links": OnsenBookingLinks,
    "tags": Tag,
    "onsen_tags": OnsenTag,
}


def _to_json_safe(val: Any) -> Any:
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val


def _record_to_dict(record: Any) -> dict:
    return {
        k: _to_json_safe(v)
        for k, v in record.__dict__.items()
        if k != "_sa_instance_state"
    }


# --- 公開エンドポイント ---

@app.get("/onsens", response_model=List[OnsenSummaryResponse])
def get_onsens(
    prefecture: Optional[str] = None,
    region: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Onsen)
    if prefecture:
        q = q.filter(Onsen.prefecture == prefecture)
    if region:
        q = q.filter(Onsen.region == region)
    return q.all()


@app.get("/onsens/{slug}", response_model=OnsenDetailResponse)
def get_onsen(slug: str, db: Session = Depends(get_db)):
    onsen = (
        db.query(Onsen)
        .options(
            joinedload(Onsen.spring_info),
            joinedload(Onsen.accommodation),
            joinedload(Onsen.access),
            joinedload(Onsen.nearby_spots),
            joinedload(Onsen.photos),
            joinedload(Onsen.booking_links),
            joinedload(Onsen.onsen_tags).joinedload(OnsenTag.tag),
        )
        .filter(Onsen.slug == slug)
        .first()
    )
    if onsen is None:
        raise HTTPException(status_code=404, detail="Onsen not found")
    return onsen


# --- 管理エンドポイント ---

_AUTO_COLS = {"id", "created_at", "updated_at"}


@app.get("/admin/tables", response_model=List[str])
def list_tables():
    return list(TABLE_MAP.keys())


@app.get("/admin/tables/{table_name}/columns", response_model=List[str])
def get_columns(table_name: str):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    return [c.name for c in model.__table__.columns if c.name not in _AUTO_COLS]


@app.get("/admin/tables/{table_name}")
def get_records(table_name: str, db: Session = Depends(get_db)):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    records = db.query(model).all()
    return [_record_to_dict(r) for r in records]


@app.post("/admin/tables/{table_name}")
def create_record(
    table_name: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    record = model(**body)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _record_to_dict(record)


@app.delete("/admin/tables/{table_name}/{record_id}")
def delete_record(table_name: str, record_id: int, db: Session = Depends(get_db)):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    record = db.query(model).filter(model.id == record_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"ok": True}
