from pydantic import BaseModel
from typing import Optional


class OnsenResponse(BaseModel):
    id: int
    name: str
    region: str
    quietness: float
    solo_score: float
    access_score: float
    crowd_tendency: Optional[str] = None
    memo: Optional[str] = None
    tags: Optional[str] = None

    model_config = {"from_attributes": True}


class ScoredOnsen(BaseModel):
    onsen: OnsenResponse
    score: float
