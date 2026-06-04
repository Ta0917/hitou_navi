from pydantic import BaseModel
from typing import Optional


class ItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}
