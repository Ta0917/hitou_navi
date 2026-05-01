from sqlalchemy import Column, Integer, String, Float, Text
from .database import Base

class Onsen(Base):
    __tablename__ = "onsen"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)        # 温泉名
    region = Column(String, nullable=False)      # 地域
    quietness = Column(Float, nullable=False)    # 静けさスコア
    solo_score = Column(Float, nullable=False)   # ソロ適性
    access_score = Column(Float, nullable=False) # アクセス難易度
    crowd_tendency = Column(String)              # 混雑傾向
    memo = Column(Text)                          # 特徴メモ
    tags = Column(String)                        # タグ（カンマ区切り）