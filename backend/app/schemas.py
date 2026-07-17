from pydantic import BaseModel
from typing import Optional, List, Any, Literal
from decimal import Decimal
from datetime import date, datetime


class OnsenSpringInfoResponse(BaseModel):
    id: int
    onsen_id: int
    spring_type: Optional[str] = None
    source_name: Optional[str] = None
    source_temperature: Optional[Decimal] = None
    ph: Optional[Decimal] = None
    total_dissolved_solids: Optional[Decimal] = None
    water_added: Optional[Literal["あり", "なし", "不明"]] = None
    heated: Optional[Literal["あり", "なし", "不明"]] = None
    circulation: Optional[Literal["あり", "なし", "不明"]] = None
    disinfected: Optional[Literal["あり", "なし", "不明"]] = None
    indoor_baths_count: Optional[int] = None
    outdoor_bath: Optional[bool] = None
    private_bath: Optional[bool] = None
    sauna: Optional[bool] = None
    cold_bath: Optional[bool] = None
    source_usage_rate: Optional[str] = None
    spout_temperature: Optional[Decimal] = None
    yuka_present: Optional[bool] = None
    drinkable: Optional[bool] = None
    analysis_pdf_url: Optional[str] = None

    model_config = {"from_attributes": True}


class OnsenAccommodationResponse(BaseModel):
    id: int
    onsen_id: int
    room_types: Optional[str] = None
    room_style: Optional[Literal["和室", "洋室", "和洋室", "その他"]] = None
    smoking_policy: Optional[str] = None
    room_outdoor_bath: Optional[bool] = None
    dinner_type: Optional[str] = None
    breakfast_type: Optional[str] = None
    room_dining: Optional[bool] = None
    local_ingredients: Optional[bool] = None
    facilities: Optional[str] = None
    signal_info: Optional[str] = None
    outlet_count: Optional[int] = None
    vending_machine_price: Optional[str] = None
    luggage_storage: Optional[bool] = None
    late_checkout_bath: Optional[bool] = None

    model_config = {"from_attributes": True}


class OnsenAccessResponse(BaseModel):
    id: int
    onsen_id: int
    public_transport_route: Optional[str] = None
    car_route: Optional[str] = None
    winter_road_notes: Optional[str] = None
    convenience_store_distance: Optional[str] = None
    google_maps_embed_url: Optional[str] = None
    google_maps_link_url: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    nearest_ic_minutes: Optional[int] = None
    nearest_station_walk_minutes: Optional[int] = None

    model_config = {"from_attributes": True}


class OnsenNearbySpotResponse(BaseModel):
    id: int
    onsen_id: int
    name: str
    distance: Optional[str] = None
    transport_method: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    sort_order: int

    model_config = {"from_attributes": True}


class OnsenPhotoResponse(BaseModel):
    id: int
    onsen_id: int
    url: str
    category: Literal["外観", "浴場", "客室", "食事", "景観", "その他"]
    caption: Optional[str] = None
    is_hero: bool
    is_card_thumbnail: bool
    sort_order: int

    model_config = {"from_attributes": True}


class OnsenBookingLinksResponse(BaseModel):
    id: int
    onsen_id: int
    official_website: Optional[str] = None
    official_booking_url: Optional[str] = None
    jalan_url: Optional[str] = None
    rakuten_travel_url: Optional[str] = None
    ikyu_url: Optional[str] = None

    model_config = {"from_attributes": True}


class TagResponse(BaseModel):
    id: int
    tag_id: str
    label: str
    description: str
    tag_type: Literal["normal", "interactive"]
    interactive_type: Optional[str] = None
    interactive_config: Optional[Any] = None
    is_hard_filter: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class OnsenTagResponse(BaseModel):
    id: int
    onsen_id: int
    tag_id: int
    confidence: Decimal
    status: Literal["proposed", "approved", "rejected"]
    created_at: datetime
    updated_at: datetime
    tag: TagResponse

    model_config = {"from_attributes": True}


class OnsenSummaryResponse(BaseModel):
    id: int
    slug: str
    name: str
    region: str
    prefecture: str
    area: str
    quietness_score: int
    solitude_score: int
    accessibility_score: int
    hero_image_url: Optional[str] = None
    day_trip_available: bool
    accommodation_available: bool
    admission_fee_min: Optional[int] = None
    lodging_fee_min: Optional[int] = None
    tags: List[str] = []

    model_config = {"from_attributes": True}


class OnsenDetailResponse(BaseModel):
    id: int
    slug: str
    name: str
    region: str
    prefecture: str
    area: str
    address: Optional[str] = None
    phone: Optional[str] = None
    business_hours: Optional[str] = None
    closed_days: Optional[str] = None
    admission_fee: Optional[str] = None
    admission_fee_min: Optional[int] = None
    lodging_fee_min: Optional[int] = None
    day_trip_available: bool
    accommodation_available: bool
    parking_available: Optional[bool] = None
    wifi_available: Optional[bool] = None
    established_year: Optional[int] = None
    room_count: Optional[int] = None
    hero_image_url: Optional[str] = None
    hero_video_url: Optional[str] = None
    intro_text: Optional[str] = None
    quietness_score: int
    quietness_comment: Optional[str] = None
    solitude_score: int
    solitude_comment: Optional[str] = None
    accessibility_score: int
    accessibility_comment: Optional[str] = None
    bathing_review: Optional[str] = None
    last_visited_date: Optional[date] = None
    info_updated_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    spring_info: Optional[OnsenSpringInfoResponse] = None
    accommodation: Optional[OnsenAccommodationResponse] = None
    access: Optional[OnsenAccessResponse] = None
    nearby_spots: List[OnsenNearbySpotResponse] = []
    photos: List[OnsenPhotoResponse] = []
    booking_links: Optional[OnsenBookingLinksResponse] = None
    onsen_tags: List[OnsenTagResponse] = []

    model_config = {"from_attributes": True}
