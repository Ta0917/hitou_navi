"""Development CRUD handlers, mounted only with server-side authentication."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List

from fastapi import Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    Onsen, OnsenSpringInfo, OnsenAccommodation, OnsenAccess,
    OnsenNearbySpot, OnsenPhoto, OnsenBookingLinks, Tag, OnsenTag,
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


# --- 管理エンドポイント ---

_AUTO_COLS = {"id", "created_at", "updated_at"}


def list_tables():
    return list(TABLE_MAP.keys())


def get_columns(table_name: str):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    return [c.name for c in model.__table__.columns if c.name not in _AUTO_COLS]


def get_records(table_name: str, db: Session = Depends(get_db)):
    model = TABLE_MAP.get(table_name)
    if model is None:
        raise HTTPException(status_code=404, detail="Table not found")
    records = db.query(model).all()
    return [_record_to_dict(r) for r in records]


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


def register_handlers(router):
    router.add_api_route("/tables", list_tables, methods=["GET"], response_model=List[str])
    router.add_api_route("/tables/{table_name}/columns", get_columns, methods=["GET"], response_model=List[str])
    router.add_api_route("/tables/{table_name}", get_records, methods=["GET"])
    router.add_api_route("/tables/{table_name}", create_record, methods=["POST"])
    router.add_api_route("/tables/{table_name}/{record_id}", delete_record, methods=["DELETE"])
