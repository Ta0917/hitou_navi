from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, DateTime,
    Numeric, Enum, JSON, UniqueConstraint, ForeignKey,
)
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class Onsen(Base):
    __tablename__ = "onsens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(100), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    region = Column(String(255), nullable=False)
    prefecture = Column(String(100), nullable=False)
    address = Column(String(500))

    phone = Column(String(50))
    business_hours = Column(String(500))
    closed_days = Column(String(255))
    admission_fee = Column(String(255))
    admission_fee_min = Column(Integer)
    day_trip_available = Column(Boolean, nullable=False, default=True)
    accommodation_available = Column(Boolean, nullable=False, default=False)
    parking_available = Column(Boolean)
    wifi_available = Column(Boolean)
    established_year = Column(Integer)
    room_count = Column(Integer)

    hero_image_url = Column(String(500))
    hero_video_url = Column(String(500))
    intro_text = Column(Text)

    quietness_score = Column(TINYINT, nullable=False)
    quietness_comment = Column(Text)
    solitude_score = Column(TINYINT, nullable=False)
    solitude_comment = Column(Text)
    accessibility_score = Column(TINYINT, nullable=False)
    accessibility_comment = Column(Text)
    bathing_review = Column(Text)

    last_visited_date = Column(Date)
    info_updated_date = Column(Date)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    spring_info = relationship("OnsenSpringInfo", back_populates="onsen", uselist=False)
    accommodation = relationship("OnsenAccommodation", back_populates="onsen", uselist=False)
    access = relationship("OnsenAccess", back_populates="onsen", uselist=False)
    nearby_spots = relationship("OnsenNearbySpot", back_populates="onsen")
    photos = relationship("OnsenPhoto", back_populates="onsen")
    booking_links = relationship("OnsenBookingLinks", back_populates="onsen", uselist=False)
    onsen_tags = relationship("OnsenTag", back_populates="onsen")


class OnsenSpringInfo(Base):
    __tablename__ = "onsen_spring_info"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False, unique=True)

    spring_type = Column(String(255))
    source_name = Column(String(255))
    source_temperature = Column(Numeric(5, 1))
    ph = Column(Numeric(4, 2))
    total_dissolved_solids = Column(Numeric(12, 2))

    water_added = Column(Enum("あり", "なし", "不明"), default="不明")
    heated = Column(Enum("あり", "なし", "不明"), default="不明")
    circulation = Column(Enum("あり", "なし", "不明"), default="不明")
    disinfected = Column(Enum("あり", "なし", "不明"), default="不明")

    indoor_baths_count = Column(Integer)
    outdoor_bath = Column(Boolean)
    private_bath = Column(Boolean)
    sauna = Column(Boolean)
    cold_bath = Column(Boolean)

    source_usage_rate = Column(String(100))
    spout_temperature = Column(Numeric(5, 1))
    yuka_present = Column(Boolean)
    drinkable = Column(Boolean)
    analysis_pdf_url = Column(String(500))

    onsen = relationship("Onsen", back_populates="spring_info")


class OnsenAccommodation(Base):
    __tablename__ = "onsen_accommodation"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False, unique=True)

    room_types = Column(String(500))
    room_style = Column(Enum("和室", "洋室", "和洋室", "その他"))
    smoking_policy = Column(String(255))
    room_outdoor_bath = Column(Boolean)
    dinner_type = Column(String(255))
    breakfast_type = Column(String(255))
    room_dining = Column(Boolean)
    local_ingredients = Column(Boolean)
    facilities = Column(Text)

    signal_info = Column(String(500))
    outlet_count = Column(Integer)
    vending_machine_price = Column(String(255))
    luggage_storage = Column(Boolean)
    late_checkout_bath = Column(Boolean)

    onsen = relationship("Onsen", back_populates="accommodation")


class OnsenAccess(Base):
    __tablename__ = "onsen_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False, unique=True)

    public_transport_route = Column(Text)
    car_route = Column(Text)
    winter_road_notes = Column(Text)
    convenience_store_distance = Column(String(255))
    google_maps_embed_url = Column(String(500))
    google_maps_link_url = Column(String(500))
    latitude = Column(Numeric(10, 8))
    longitude = Column(Numeric(11, 8))

    onsen = relationship("Onsen", back_populates="access")


class OnsenNearbySpot(Base):
    __tablename__ = "onsen_nearby_spots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False)

    name = Column(String(255), nullable=False)
    distance = Column(String(100))
    transport_method = Column(String(100))
    description = Column(Text)
    latitude = Column(Numeric(10, 8))
    longitude = Column(Numeric(11, 8))
    sort_order = Column(Integer, nullable=False, default=0)

    onsen = relationship("Onsen", back_populates="nearby_spots")


class OnsenPhoto(Base):
    __tablename__ = "onsen_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False)

    url = Column(String(500), nullable=False)
    category = Column(Enum("外観", "浴場", "客室", "食事", "景観", "その他"), nullable=False)
    caption = Column(String(255))
    is_hero = Column(Boolean, nullable=False, default=False)
    is_card_thumbnail = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)

    onsen = relationship("Onsen", back_populates="photos")


class OnsenBookingLinks(Base):
    __tablename__ = "onsen_booking_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False, unique=True)

    official_website = Column(String(500))
    official_booking_url = Column(String(500))
    jalan_url = Column(String(500))
    rakuten_travel_url = Column(String(500))
    ikyu_url = Column(String(500))

    onsen = relationship("Onsen", back_populates="booking_links")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tag_id = Column(String(100), nullable=False, unique=True)
    label = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    tag_type = Column("type", Enum("normal", "interactive"), nullable=False, default="normal")
    interactive_type = Column(String(50))
    interactive_config = Column(JSON)
    is_hard_filter = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    onsen_tags = relationship("OnsenTag", back_populates="tag")


class OnsenTag(Base):
    __tablename__ = "onsen_tags"

    __table_args__ = (
        UniqueConstraint("onsen_id", "tag_id", name="uq_onsen_tag"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    onsen_id = Column(Integer, ForeignKey("onsens.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    confidence = Column(Numeric(3, 2), nullable=False)
    approved_by = Column(String(100))
    approved_at = Column(DateTime)

    onsen = relationship("Onsen", back_populates="onsen_tags")
    tag = relationship("Tag", back_populates="onsen_tags")
