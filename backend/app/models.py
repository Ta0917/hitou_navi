from sqlalchemy import Column, Integer, String, Float, Text
from .database import Base

class Onsen(Base):
    __tablename__ = "onsen"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    region = Column(String(100), nullable=False)
    quietness = Column(Float, nullable=False)
    solo_score = Column(Float, nullable=False)
    access_score = Column(Float, nullable=False)
    crowd_tendency = Column(String(100))
    memo = Column(Text)
    tags = Column(String(500))