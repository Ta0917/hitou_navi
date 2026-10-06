from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Literal
import os

from .database import get_db, engine, Base, SessionLocal
from .embeddings import Embedder
from .models import Onsen, Tag, OnsenTag
from .schemas import OnsenSummaryResponse, OnsenDetailResponse
from .search import search_onsens
from .vector_index import build_vector_index
from .admin_routes import register_handlers
from .admin_security import register_admin_routes

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.embedder = Embedder()
    db = SessionLocal()
    try:
        app.state.vector_index = build_vector_index(db)
    finally:
        db.close()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 公開エンドポイント ---

@app.get("/onsens", response_model=List[OnsenSummaryResponse])
def get_onsens(
    prefecture: Optional[str] = None,
    region: Optional[str] = None,
    area: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Onsen).options(joinedload(Onsen.onsen_tags).joinedload(OnsenTag.tag))
    if prefecture:
        q = q.filter(Onsen.prefecture == prefecture)
    if region:
        q = q.filter(Onsen.region == region)
    if area:
        q = q.filter(Onsen.area == area)
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


class TagOption(BaseModel):
    tag_id: str
    label: str


@app.get("/tags", response_model=List[TagOption])
def list_tag_options(db: Session = Depends(get_db)):
    """公開: 全タグの tag_id と label を返す（フロントの選択タグラベル→tag_id 変換用）。"""
    tags = db.query(Tag).order_by(Tag.sort_order).all()
    return [TagOption(tag_id=t.tag_id, label=t.label) for t in tags]


class SearchRequest(BaseModel):
    core: str = ""
    tag_ids: List[str] = []
    budget_max: Optional[int] = None
    prefecture: Optional[str] = None
    area: Optional[str] = None
    trip_type: Optional[Literal["day_trip", "stay"]] = None
    ic_minutes_max: Optional[int] = None            # 「最寄ICから○分以内」特殊チップ
    station_walk_minutes_max: Optional[int] = None  # 「最寄駅から徒歩○分以内」特殊チップ


class MatchedTagResponse(BaseModel):
    keyword: str
    tag_id: str
    label: str
    similarity: float


class SearchResponse(BaseModel):
    results: List[OnsenSummaryResponse]
    # コア入力の内訳（デバッグ用）：どのキーワードがタグに変換され、どれが本文類似度クエリに回ったか
    matched_tags: List[MatchedTagResponse]
    body_queries: List[str]
    name_matched_slugs: List[str]  # 施設名に部分一致した施設（フィルタではなくブースト）


@app.post("/search", response_model=SearchResponse)
def search(body: SearchRequest, request: Request, db: Session = Depends(get_db)):
    result = search_onsens(
        db=db,
        index=request.app.state.vector_index,
        embedder=request.app.state.embedder,
        core=body.core,
        tag_ids=body.tag_ids,
        budget_max=body.budget_max,
        prefecture=body.prefecture,
        area=body.area,
        trip_type=body.trip_type,
        ic_minutes_max=body.ic_minutes_max,
        station_walk_minutes_max=body.station_walk_minutes_max,
    )
    return SearchResponse(
        results=result.onsens,
        matched_tags=[
            MatchedTagResponse(keyword=m.keyword, tag_id=m.tag_id, label=m.label, similarity=m.similarity)
            for m in result.matched_tags
        ],
        body_queries=result.body_queries,
        name_matched_slugs=result.name_matched_slugs,
    )



register_admin_routes(app, register_handlers)
