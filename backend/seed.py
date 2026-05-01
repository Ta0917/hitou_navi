from app.database import SessionLocal, engine, Base
from app.models import Onsen

Base.metadata.create_all(bind=engine)

db = SessionLocal()

onsen_data = [
    Onsen(name="奥鬼怒温泉", region="栃木", quietness=9.5, solo_score=8.0, access_score=3.0, crowd_tendency="少ない", memo="秘湯中の秘湯。車道なし。", tags="秘湯,自然,混浴"),
    Onsen(name="乳頭温泉郷", region="秋田", quietness=8.5, solo_score=7.5, access_score=5.0, crowd_tendency="普通", memo="鶴の湯が有名。雪見風呂が最高。", tags="雪見,露天,秘湯"),
    Onsen(name="野沢温泉", region="長野", quietness=7.0, solo_score=8.5, access_score=6.0, crowd_tendency="普通", memo="外湯めぐりがソロに最適。", tags="外湯,村,歴史"),
    Onsen(name="銀山温泉", region="山形", quietness=7.5, solo_score=6.0, access_score=5.5, crowd_tendency="多い", memo="大正ロマンの街並み。夜が美しい。", tags="レトロ,夜景,川沿い"),
    Onsen(name="湯の花温泉", region="京都", quietness=8.0, solo_score=7.0, access_score=6.5, crowd_tendency="少ない", memo="京都市内から近い穴場。", tags="穴場,日帰り,自然"),
    Onsen(name="三朝温泉", region="鳥取", quietness=7.5, solo_score=7.0, access_score=5.0, crowd_tendency="普通", memo="ラジウム泉で有名。川沿いの露天あり。", tags="ラジウム,露天,川沿い"),
    Onsen(name="湯布院温泉", region="大分", quietness=5.0, solo_score=5.0, access_score=8.0, crowd_tendency="多い", memo="観光地化が進んでいる。静けさは低め。", tags="観光,湖,人気"),
    Onsen(name="栄之尾温泉", region="鹿児島", quietness=9.0, solo_score=8.5, access_score=3.5, crowd_tendency="少ない", memo="屋久島の秘湯。自然の中に溶け込む。", tags="秘湯,屋久島,自然"),
    Onsen(name="谷地温泉", region="青森", quietness=9.0, solo_score=7.5, access_score=4.0, crowd_tendency="少ない", memo="日本三秘湯のひとつ。ぬる湯が特徴。", tags="秘湯,ぬる湯,三秘湯"),
    Onsen(name="湯西川温泉", region="栃木", quietness=8.5, solo_score=8.0, access_score=5.0, crowd_tendency="少ない", memo="平家落人の里。静かな渓谷沿い。", tags="歴史,渓谷,静寂"),
]

db.add_all(onsen_data)
db.commit()
db.close()

print("シードデータを投入しました。")