from app.database import SessionLocal, engine, Base
from app.models import (
    Onsen, OnsenSpringInfo, OnsenAccess, Tag, OnsenTag,
)
from decimal import Decimal

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# --- 温泉1: 登別 ---
onsen1 = Onsen(
    slug="noboribetsu-test",
    name="登別テスト温泉",
    region="北海道登別",
    prefecture="北海道",
    address="北海道登別市登別温泉町000",
    phone="0143-00-0000",
    business_hours="10:00〜21:00",
    closed_days="無休",
    admission_fee="大人800円",
    admission_fee_min=800,
    day_trip_available=True,
    accommodation_available=False,
    parking_available=True,
    wifi_available=False,
    quietness_score=5,
    quietness_comment="周囲に民家はなく、硫黄の香りと川の音だけが響く。",
    solitude_score=4,
    solitude_comment="平日の午前中は他の入浴客がほぼ来ない。",
    accessibility_score=3,
    accessibility_comment="JR登別駅からバスで15分。本数は1時間に1本程度。",
    bathing_review="硫黄泉特有のとろみがあり、入浴後は肌がしっとりする。",
)
db.add(onsen1)
db.flush()

db.add(OnsenSpringInfo(
    onsen_id=onsen1.id,
    spring_type="含硫黄-ナトリウム-塩化物泉",
    source_name="大湯沼源泉",
    source_temperature=Decimal("78.5"),
    ph=Decimal("2.30"),
    water_added="なし",
    heated="なし",
    circulation="なし",
    disinfected="なし",
    outdoor_bath=True,
    private_bath=False,
    sauna=False,
    drinkable=False,
))

db.add(OnsenAccess(
    onsen_id=onsen1.id,
    public_transport_route="JR登別駅から道南バス「登別温泉」行きで15分",
    car_route="道央自動車道・登別ICから道道2号線で約10分",
    latitude=Decimal("42.44000000"),
    longitude=Decimal("141.10000000"),
))

# --- 温泉2: 乳頭 ---
onsen2 = Onsen(
    slug="nyuto-tsurunoyu",
    name="鶴の湯テスト温泉",
    region="秋田県乳頭温泉郷",
    prefecture="秋田県",
    address="秋田県仙北市田沢湖先達沢国有林50",
    phone="0187-00-0000",
    business_hours="10:00〜15:00（日帰り）",
    closed_days="不定休",
    admission_fee="大人600円",
    admission_fee_min=600,
    day_trip_available=True,
    accommodation_available=True,
    parking_available=True,
    wifi_available=False,
    room_count=12,
    quietness_score=5,
    quietness_comment="ブナ林に囲まれた秘境。携帯電波は圏外で完全な静寂がある。",
    solitude_score=5,
    solitude_comment="宿泊すれば朝方に貸切に近い状態で入浴できる。",
    accessibility_score=2,
    accessibility_comment="田沢湖駅からバスで50分。冬期は路面凍結に注意が必要。",
    bathing_review="白濁した硫黄泉と露天の乳白色の湯が特徴的。冬の雪見露天は絶景。",
)
db.add(onsen2)
db.flush()

db.add(OnsenSpringInfo(
    onsen_id=onsen2.id,
    spring_type="含硫黄-カルシウム・マグネシウム-炭酸水素塩・硫酸塩泉",
    source_name="鶴の湯源泉",
    source_temperature=Decimal("51.0"),
    ph=Decimal("6.70"),
    water_added="なし",
    heated="なし",
    circulation="なし",
    disinfected="なし",
    outdoor_bath=True,
    private_bath=False,
    sauna=False,
    drinkable=False,
))

db.add(OnsenAccess(
    onsen_id=onsen2.id,
    public_transport_route="JR田沢湖駅からバスで50分（乳頭温泉郷経由）",
    car_route="秋田自動車道・西仙北SICから国道46号・県道194号で約1時間",
    winter_road_notes="11月〜4月は路面凍結・積雪あり。スタッドレスタイヤ必須。",
    latitude=Decimal("39.75000000"),
    longitude=Decimal("140.73000000"),
))

# --- タグ ---
tag_quiet = Tag(
    tag_id="quiet_priority",
    label="静けさ最優先",
    description="騒がしい環境を避け、静寂の中で入浴したい。人の声や音楽が聞こえない、自然音だけの秘境感を求めている。",
    tag_type="normal",
    is_hard_filter=False,
    sort_order=1,
)
tag_solo = Tag(
    tag_id="solo_friendly",
    label="一人旅向き",
    description="一人で気兼ねなく利用できる温泉。グループや家族連れが少なく、ソロ入浴客が自然と集まる雰囲気がある。",
    tag_type="normal",
    is_hard_filter=False,
    sort_order=2,
)
tag_no_car = Tag(
    tag_id="no_car_ok",
    label="車なしでOK",
    description="公共交通機関のみで無理なくアクセスできる。電車・バスの本数が多く、移動が苦にならない。",
    tag_type="normal",
    is_hard_filter=False,
    sort_order=3,
)
db.add_all([tag_quiet, tag_solo, tag_no_car])
db.flush()

db.add_all([
    OnsenTag(onsen_id=onsen1.id, tag_id=tag_quiet.id, confidence=Decimal("0.93"), approved_by="admin"),
    OnsenTag(onsen_id=onsen1.id, tag_id=tag_solo.id,  confidence=Decimal("0.82"), approved_by="admin"),
    OnsenTag(onsen_id=onsen1.id, tag_id=tag_no_car.id, confidence=Decimal("0.70"), approved_by="admin"),
    OnsenTag(onsen_id=onsen2.id, tag_id=tag_quiet.id, confidence=Decimal("0.97"), approved_by="admin"),
    OnsenTag(onsen_id=onsen2.id, tag_id=tag_solo.id,  confidence=Decimal("0.91"), approved_by="admin"),
])

db.commit()
db.close()

print("Seed data inserted.")
