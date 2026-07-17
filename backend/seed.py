"""秘湯ナビ シードデータ投入スクリプト。

ALGORITHM.md / SEARCH_DESIGN.md の運用フローに沿って、以下の順で処理する：

1. 温泉10施設・タグ（既存カタログ）をDBに登録
2. タグ説明文を埋め込み → tag_embeddings に保存
3. 各温泉の「本文」（quietness/solitude/accessibility_comment + bathing_review を
   ##見出し付きで連結したもの。専用の長文記事テーブルがまだ無いため、既存の
   構造化コメント欄を本文の代用として使う）をチャンク分割 → 埋め込み →
   onsen_embeddings に保存
4. 本文チャンクとタグ説明文の類似度から、タグ付与候補を自動生成
   （onsen_tags.status='proposed'）
5. 執筆者（ここでは私が代行）が候補を確認し、承認/却下を行う
   （ALGORITHM.md §2.1・SEARCH_DESIGN.md §6.5 の運用フロー）
   - 正解タグ集合に含まれる候補 → approved
   - 含まれない候補 → rejected（却下履歴として保持）
   - AIが拾えなかった正解タグ → 手動追加（confidence=1.00, 最初からapproved）
"""
from decimal import Decimal

import numpy as np

from app.database import SessionLocal, engine, Base
from app.models import (
    Onsen, OnsenSpringInfo, OnsenAccommodation, OnsenAccess, Tag, OnsenTag,
    TagEmbedding, OnsenEmbedding,
)
from app.constants import prefecture_to_area
from app.embeddings import (
    Embedder, MODEL_VERSION, serialize_vector, content_hash,
    split_into_chunks, max_chunk_similarity,
)

# ALGORITHM.md §5.1・§8：閾値は実測してキャリブレーションする。
#
# 実測の結果、cl-nagoya/ruri-v3-70m はコサイン類似度が極めて狭い帯域
# （観測値: mean~0.85-0.87, std~0.03）に圧縮される（小型モデルにありがちな
# 異方性の強い埋め込み空間）。かつこの帯域は温泉ごとに若干シフトする
# （観測値: mean 0.853〜0.869）。そのため絶対値の閾値（例: 0.45）は
# 一切機能しない（89件中87件が閾値超えになるなど無意味な結果になる）。
#
# 代わりに「温泉ごとの類似度分布の上位20%」を提案候補とする相対閾値方式を採る。
# 温泉ごとにベースラインが違っても、常に一定割合を recall 重視で拾える。
TAG_SUGGESTION_PERCENTILE = 80

Base.metadata.create_all(bind=engine)
db = SessionLocal()
embedder = Embedder()


def build_body_markdown(intro_text, quietness_comment, solitude_comment, accessibility_comment, bathing_review) -> str:
    """本文の代用として、紹介文＋4つの構造化コメント欄を見出し付きで連結する。"""
    return (
        f"## 紹介\n{intro_text}\n\n"
        f"## 静けさ\n{quietness_comment}\n\n"
        f"## ソロ適性\n{solitude_comment}\n\n"
        f"## アクセス\n{accessibility_comment}\n\n"
        f"## 雰囲気\n{bathing_review}"
    )


# ---------------------------------------------------------------------------
# 1. 温泉データ（約100施設）— 検索デモ用に意図的な多様性を持たせる
#
# 検索が実際に触るのは name / prefecture・area / admission_fee_min / 3スコア /
# onsen_tags(approved) / onsen_embeddings(intro+コメント由来) の6系統のみ。
# ここに多様性を集中させ、表示専用フィールド（spring_info詳細・access・accommodation）
# はテーマから機械生成する最小限に留める（トークン節約）。
#
# 各レコードのコンパクト形式：
#   slug, name（全ユニーク）, region, pref, theme（本文テーマ6系統）,
#   q/s/a（3スコア1〜5）, price（入浴料 or 宿泊料。Noneは予算フィルタ対象外）,
#   trip（"day"日帰り専用 / "stay"宿泊専用 / "both"両対応）, rooms（宿泊時のみ）,
#   tags（正解タグ集合）, intro（テーマ固有の紹介文）
# ---------------------------------------------------------------------------

# テーマ別のコメントテンプレート（本文類似度で施設を区別させるため、テーマごとに語彙を変える）
THEME_COMMENTS = {
    "sec": {  # 静寂・秘境
        "quietness": "{region}の山深くに位置し、聞こえるのは風と沢の音だけ。深い静寂に包まれる。",
        "solitude": "訪れる人がまばらで、一人静かに湯と向き合う時間を持ちやすい。",
        "accessibility": "最寄りから遠く、辿り着くまでに手間がかかる分だけ人影が少ない。",
        "bathing": "山あいの湯にゆっくり浸かれば、日常から切り離されたような心地になる。",
    },
    "sce": {  # 絶景
        "quietness": "{region}の眺望が開けた立地で、景色に見とれるうちに時を忘れる。",
        "solitude": "絶景を独り占めできる時間帯もあり、静かに景観を味わえる。",
        "accessibility": "眺めの良い場所ゆえ道のりはやや長いが、その先の景色が報いてくれる。",
        "bathing": "渓谷や雲海、雪景色を望む湯船からの眺めはこの宿一番のごちそうだ。",
    },
    "qua": {  # 湯質・美肌
        "quietness": "{region}の落ち着いた環境で、湯そのものにじっくり向き合える。",
        "solitude": "湯質を目当てに通う常連が多く、静かに長湯を楽しむ人に向く。",
        "accessibility": "通いやすさもあり、湯治や連泊で湯質を堪能する人に選ばれている。",
        "bathing": "肌をつつむ湯ざわりが評判で、湯上がりのしっとり感が長く続く名湯だ。",
    },
    "ret": {  # レトロ・歴史
        "quietness": "{region}に長く続く古い湯宿で、時が止まったような落ち着きがある。",
        "solitude": "歴史ある佇まいを静かに味わいたい一人客にもよく馴染む。",
        "accessibility": "古くからの湯治場として交通の便も整い、気軽に歴史情緒に触れられる。",
        "bathing": "木の香りと年季の入った浴場が、昔ながらの湯浴みの風情を今に伝える。",
    },
    "liv": {  # 賑わい・アクティビティ
        "quietness": "{region}の人気施設で活気があり、家族連れやグループでも楽しめる。",
        "solitude": "賑やかな雰囲気で、一人でこもるより仲間と過ごすのに向いている。",
        "accessibility": "アクセスが良く、立ち寄りやアクティビティの拠点として便利だ。",
        "bathing": "サウナや複数の湯船を巡る楽しさがあり、一日いても飽きない造りだ。",
    },
    "lux": {  # 高級・洗練
        "quietness": "{region}の喧騒から離れた上質な空間で、静かにくつろげる。",
        "solitude": "部屋数を抑えた造りで、他の客を気にせず過ごせる落ち着きがある。",
        "accessibility": "送迎も整い、特別な日にも訪れやすい洗練された宿だ。",
        "bathing": "客室露天や貸切風呂で、誰にも邪魔されない極上の湯浴みが叶う。",
    },
}

# 既存の画像ファイル（30枚）を循環参照する。新規画像は作らない。
IMAGE_POOL = [
    "noboribetsu-test.jpg", "nyuto-tsurunoyu.jpg", "yachi-onsen.jpg", "houshi-onsen.jpg",
    "shirahone-onsen.jpg", "omaki-onsen.jpg", "ryujin-onsen.jpg", "okutsu-onsen.jpg",
    "iya-onsen.jpg", "myoken-onsen.jpg", "mushinoyu-onsen.jpg", "sukayu-onsen.jpg",
    "ginzan-onsen.jpg", "higashinaruko-onsen.jpg", "nurumayu-onsen.jpg", "shima-onsen.jpg",
    "toshichi-onsen.jpg", "akayu-onsen.jpg", "sawatari-onsen.jpg", "narada-onsen.jpg",
    "nigorigo-onsen.jpg", "kawaura-onsen.jpg", "yunomine-onsen.jpg", "totsukawa-onsen.jpg",
    "haga-onsen.jpg", "sanbe-onsen.jpg", "yubara-onsen.jpg", "kawashiri-onsen.jpg",
    "oboke-onsen.jpg", "jigoku-onsen.jpg",
]

# コンパクト・レコード表（100件）
RECORDS = [
    # ===== 北海道（8）=====
    dict(slug="daisetsu-kogen", name="大雪高原山の湯", region="北海道上川", pref="北海道", theme="sec", q=5, s=5, a=4, price=1000, trip="both", rooms=12, tags=["deep_mountain","ikkenjuku","rotenburo","sulfur","no_signal","forest"], intro="大雪山国立公園の懐に湧く一軒宿。ヒグマも歩く原生林に囲まれ、硫黄香る露天からは手つかずの自然だけが見える。"),
    dict(slug="shiretoko-misaki", name="知床岬展望の湯", region="北海道斜里", pref="北海道", theme="sce", q=3, s=3, a=4, price=1500, trip="both", rooms=18, tags=["seaside","view_bath","rotenburo","starry_sky"], intro="オホーツク海を一望する断崖の宿。流氷の季節には白い海原を、夏は水平線に沈む夕日を湯船から独占できる。"),
    dict(slug="futamata-radium", name="二股らぢうむ湯治宿", region="北海道長万部", pref="北海道", theme="qua", q=4, s=3, a=3, price=1000, trip="both", rooms=20, tags=["radioactive","kakenagarashi","nigoriyu","no_water_added","drinkable","toji"], intro="石灰華ドームで知られるラジウム泉。飲泉もでき、湯治客が長逗留する湯量豊富な名湯として静かに親しまれる。"),
    dict(slug="maruko-lakeside", name="丸駒湖畔の宿", region="北海道千歳", pref="北海道", theme="ret", q=3, s=3, a=3, price=14000, trip="stay", rooms=30, tags=["old_100years","lakeside","wooden_bath","mixed_bathing","riverside"], intro="支笏湖畔に大正から続く老舗。湖と直接つながる天然の足元湧出風呂は、水位が季節で変わる歴史遺産のような一湯だ。"),
    dict(slug="jozankei-fureai", name="定山渓ふれあいの湯", region="北海道札幌", pref="北海道", theme="liv", q=2, s=2, a=1, price=800, trip="day", tags=["near_station","sauna","foot_bath","parking","wifi","cold_bath"], intro="札幌の奥座敷にある日帰り施設。サウナと複数の湯船、無料の足湯まで揃い、観光やドライブの立ち寄りに人気だ。"),
    dict(slug="akan-tsuruga-bettei", name="阿寒湖鶴雅別邸", region="北海道釧路", pref="北海道", theme="lux", q=4, s=4, a=2, price=28000, trip="stay", rooms=20, tags=["luxury","room_rotenburo","lakeside","detached_room","room_dining","non_smoking"], intro="阿寒湖を望む全室露天付きの高級宿。マリモの湖を眺めながらの客室風呂と、アイヌ文化を映した設えが特別な一夜を演出する。"),
    dict(slug="kawayu-kyodo", name="川湯硫黄の共同湯", region="北海道弟子屈", pref="北海道", theme="qua", q=3, s=2, a=2, price=300, trip="day", tags=["sulfur","nigoriyu","kakenagarashi","acidic"], intro="源泉かけ流しの強酸性硫黄泉を守る素朴な共同湯。地元の人に混じって、鼻をつく硫黄の香りとともに本物の湯を味わえる。"),
    dict(slug="tomuraushi-fukoro", name="トムラウシ山懐の湯", region="北海道新得", pref="北海道", theme="sec", q=5, s=5, a=5, price=12000, trip="stay", rooms=8, tags=["deep_mountain","ikkenjuku","hike_only","no_signal","quiet_inn","forest"], intro="登山者だけが辿り着く山中の一軒宿。携帯も通じない森の奥で、下山後の疲れを癒す湯は格別の静けさに満ちている。"),

    # ===== 東北（16）=====
    dict(slug="hakkoda-jukai", name="八甲田樹海の湯", region="青森県青森", pref="青森県", theme="sec", q=5, s=4, a=4, price=700, trip="both", rooms=10, tags=["deep_mountain","nigoriyu","sulfur","winter_closed","forest","kakenagarashi"], intro="ブナ樹海に囲まれた雪深い一軒宿。冬は道が閉ざされ、乳白色の湯と静寂だけが残る本物の秘湯である。"),
    dict(slug="furofushi-nihonkai", name="不老ふ死日本海の湯", region="青森県深浦", pref="青森県", theme="sce", q=3, s=3, a=3, price=1000, trip="both", rooms=25, tags=["seaside","view_bath","rotenburo","iron","chloride"], intro="日本海の波打ち際に湧く茶褐色の露天。水平線に沈む夕日と一体になる湯浴みは、この地でしか味わえない絶景だ。"),
    dict(slug="tsuta-numa", name="蔦沼レトロ館", region="青森県十和田", pref="青森県", theme="ret", q=4, s=3, a=3, price=13000, trip="stay", rooms=15, tags=["old_100years","wooden_bath","autumn_leaves","forest","lakeside"], intro="ブナ林の沼のほとりに佇む明治創業の宿。紅葉に染まる蔦沼の朝景と、足元から湧く総ヒバの湯が名高い。"),
    dict(slug="namari-shirasagi", name="鉛白鷺の湯", region="岩手県花巻", pref="岩手県", theme="qua", q=3, s=3, a=2, price=800, trip="both", rooms=18, tags=["alkaline_simple","kakenagarashi","natural_spout","wooden_bath","drinkable"], intro="足元から自然湧出する日本有数の深さの立ち湯。透明でやわらかな湯に首まで浸かれば、傷ついた白鷺が癒えた伝説にうなずける。"),
    dict(slug="geto-onsen-kyodo", name="夏油渓谷の共同湯", region="岩手県北上", pref="岩手県", theme="sec", q=5, s=4, a=5, price=700, trip="day", tags=["gorge","deep_mountain","mixed_bathing","kakenagarashi","winter_closed","rotenburo"], intro="渓流沿いに点在する野趣あふれる露天群。冬季は雪に閉ざされる山峡で、川音を聞きながら混浴文化を今に伝える。"),
    dict(slug="tsunagi-ekimae", name="つなぎ駅前の湯", region="岩手県盛岡", pref="岩手県", theme="liv", q=2, s=2, a=1, price=600, trip="day", tags=["near_station","foot_bath","parking","cherry_blossoms","sauna"], intro="御所湖畔の便利な立ち寄り湯。桜並木と足湯が整い、盛岡観光の合間に気軽に立ち寄れる賑やかな施設だ。"),
    dict(slug="sakunami-bettei", name="作並離れの宿", region="宮城県仙台", pref="宮城県", theme="lux", q=4, s=4, a=2, price=22000, trip="stay", rooms=12, tags=["luxury","detached_room","room_rotenburo","gorge","room_dining","non_smoking"], intro="広瀬川源流の渓谷に建つ離れ中心の宿。全ての離れに露天が付き、川のせせらぎだけを聞きながら静かな時を過ごせる。"),
    dict(slug="naruko-goshiki", name="鳴子五色の湯", region="宮城県大崎", pref="宮城県", theme="qua", q=3, s=3, a=2, price=500, trip="both", rooms=14, tags=["sulfur","nigoriyu","kakenagarashi","carbonated","no_water_added"], intro="日によって湯の色が変わる不思議な硫黄泉。多彩な泉質が集まる鳴子の中でも、湯めぐり好きを唸らせる一湯だ。"),
    dict(slug="takayu-azuma", name="高湯吾妻の秘湯", region="福島県福島", pref="福島県", theme="sec", q=5, s=4, a=3, price=800, trip="both", rooms=16, tags=["sulfur","nigoriyu","kakenagarashi","deep_mountain","rotenburo","no_water_added"], intro="吾妻連峰の中腹に湧く濃厚な硫黄泉。青みがかった白濁の湯が惜しみなくかけ流され、江戸期からの湯治文化が息づく。"),
    dict(slug="iizaka-machiyu", name="飯坂まちの湯", region="福島県福島", pref="福島県", theme="ret", q=2, s=2, a=1, price=200, trip="day", tags=["old_100years","near_station","retro","photogenic"], intro="松尾芭蕉も浸かったと伝わる古い共同湯。狭い路地に湯屋が点在する温泉街を、下駄で巡るレトロ情緒が楽しい。"),
    dict(slug="bandai-lakeside", name="磐梯湖畔展望の湯", region="福島県耶麻", pref="福島県", theme="sce", q=3, s=3, a=2, price=1200, trip="both", rooms=20, tags=["lakeside","view_bath","highland","autumn_leaves","rotenburo"], intro="磐梯山と桧原湖を一望する高原の湯。紅葉と初雪が同時に見られる季節の眺めは、露天に長居させる魅力がある。"),
    dict(slug="zao-juhyo", name="蔵王樹氷の宿", region="山形県山形", pref="山形県", theme="sce", q=3, s=3, a=3, price=15000, trip="stay", rooms=22, tags=["yukimi","sulfur","view_bath","nigoriyu","rotenburo","highland"], intro="樹氷原を望む高原の宿。強酸性の白濁湯に浸かりながら、モンスターと呼ばれる雪の巨木群を眺める冬の絶景が待つ。"),
    dict(slug="akakura-toji", name="赤倉湯治の里", region="山形県最上", pref="山形県", theme="qua", q=4, s=4, a=3, price=600, trip="both", rooms=10, tags=["kakenagarashi","alkaline_simple","toji","simple","quiet_inn","no_water_added"], intro="自炊棟を備えた昔ながらの湯治宿。刺激の少ないやわらかな湯に何日も浸かり、体を芯から整える滞在ができる。"),
    dict(slug="ginzan-yakushi", name="銀山薬師の湯", region="山形県尾花沢", pref="山形県", theme="ret", q=3, s=2, a=2, price=500, trip="day", tags=["retro","photogenic","wooden_bath","near_station","cherry_blossoms"], intro="ガス灯灯る大正ロマンの街並みに佇む共同湯。木造旅館が川沿いに連なる景観は、夕暮れ時にひときわ映える。"),
    dict(slug="nyuto-magoroku", name="乳頭孫六の湯", region="秋田県仙北", pref="秋田県", theme="sec", q=5, s=5, a=4, price=600, trip="both", rooms=8, tags=["deep_mountain","ikkenjuku","kakenagarashi","nigoriyu","mixed_bathing","no_signal","forest"], intro="乳頭温泉郷の最奥、沢沿いにぽつんと建つ湯治宿。数種の源泉が湧き、ブナ林の静寂の中で湯めぐりを楽しめる。"),
    dict(slug="oga-nihonkai-spa", name="男鹿日本海スパ", region="秋田県男鹿", pref="秋田県", theme="liv", q=2, s=2, a=2, price=1000, trip="both", rooms=30, tags=["seaside","sauna","view_bath","parking","wifi","kashikiri"], intro="なまはげの里にある大型温浴施設。日本海を望むサウナと複数の湯、貸切風呂まで揃い、家族連れで一日過ごせる。"),

    # ===== 関東（12）=====
    dict(slug="hoshi-takimi", name="宝川滝見の湯", region="群馬県利根", pref="群馬県", theme="sce", q=4, s=3, a=3, price=1500, trip="both", rooms=24, tags=["gorge","riverside","rotenburo","mixed_bathing","view_bath","autumn_leaves"], intro="利根川源流の渓谷に広がる巨大な露天。四つの湯船が川と一体になり、紅葉と雪見の季節は息をのむ渓谷美に包まれる。"),
    dict(slug="kusatsu-yubatake", name="草津湯畑の共同湯", region="群馬県吾妻", pref="群馬県", theme="qua", q=2, s=2, a=1, price=0, trip="day", tags=["sulfur","acidic","nigoriyu","kakenagarashi","near_station","photogenic"], intro="湯畑を囲む温泉街の中心にある無料の共同湯。強酸性の名湯を気軽に体験でき、湯もみの実演も名物となっている。"),
    dict(slug="shima-sekizen", name="四万積善の宿", region="群馬県吾妻", pref="群馬県", theme="ret", q=4, s=3, a=2, price=16000, trip="stay", rooms=28, tags=["old_100years","wooden_bath","riverside","retro","photogenic","kakenagarashi"], intro="四万川沿いに建つ元禄創業の木造宿。アーチ橋と赤い欄干、湯宿建築の傑作が、時代劇のような風情を今に残す。"),
    dict(slug="hokkawa-kaichu", name="北川海中の湯", region="静岡県賀茂", pref="静岡県", theme="sce", q=3, s=3, a=2, price=600, trip="day", tags=["seaside","view_bath","rotenburo","open_air_bath"], intro="太平洋の波打ち際、満潮時には波しぶきがかかる露天。水平線から昇る朝日を独り占めできる伊豆の名物湯だ。"),
    dict(slug="hakone-tenzan", name="箱根天山の湯", region="神奈川県足柄下", pref="神奈川県", theme="liv", q=2, s=2, a=1, price=1450, trip="day", tags=["near_station","sauna","kashikiri","foot_bath","rotenburo","parking"], intro="渓流沿いに湯船が点在する人気の日帰り施設。都心から近く、複数の露天とサウナを湯めぐり感覚で楽しめる。"),
    dict(slug="okutama-kajika", name="奥多摩かじかの宿", region="東京都西多摩", pref="東京都", theme="sec", q=4, s=4, a=3, price=900, trip="both", rooms=8, tags=["gorge","riverside","quiet_inn","forest","kakenagarashi","alkaline_simple"], intro="東京都内とは思えない渓谷の一軒宿。多摩川源流のせせらぎを聞きながら、とろりとした美肌の湯にゆっくり浸かれる。"),
    dict(slug="shiobara-otokataki", name="塩原おとかたきの湯", region="栃木県那須塩原", pref="栃木県", theme="qua", q=3, s=3, a=3, price=500, trip="both", rooms=12, tags=["nigoriyu","iron","kakenagarashi","gorge","riverside","no_water_added"], intro="箒川の渓谷に湧く緑褐色のにごり湯。塩原十一湯のひとつで、豊かな湯量と個性的な湯色が湯通を惹きつける。"),
    dict(slug="nikko-yumoto", name="日光湯元高原の湯", region="栃木県日光", pref="栃木県", theme="sce", q=3, s=3, a=3, price=13000, trip="stay", rooms=20, tags=["highland","sulfur","nigoriyu","yukimi","lakeside","rotenburo"], intro="奥日光の湖畔に湧く硫黄泉の宿。戦場ヶ原に近い高原の静けさと、白濁の湯、冬の雪見露天が三拍子そろう。"),
    dict(slug="hitachi-kaihin-spa", name="常陸海浜スパリゾート", region="茨城県ひたちなか", pref="茨城県", theme="liv", q=1, s=1, a=1, price=1200, trip="both", rooms=40, tags=["seaside","sauna","view_bath","parking","wifi","pet_ok","cold_bath"], intro="太平洋を望む大型リゾート。ネモフィラの丘に近く、広い露天とサウナ、ペット同伴プランまで揃う家族向け施設だ。"),
    dict(slug="chichibu-onsen-mori", name="秩父森の四季亭", region="埼玉県秩父", pref="埼玉県", theme="lux", q=4, s=4, a=2, price=20000, trip="stay", rooms=14, tags=["luxury","room_rotenburo","detached_room","room_dining","autumn_leaves","non_smoking"], intro="秩父の山あいに佇む離れ主体の宿。全室に檜の露天が付き、渓谷の紅葉と静けさを独占できる大人の隠れ家だ。"),
    dict(slug="boso-nagisa", name="房総なぎさの湯", region="千葉県南房総", pref="千葉県", theme="qua", q=2, s=2, a=1, price=800, trip="day", tags=["seaside","chloride","view_bath","foot_bath","parking"], intro="房総の海を望む黒湯の立ち寄り湯。保温効果の高い塩化物泉で、海水浴やサイクリング帰りの体を芯から温める。"),
    dict(slug="sarugakyo-tanuki", name="猿ヶ京たぬきの湯", region="群馬県利根", pref="群馬県", theme="ret", q=3, s=3, a=2, price=700, trip="both", rooms=16, tags=["lakeside","wooden_bath","retro","irori_cuisine","kakenagarashi"], intro="赤谷湖畔に残る昔ながらの湯宿。囲炉裏を囲む郷土料理と、木の温もりある浴場が、懐かしい湯治気分を呼び起こす。"),

    # ===== 中部（16）=====
    dict(slug="myoko-akakura-yama", name="妙高赤倉山の湯", region="新潟県妙高", pref="新潟県", theme="sce", q=3, s=3, a=3, price=14000, trip="stay", rooms=24, tags=["highland","yukimi","view_bath","rotenburo","sulfur","autumn_leaves"], intro="妙高山の中腹に湧く硫黄泉の宿。スキー場に隣接し、雪原を見晴らす露天と、秋の錦の紅葉が季節ごとに客を迎える。"),
    dict(slug="matsunoyama-yakushi", name="松之山薬師の湯", region="新潟県十日町", pref="新潟県", theme="qua", q=4, s=3, a=3, price=600, trip="both", rooms=12, tags=["chloride","kakenagarashi","toji","no_water_added","natural_spout","riverside"], intro="日本三大薬湯に数えられる濃い塩化物泉。太古の海水が閉じ込められた化石海水の湯は、湯冷めしにくく湯治客に名高い。"),
    dict(slug="himegawa-gorge", name="姫川渓谷の秘湯", region="新潟県糸魚川", pref="新潟県", theme="sec", q=5, s=4, a=4, price=800, trip="both", rooms=6, tags=["gorge","deep_mountain","ikkenjuku","nigoriyu","kakenagarashi","no_signal"], intro="峡谷の吊り橋を渡った先の一軒宿。川底から湧く炭酸を含んだにごり湯と、圏外の静寂が秘湯好きを満足させる。"),
    dict(slug="unazuki-kurobe", name="宇奈月黒部展望の湯", region="富山県黒部", pref="富山県", theme="sce", q=3, s=3, a=3, price=1500, trip="both", rooms=26, tags=["gorge","view_bath","rotenburo","autumn_leaves","alkaline_simple"], intro="黒部峡谷の玄関口に建つ宿。トロッコ列車と渓谷美を眺める露天は、新緑と紅葉の季節に一段と表情を深める。"),
    dict(slug="wakura-nanao-bay", name="和倉七尾湾の宿", region="石川県七尾", pref="石川県", theme="lux", q=3, s=4, a=2, price=30000, trip="stay", rooms=18, tags=["luxury","seaside","room_rotenburo","view_bath","room_dining","non_smoking","kashikiri"], intro="七尾湾を望む能登の名湯。塩気を含む温かな湯と、加賀・能登の海の幸を尽くした献立で、記念日を彩る至高の宿だ。"),
    dict(slug="yamanaka-kakusenkei", name="山中鶴仙渓の湯", region="石川県加賀", pref="石川県", theme="ret", q=3, s=3, a=2, price=1000, trip="day", tags=["gorge","riverside","retro","photogenic","near_station","cherry_blossoms"], intro="鶴仙渓の遊歩道沿いにある総湯。芭蕉も愛した渓谷を散策したあと、加賀の伝統を映した湯屋で汗を流せる。"),
    dict(slug="awara-tsuruginoyu", name="あわら つるぎの湯", region="福井県あわら", pref="福井県", theme="qua", q=2, s=2, a=1, price=700, trip="day", tags=["chloride","kakenagarashi","foot_bath","near_station","parking"], intro="関西の奥座敷と呼ばれる平野の湯。保温力の高い塩化物泉を気軽に楽しめ、駅からも近く旅の締めくくりに便利だ。"),
    dict(slug="katsuyama-kyoryu", name="勝山恐竜郷の湯", region="福井県勝山", pref="福井県", theme="liv", q=2, s=2, a=2, price=900, trip="both", rooms=20, tags=["sauna","parking","wifi","view_bath","pet_ok","cold_bath"], intro="恐竜博物館に近い里山の温浴宿。広いサウナと露天、ペット同伴の部屋も備え、家族旅行の拠点として使いやすい。"),
    dict(slug="shosenkyo-kakuma", name="昇仙峡覚円の湯", region="山梨県甲府", pref="山梨県", theme="sce", q=3, s=3, a=3, price=1100, trip="both", rooms=14, tags=["gorge","view_bath","rotenburo","autumn_leaves","riverside"], intro="奇岩そびえる昇仙峡を望む宿。日本一の渓谷美と称される断崖を眺めながら、川風の通る露天でくつろげる。"),
    dict(slug="masutomi-radium", name="増富ラジウム湯治宿", region="山梨県北杜", pref="山梨県", theme="qua", q=4, s=4, a=3, price=800, trip="both", rooms=10, tags=["radioactive","iron","toji","nigoriyu","quiet_inn","no_water_added"], intro="世界有数のラジウム含有量を誇る鉄泉。ぬるめの湯に長時間浸かる独特の湯治スタイルで、体質改善を求める客が通う。"),
    dict(slug="bessho-kitamuki", name="別所北向観音の湯", region="長野県上田", pref="長野県", theme="ret", q=3, s=2, a=2, price=200, trip="day", tags=["alkaline_simple","old_100years","retro","near_station","kakenagarashi"], intro="信州最古と伝わる古湯の共同浴場。真田氏ゆかりの門前町に湧くやわらかなアルカリ泉を、地元価格で味わえる。"),
    dict(slug="norikura-tatamidaira", name="乗鞍畳平雲上の湯", region="長野県松本", pref="長野県", theme="sce", q=4, s=4, a=5, price=1500, trip="both", rooms=8, tags=["highland","sea_of_clouds","view_bath","rotenburo","yukimi","deep_mountain"], intro="標高2000m超、日本最高所級の宿。雲海に浮かぶ稜線と満天の星を露天から望む、天空の湯浴みが体験できる。"),
    dict(slug="gero-gassho", name="下呂合掌の湯", region="岐阜県下呂", pref="岐阜県", theme="liv", q=2, s=2, a=1, price=800, trip="both", rooms=22, tags=["near_station","alkaline_simple","foot_bath","sauna","parking","photogenic"], intro="日本三名泉の温泉街にある湯。合掌造りを移築した館内と点在する足湯を巡り、つるつるの美肌湯を気軽に楽しめる。"),
    dict(slug="okuhida-shinhotaka", name="奥飛騨新穂高の湯", region="岐阜県高山", pref="岐阜県", theme="sec", q=5, s=4, a=4, price=0, trip="day", tags=["gorge","rotenburo","mixed_bathing","deep_mountain","view_bath","open_air_bath"], intro="北アルプスを望む河原の無料露天。ロープウェイの足元、渓谷に開かれた巨大な野天風呂で、峰々を眺めながら湯に浸かる。"),
    dict(slug="atami-bettei-nagi", name="熱海別邸 凪", region="静岡県熱海", pref="静岡県", theme="lux", q=3, s=4, a=1, price=26000, trip="stay", rooms=12, tags=["luxury","seaside","room_rotenburo","view_bath","room_dining","non_smoking"], intro="相模湾を見下ろす全室オーシャンビューの宿。客室の露天から花火と朝日を望み、駅近ながら喧騒を忘れさせる洗練の空間だ。"),
    dict(slug="sunport-toyokawa", name="豊川いなり駅前の湯", region="愛知県豊川", pref="愛知県", theme="liv", q=1, s=1, a=1, price=700, trip="day", tags=["near_station","sauna","cold_bath","foot_bath","parking","wifi"], intro="門前町の駅前にある気軽な立ち寄り湯。サウナと水風呂の整い環境が整い、参拝や出張のついでにさっと汗を流せる。"),

    # ===== 近畿（12）=====
    dict(slug="yunomine-tsuboyu", name="湯の峰つぼ湯", region="和歌山県田辺", pref="和歌山県", theme="ret", q=4, s=3, a=3, price=800, trip="both", rooms=10, tags=["old_100years","kakenagarashi","drinkable","toji","mixed_bathing","riverside"], intro="世界遺産に登録された日本最古の湯。熊野詣の湯垢離場として千年以上使われ、日に七度色を変えると伝わる小さな岩湯だ。"),
    dict(slug="katsuura-bokido", name="勝浦忘帰洞の湯", region="和歌山県東牟婁", pref="和歌山県", theme="sce", q=3, s=3, a=3, price=1500, trip="both", rooms=30, tags=["seaside","cave_bath","view_bath","rotenburo","chloride"], intro="太平洋の荒波が打ち寄せる大洞窟の湯。帰るのを忘れると名づけられた岩窟風呂から、朝日と黒潮の大海原を望む。"),
    dict(slug="ryujin-bijin", name="龍神美人の共同湯", region="和歌山県田辺", pref="和歌山県", theme="qua", q=3, s=3, a=3, price=500, trip="day", tags=["alkaline_simple","kakenagarashi","natural_spout","riverside"], intro="日本三美人の湯に数えられる清流沿いの湯。とろみのある弱アルカリ泉が肌をなめらかに整えると評判の名湯だ。"),
    dict(slug="arima-kinnoyu", name="有馬金泉の宿", region="兵庫県神戸", pref="兵庫県", theme="ret", q=2, s=2, a=1, price=18000, trip="stay", rooms=26, tags=["iron","chloride","old_100years","near_station","retro","room_dining"], intro="古今和歌集にも詠まれた日本三古湯。鉄分で赤茶に濁る金泉が名物で、太閤秀吉も愛した由緒ある湯の街に建つ。"),
    dict(slug="kinosaki-sotoyu", name="城崎外湯めぐりの宿", region="兵庫県豊岡", pref="兵庫県", theme="liv", q=2, s=2, a=1, price=1300, trip="stay", rooms=20, tags=["near_station","chloride","foot_bath","retro","photogenic","cherry_blossoms"], intro="柳並木の温泉街に七つの外湯が点在。浴衣に下駄で湯めぐりを楽しむ風情が名高く、冬は松葉ガニ目当ての客で賑わう。"),
    dict(slug="tosenji-taki", name="桃源寺滝の湯", region="兵庫県美方", pref="兵庫県", theme="sec", q=5, s=5, a=4, price=700, trip="both", rooms=6, tags=["gorge","deep_mountain","ikkenjuku","quiet_inn","kakenagarashi","forest"], intro="滝のそばに佇む山あいの一軒宿。訪れる人も少なく、渓流の音だけが響く湯船で、静けさに身を委ねる時間が流れる。"),
    dict(slug="totsukawa-yer", name="十津川源泉の里", region="奈良県吉野", pref="奈良県", theme="qua", q=4, s=4, a=4, price=600, trip="both", rooms=14, tags=["kakenagarashi","natural_spout","no_water_added","deep_mountain","riverside","simple"], intro="全国有数の湧出量を誇る源泉かけ流しの村。山深い秘境ながら湯は惜しみなく注がれ、清流沿いで湯浴みを堪能できる。"),
    dict(slug="dorogawa-gyoja", name="洞川行者の宿", region="奈良県吉野", pref="奈良県", theme="ret", q=3, s=3, a=3, price=900, trip="both", rooms=12, tags=["old_100years","wooden_bath","deep_mountain","retro","irori_cuisine","alkaline_simple"], intro="大峯山の登山口に続く行者宿の町。木造の旅館が軒を連ねる涼やかな高地で、修験の歴史を感じる湯浴みができる。"),
    dict(slug="shirahama-sakinoyu", name="白浜崎の湯", region="和歌山県西牟婁", pref="和歌山県", theme="sce", q=2, s=2, a=2, price=500, trip="day", tags=["seaside","open_air_bath","view_bath","rotenburo","chloride"], intro="太平洋に突き出た岩礁に設けられた露天。柵一枚なく海と一体になる湯船で、水平線に沈む夕日を眺める贅沢を味わえる。"),
    dict(slug="ombara-kogen", name="恩原高原星の湯", region="京都府南丹", pref="京都府", theme="sce", q=4, s=4, a=3, price=1000, trip="both", rooms=10, tags=["highland","starry_sky","view_bath","rotenburo","forest","sea_of_clouds"], intro="光の届かない高原に湧く星見の湯。夜は満天の星が降り、早朝は雲海が広がる、天体観測愛好家にも知られた静かな宿だ。"),
    dict(slug="kyotango-uranoyu", name="京丹後浦の湯", region="京都府京丹後", pref="京都府", theme="lux", q=3, s=4, a=2, price=24000, trip="stay", rooms=15, tags=["luxury","seaside","room_rotenburo","view_bath","room_dining","kashikiri"], intro="日本海を望む丹後の隠れ宿。客室露天から海に沈む夕日を独り占めし、間人ガニをはじめ地の魚介を堪能できる。"),
    dict(slug="oku-biwako-sazanami", name="奥びわ湖さざなみの湯", region="滋賀県長浜", pref="滋賀県", theme="liv", q=2, s=2, a=1, price=800, trip="day", tags=["lakeside","view_bath","foot_bath","sauna","parking","wifi"], intro="琵琶湖の北岸に建つ日帰り施設。湖を見晴らす露天とサウナが整い、サイクリングや湖畔観光の拠点に重宝される。"),

    # ===== 中国（10）=====
    dict(slug="misasa-kawara", name="三朝河原の湯", region="鳥取県東伯", pref="鳥取県", theme="qua", q=3, s=2, a=1, price=0, trip="day", tags=["radioactive","kakenagarashi","riverside","open_air_bath","photogenic"], intro="三徳川の河原に湧く無料の露天。世界有数のラジウム泉として名高く、橋の上から丸見えの開放的な湯浴みが名物だ。"),
    dict(slug="hawai-togo-lake", name="はわい東郷湖の宿", region="鳥取県東伯", pref="鳥取県", theme="sce", q=3, s=3, a=2, price=1200, trip="both", rooms=18, tags=["lakeside","view_bath","rotenburo","chloride","cherry_blossoms"], intro="東郷湖の中に浮かぶように建つ宿。湖上から昇る朝日を露天から望み、春は湖畔の桜が湯船を彩る水辺の名湯だ。"),
    dict(slug="tamatsukuri-bijin", name="玉造美人の湯", region="島根県松江", pref="島根県", theme="qua", q=2, s=2, a=1, price=1000, trip="both", rooms=24, tags=["alkaline_simple","near_station","foot_bath","kakenagarashi","photogenic","cherry_blossoms"], intro="出雲国風土記にも記された美肌の古湯。神の湯と称されるとろみのある湯で、玉川沿いの街並みそぞろ歩きも楽しい。"),
    dict(slug="sanbe-kokumin", name="三瓶山麓の湯", region="島根県大田", pref="島根県", theme="sec", q=4, s=4, a=3, price=600, trip="both", rooms=12, tags=["iron","highland","forest","quiet_inn","kakenagarashi","nigoriyu"], intro="三瓶山の裾野に湧く赤褐色の含鉄泉。高原の澄んだ空気と静けさに包まれ、知る人ぞ知る山陰の秘湯として親しまれる。"),
    dict(slug="okutsu-keikoku", name="奥津渓谷足踏みの湯", region="岡山県苫田", pref="岡山県", theme="ret", q=3, s=3, a=2, price=500, trip="both", rooms=14, tags=["gorge","riverside","alkaline_simple","kakenagarashi","autumn_leaves","retro"], intro="吉井川の渓谷に湧く美肌の古湯。かつて足踏み洗濯で賑わった素朴な湯の里で、紅葉に染まる渓谷美も見どころだ。"),
    dict(slug="yubara-sunayu", name="湯原砂湯の共同湯", region="岡山県真庭", pref="岡山県", theme="liv", q=2, s=1, a=1, price=0, trip="day", tags=["riverside","open_air_bath","mixed_bathing","rotenburo","view_bath","foot_bath"], intro="旭川の川底から湧く24時間無料の露天。川と一体になる開放的な砂湯は、西日本を代表する人気の露天風呂だ。"),
    dict(slug="okuhiruzen-kogen", name="奥蒜山高原の宿", region="岡山県真庭", pref="岡山県", theme="sce", q=3, s=3, a=3, price=13000, trip="stay", rooms=16, tags=["highland","view_bath","rotenburo","yukimi","forest","sea_of_clouds"], intro="蒜山高原の牧歌的な風景に抱かれた宿。大山を望む露天と、朝もやに包まれる高原の眺めが、四季折々に旅情を誘う。"),
    dict(slug="yunotsu-yakushi", name="温泉津薬師の湯", region="島根県大田", pref="島根県", theme="ret", q=3, s=2, a=2, price=400, trip="day", tags=["old_100years","kakenagarashi","retro","photogenic","nigoriyu","natural_spout"], intro="世界遺産の港町に残る古い共同湯。石見銀山の積出港として栄えた面影の中、濃い成分の湯が湯の花を浮かべる。"),
    dict(slug="nagato-yumoto", name="長門湯本音信の宿", region="山口県長門", pref="山口県", theme="lux", q=3, s=4, a=2, price=25000, trip="stay", rooms=18, tags=["luxury","riverside","room_rotenburo","room_dining","non_smoking","kashikiri"], intro="音信川のほとりに建つ山口最古の名湯の宿。川床のある洗練された街並みと、客室露天でのくつろぎが上質な滞在を約束する。"),
    dict(slug="yuki-onsen-mori", name="湯来森の湯治場", region="広島県広島", pref="広島県", theme="qua", q=4, s=4, a=3, price=600, trip="both", rooms=10, tags=["alkaline_simple","kakenagarashi","toji","forest","quiet_inn","simple"], intro="広島の奥座敷と呼ばれる山あいの湯。刺激の少ないやわらかな湯で、都市近郊ながら静かに湯治気分を味わえる隠れ湯だ。"),

    # ===== 四国（8）=====
    dict(slug="dogo-honkan", name="道後本館の湯", region="愛媛県松山", pref="愛媛県", theme="ret", q=2, s=2, a=1, price=460, trip="day", tags=["old_100years","near_station","retro","photogenic","alkaline_simple","kakenagarashi"], intro="三千年の歴史を誇る日本最古級の湯。重要文化財の壮麗な木造建築で、坊っちゃんゆかりの湯に地元価格で浸かれる。"),
    dict(slug="iya-kazurabashi", name="祖谷かずら橋渓谷の湯", region="徳島県三好", pref="徳島県", theme="sce", q=4, s=4, a=5, price=1700, trip="both", rooms=20, tags=["gorge","view_bath","deep_mountain","rotenburo","autumn_leaves","ikkenjuku"], intro="ケーブルカーで谷底へ下る渓谷の宿。日本三大秘境に数えられる祖谷の断崖と清流を、専用ケーブルの露天から一望する。"),
    dict(slug="oboke-rafting", name="大歩危ラフティングの湯", region="徳島県三好", pref="徳島県", theme="liv", q=2, s=2, a=2, price=1000, trip="both", rooms=24, tags=["gorge","riverside","sauna","view_bath","parking","wifi","cold_bath"], intro="吉野川の激流を望む活気ある宿。ラフティングやジップラインの拠点で、アクティビティ後にサウナと渓谷露天で整う。"),
    dict(slug="konpira-onsen-sato", name="こんぴら門前の湯", region="香川県仲多度", pref="香川県", theme="liv", q=2, s=2, a=1, price=1200, trip="both", rooms=18, tags=["near_station","foot_bath","view_bath","kashikiri","cherry_blossoms","parking"], intro="金刀比羅宮の門前に湧く湯。長い石段の参拝で疲れた足を癒す湯船から、讃岐平野と桜を見晴らせる立地が人気だ。"),
    dict(slug="niyodo-blue", name="仁淀ブルー源流の宿", region="高知県吾川", pref="高知県", theme="sec", q=5, s=5, a=5, price=8000, trip="stay", rooms=6, tags=["gorge","deep_mountain","ikkenjuku","riverside","quiet_inn","no_signal","forest"], intro="奇跡の清流・仁淀川の源流に佇む一軒宿。狭い山道の先、圏外の静寂の中で、透きとおる川と森だけを相手に過ごせる。"),
    dict(slug="ashizuri-misaki", name="足摺岬黒潮の湯", region="高知県土佐清水", pref="高知県", theme="sce", q=3, s=3, a=3, price=1400, trip="both", rooms=22, tags=["seaside","view_bath","rotenburo","starry_sky","chloride"], intro="四国最南端の岬に建つ宿。太平洋の大海原と満天の星を露天から望み、黒潮の潮騒を聞きながらの湯浴みが心を解く。"),
    dict(slug="matsuyama-okudogo", name="奥道後 川の四季亭", region="愛媛県松山", pref="愛媛県", theme="lux", q=3, s=4, a=2, price=21000, trip="stay", rooms=16, tags=["luxury","gorge","room_rotenburo","room_dining","non_smoking","autumn_leaves"], intro="石手川渓谷の奥に佇む離れ主体の宿。客室の露天から渓谷の緑と紅葉を望み、道後の名湯を静かに独占できる大人の宿だ。"),
    dict(slug="sukumo-yawaragi", name="宿毛やわらぎの共同湯", region="高知県宿毛", pref="高知県", theme="qua", q=2, s=2, a=2, price=500, trip="day", tags=["alkaline_simple","kakenagarashi","foot_bath","chloride","natural_spout"], intro="足摺宇和海の玄関口にある素朴な湯。とろりとしたアルカリ泉で、四国遍路や海辺の旅の疲れをやさしくほぐしてくれる。"),

    # ===== 九州（12）=====
    dict(slug="kurokawa-yamamizuki", name="黒川山みずきの湯", region="熊本県阿蘇", pref="熊本県", theme="lux", q=4, s=4, a=3, price=23000, trip="stay", rooms=14, tags=["luxury","gorge","room_rotenburo","riverside","detached_room","room_dining"], intro="田の原川の最奥に建つ黒川の名宿。渓流沿いの離れと客室露天から、蛍舞う初夏と紅葉の秋を静かに味わえる。"),
    dict(slug="jigoku-kamado", name="別府かまど地獄の湯", region="大分県別府", pref="大分県", theme="liv", q=1, s=1, a=1, price=800, trip="day", tags=["near_station","sulfur","nigoriyu","foot_bath","sauna","photogenic","parking"], intro="湯けむり立ちのぼる地獄めぐりの街の湯。青や赤に染まる源泉池を眺め、砂むしや蒸し湯まで多彩な湯浴みを一度に楽しめる。"),
    dict(slug="myoban-yunohana", name="明礬湯の花の湯", region="大分県別府", pref="大分県", theme="qua", q=3, s=3, a=2, price=600, trip="both", rooms=10, tags=["sulfur","nigoriyu","kakenagarashi","no_water_added","yuka","photogenic"], intro="藁ぶき小屋で湯の花を採取する高台の湯。青白く濁る硫黄泉と、立ちのぼる湯けむりの景観が、別府ならではの風情を伝える。"),
    dict(slug="yufuin-bettei-mori", name="由布院 森の別邸", region="大分県由布", pref="大分県", theme="lux", q=4, s=4, a=2, price=27000, trip="stay", rooms=12, tags=["luxury","room_rotenburo","view_bath","detached_room","room_dining","non_smoking"], intro="由布岳を望む林の中の離れ宿。全室に露天が付き、朝霧に包まれる盆地の静けさと、豊後牛の会席が特別な滞在を彩る。"),
    dict(slug="ryumon-taki", name="龍門滝見の湯", region="大分県玖珠", pref="大分県", theme="sce", q=3, s=3, a=3, price=500, trip="day", tags=["gorge","riverside","view_bath","open_air_bath","autumn_leaves"], intro="二段に流れ落ちる名瀑のそばに湧く湯。滝のしぶきと轟音を間近に感じる露天は、夏の涼と秋の紅葉が格別だ。"),
    dict(slug="ibusuki-sunamushi", name="指宿砂むしの湯", region="鹿児島県指宿", pref="鹿児島県", theme="liv", q=2, s=2, a=1, price=1100, trip="both", rooms=28, tags=["seaside","near_station","view_bath","foot_bath","parking","chloride"], intro="波打ち際で天然の砂に埋まる名物の砂むし温泉。錦江湾を望む立地で、浴衣姿で砂に横たわる独特の湯体験ができる。"),
    dict(slug="myoken-tanikawa", name="妙見谷川の宿", region="鹿児島県霧島", pref="鹿児島県", theme="qua", q=4, s=3, a=3, price=700, trip="both", rooms=12, tags=["bicarbonate","riverside","kakenagarashi","quiet_inn","no_water_added","natural_spout"], intro="天降川のせせらぎに寄り添う霧島の湯。とろみのある炭酸水素塩泉が肌を包み、川沿いの静かな貸切風呂も評判だ。"),
    dict(slug="kirishima-yamaoku", name="霧島山奥の秘湯", region="鹿児島県霧島", pref="鹿児島県", theme="sec", q=5, s=4, a=4, price=600, trip="both", rooms=8, tags=["deep_mountain","sulfur","nigoriyu","ikkenjuku","forest","kakenagarashi"], intro="霧島連山の森深くに湧く硫黄泉の一軒宿。坂本龍馬が新婚旅行で訪れた地に近く、白濁の湯と鳥のさえずりに包まれる。"),
    dict(slug="unzen-jigoku", name="雲仙地獄の湯", region="長崎県雲仙", pref="長崎県", theme="qua", q=3, s=3, a=2, price=500, trip="both", rooms=16, tags=["sulfur","nigoriyu","acidic","kakenagarashi","highland","photogenic"], intro="噴気立ちのぼる地獄に囲まれた高原の湯。強い酸性の白濁湯は殺菌力が高く、キリシタン殉教の歴史を刻む地に湧く。"),
    dict(slug="takeo-tonosama", name="武雄殿様の湯", region="佐賀県武雄", pref="佐賀県", theme="ret", q=2, s=2, a=1, price=700, trip="day", tags=["old_100years","near_station","alkaline_simple","retro","kakenagarashi","photogenic"], intro="竜宮城を思わせる朱塗りの楼門が迎える古湯。かつて殿様専用だった総檜の貸切風呂が残る、由緒ある美肌の湯だ。"),
    dict(slug="hirado-nishikai", name="平戸西海の宿", region="長崎県平戸", pref="長崎県", theme="sce", q=3, s=3, a=3, price=12000, trip="stay", rooms=18, tags=["seaside","view_bath","rotenburo","starry_sky","chloride"], intro="西海国立公園の島に建つ宿。露天から沈む夕日と、光害のない島の星空を望み、平戸の海の幸を味わえる西端の名湯だ。"),
    dict(slug="hita-onta", name="日田小鹿田里の湯", region="大分県日田", pref="大分県", theme="ret", q=3, s=3, a=3, price=600, trip="both", rooms=10, tags=["riverside","wooden_bath","retro","irori_cuisine","forest","kakenagarashi"], intro="焼き物の里に湧く川沿いの湯。唐臼の音が響く谷あいで、囲炉裏を囲む郷土料理と、木の温もりある浴場が旅情を誘う。"),

    # ===== 沖縄（6）=====
    dict(slug="ryukyu-bettei-umi", name="琉球別邸 海の彩", region="沖縄県国頭", pref="沖縄県", theme="lux", q=4, s=4, a=2, price=30000, trip="stay", rooms=16, tags=["luxury","seaside","room_rotenburo","view_bath","room_dining","non_smoking","starry_sky"], intro="やんばるの海を望む全室スイートの宿。エメラルドの海を見下ろす客室露天と、島の食材を尽くした料理が非日常を約束する。"),
    dict(slug="naha-cityspa", name="那覇シティスパ", region="沖縄県那覇", pref="沖縄県", theme="liv", q=1, s=1, a=1, price=1500, trip="day", tags=["near_station","sauna","cold_bath","view_bath","wifi","chloride"], intro="国際通りに近い都市型スパ。塩気を含む地下深くの湯とサウナが整い、観光やビジネスの合間に南国の街を見下ろして寛げる。"),
    dict(slug="ishigaki-kabira", name="石垣川平湾の湯", region="沖縄県石垣", pref="沖縄県", theme="sce", q=3, s=3, a=3, price=1800, trip="both", rooms=20, tags=["seaside","view_bath","rotenburo","starry_sky","chloride"], intro="日本屈指の美しさと名高い川平湾を望む宿。青いラグーンと満天の南十字星を露天から眺める、離島ならではの湯浴みだ。"),
    dict(slug="miyako-sunset", name="宮古サンセットの湯", region="沖縄県宮古島", pref="沖縄県", theme="sce", q=2, s=2, a=2, price=1200, trip="day", tags=["seaside","open_air_bath","view_bath","foot_bath","parking"], intro="宮古ブルーの海に沈む夕日を独占できる立ち寄り湯。白砂のビーチに隣接し、マリンレジャー帰りに潮を流すのに最適だ。"),
    dict(slug="yanbaru-mori", name="やんばる森の宿", region="沖縄県国頭", pref="沖縄県", theme="sec", q=4, s=4, a=3, price=9000, trip="stay", rooms=8, tags=["forest","deep_mountain","quiet_inn","ikkenjuku","view_bath","starry_sky"], intro="世界自然遺産やんばるの森に抱かれた小さな宿。固有種の鳥が鳴く亜熱帯の緑と、街明かりの届かない星空に包まれて眠れる。"),
    dict(slug="kumejima-bade", name="久米島海洋深層の湯", region="沖縄県島尻", pref="沖縄県", theme="qua", q=2, s=2, a=2, price=1000, trip="both", rooms=14, tags=["seaside","chloride","view_bath","foot_bath","sauna","parking"], intro="海洋深層水を活かした島の湯。ミネラル豊富な塩の湯に浸かりながら、澄んだ久米島の海を望む健康志向の温浴宿だ。"),
]


def _spring_type_from_tags(tags):
    for tid, name in [
        ("sulfur", "含硫黄泉"), ("acidic", "酸性泉"), ("alkaline_simple", "アルカリ性単純泉"),
        ("bicarbonate", "ナトリウム-炭酸水素塩泉"), ("carbonated", "含二酸化炭素泉"),
        ("iron", "含鉄泉"), ("radioactive", "放射能泉"), ("chloride", "ナトリウム-塩化物泉"),
    ]:
        if tid in tags:
            return name
    return "単純温泉"


# 両対応（day+stay）施設の宿泊料をテーマの価格帯から自動生成するための帯。（1人あたり・円）
LODGING_TIER = {
    "lux": (22000, 32000),   # 高級・洗練
    "ret": (12000, 18000),   # レトロ・歴史
    "sce": (12000, 18000),   # 絶景
    "sec": (11000, 17000),   # 静寂・秘境
    "qua": (10000, 16000),   # 湯質・美肌
    "liv": (9000, 14000),    # 賑わい・アクティビティ
}


def gen_lodging_fee(slug: str, theme: str) -> int:
    """両対応施設向けに、テーマの価格帯から決定論的に per-person 宿泊料を生成（1000円刻み）。

    slug の文字コード総和を種にするため、再シードしても同じ値が再現される（PYTHONHASHSEED非依存）。
    """
    lo, hi = LODGING_TIER.get(theme, (12000, 18000))
    steps = (hi - lo) // 1000
    seed_val = sum(ord(c) for c in slug)
    return lo + (seed_val % (steps + 1)) * 1000


# 「最寄ICから○分以内」「最寄駅から徒歩○分以内」特殊チップ用のアクセス時間を
# accessibility_score（1〜5、難易度）から自動生成するための帯（分）。
# 選択肢（IC: 30/45/60/90/120分・駅徒歩: 10/20/30分）を跨いだ絞り込みが実際に機能するよう、
# スコアが高い（＝難易度が高い）施設ほど長い時間になるよう設計している。
IC_MINUTES_TIER = {1: (15, 25), 2: (30, 40), 3: (45, 58), 4: (70, 85), 5: (100, 130)}
STATION_WALK_MINUTES_TIER = {1: (3, 8), 2: (8, 15), 3: (15, 25), 4: (25, 40), 5: (45, 70)}


def _seeded_minutes(key: str, lo: int, hi: int) -> int:
    seed_val = sum(ord(c) for c in key)
    return lo + (seed_val % (hi - lo + 1))


def gen_access_minutes(slug: str, a_score: int, tags: list[str]) -> tuple[int | None, int | None]:
    """(最寄ICまでの車での分数, 最寄駅までの徒歩分数) をslug・難易度スコア・タグから決定論的に生成する。

    hike_only（登山道でしか辿り着けない）施設は道路・鉄道アクセスの概念自体が当てはまらないため
    両方ともNone。駅徒歩は、難易度最高(5)またはno_signal（携帯圏外＝人里から極端に離れている）の
    場合、現実的な徒歩圏に駅が無いと見なしNoneとする（ICは車移動なので基本的に生成する）。
    """
    if "hike_only" in tags:
        return None, None

    ic_lo, ic_hi = IC_MINUTES_TIER.get(a_score, (45, 58))
    ic_minutes = _seeded_minutes(f"{slug}_ic", ic_lo, ic_hi)

    if a_score >= 5 or "no_signal" in tags:
        station_walk_minutes = None
    else:
        st_lo, st_hi = STATION_WALK_MINUTES_TIER.get(a_score, (15, 25))
        station_walk_minutes = _seeded_minutes(f"{slug}_station", st_lo, st_hi)

    return ic_minutes, station_walk_minutes


def _expand(r):
    """コンパクト・レコードを従来の完全な dict 形式に展開する。"""
    theme = THEME_COMMENTS[r["theme"]]
    region = r["region"]
    day = r["trip"] in ("day", "both")
    stay = r["trip"] in ("stay", "both")
    tags = r["tags"]

    # 料金を「日帰り入浴料(admission)」と「1人あたり宿泊料(lodging)」に分離する。
    #   day  … price は入浴料 → admission、lodging は無し
    #   stay … price は宿泊料 → lodging、admission は無し
    #   both … price は入浴料 → admission、宿泊料は持っていないためテーマ帯から自動生成
    price = r["price"]
    if r["trip"] == "day":
        admission_min, lodging_min = price, None
    elif r["trip"] == "stay":
        admission_min, lodging_min = None, price
    else:  # both
        admission_min, lodging_min = price, gen_lodging_fee(r["slug"], r["theme"])

    d = dict(
        slug=r["slug"], name=r["name"], region=region, prefecture=r["pref"],
        admission_fee=(
            "宿泊のみ" if not day
            else (f"大人{admission_min}円" if admission_min else "無料")
        ),
        admission_fee_min=admission_min,
        lodging_fee_min=lodging_min,
        day_trip_available=day, accommodation_available=stay,
        parking_available=True, wifi_available=stay,
        room_count=r.get("rooms") if stay else None,
        intro_text=r["intro"],
        quietness_score=r["q"], quietness_comment=theme["quietness"].format(region=region),
        solitude_score=r["s"], solitude_comment=theme["solitude"].format(region=region),
        accessibility_score=r["a"], accessibility_comment=theme["accessibility"].format(region=region),
        bathing_review=theme["bathing"].format(region=region),
        # 表示専用（検索非対象）はテーマから最小生成
        spring_info=dict(
            spring_type=_spring_type_from_tags(tags),
            water_added="なし" if "no_water_added" in tags else "不明",
            circulation="なし" if "kakenagarashi" in tags else "不明",
            outdoor_bath=("rotenburo" in tags or "open_air_bath" in tags),
            sauna="sauna" in tags,
            private_bath="kashikiri" in tags,
            drinkable="drinkable" in tags,
        ),
        access=dict(
            public_transport_route=(
                "最寄り駅・ICから離れており、車でのアクセスを推奨。" if r["a"] >= 4
                else "最寄り駅・バス停から近く、公共交通でもアクセスしやすい。"
            ),
            **dict(zip(
                ("nearest_ic_minutes", "nearest_station_walk_minutes"),
                gen_access_minutes(r["slug"], r["a"], tags),
            )),
        ),
    )
    if stay:
        d["accommodation"] = dict(
            room_types=("離れ・スイート中心" if r["theme"] == "lux" else "和室中心"),
            room_style=("和洋室" if r["theme"] == "lux" else "和室"),
            dinner_type=("地元食材の会席料理" if r["theme"] in ("lux", "sce") else "郷土料理"),
            breakfast_type="和朝食",
            room_dining=("room_dining" in tags),
        )
    return d


ONSENS = [_expand(r) for r in RECORDS]

# 執筆者（人間＝このセッションではClaude Code）が把握している正解タグ集合。
# コンパクト表の tags をそのまま流用する（ALGORITHM.md §2.1 の承認判断材料）。
GROUND_TRUTH_TAGS = {r["slug"]: set(r["tags"]) for r in RECORDS}



# ---------------------------------------------------------------------------
# 2. 温泉本体・温泉情報・アクセスの登録
# ---------------------------------------------------------------------------

onsen_objs: dict[str, Onsen] = {}

for i, data in enumerate(ONSENS):
    spring_info_data = data.pop("spring_info", None)
    access_data = data.pop("access", None)
    accommodation_data = data.pop("accommodation", None)
    prefecture = data["prefecture"]

    onsen = Onsen(
        area=prefecture_to_area(prefecture),
        # 既存画像を循環参照（新規画像は作らない）。表示専用で検索には無関係。
        hero_image_url=f"/images/onsens/{IMAGE_POOL[i % len(IMAGE_POOL)]}",
        **data,
    )
    db.add(onsen)
    db.flush()
    onsen_objs[data["slug"]] = onsen

    if spring_info_data:
        db.add(OnsenSpringInfo(onsen_id=onsen.id, **spring_info_data))
    if access_data:
        db.add(OnsenAccess(onsen_id=onsen.id, **access_data))
    if accommodation_data:
        db.add(OnsenAccommodation(onsen_id=onsen.id, **accommodation_data))

db.flush()

# ---------------------------------------------------------------------------
# 3. タグ定義（既存カタログをそのまま踏襲）
# ---------------------------------------------------------------------------

tags_normal = [
    Tag(tag_id="kakenagarashi", label="源泉かけ流し", description="加水・加温・循環なしで源泉をそのまま浴槽に流す。湯の鮮度と本来の成分が保たれた最高品質の入浴体験を求める人向け。", tag_type="normal", sort_order=10),
    Tag(tag_id="rotenburo", label="露天風呂", description="屋外に設けられた風呂。自然の景色や空気を感じながら入浴できる。山・森・雪景色の中の入浴体験を求める人向け。", tag_type="normal", sort_order=11),
    Tag(tag_id="kashikiri", label="貸切風呂あり", description="家族や少人数グループで浴槽を独占できる。他の入浴客を気にせず入れる。カップルや家族旅行にも。", tag_type="normal", sort_order=12),
    Tag(tag_id="room_rotenburo", label="客室露天風呂あり", description="宿泊客室に専用の露天風呂が付いている。時間を気にせず自分だけの湯を楽しめる最上の宿泊体験。", tag_type="normal", sort_order=13),
    Tag(tag_id="nigoriyu", label="にごり湯", description="白濁・緑濁・茶濁など色のついた温泉。硫黄泉・鉄泉・炭酸泉に多い。視覚的にも温泉らしい体験を求める人向け。", tag_type="normal", sort_order=14),
    Tag(tag_id="breakfast", label="朝食付き", description="宿泊料金に朝食が含まれる。地元食材や和定食が楽しめる施設が多い。", tag_type="normal", sort_order=20),
    Tag(tag_id="dinner", label="夕食付き", description="宿泊料金に夕食が含まれる。地元の旬の食材を使った料理が楽しめる。", tag_type="normal", sort_order=21),
    Tag(tag_id="room_dining", label="部屋食", description="夕食・朝食を客室で食べられる。他の宿泊客を気にせずゆったり食事ができる。", tag_type="normal", sort_order=22),
    Tag(tag_id="parking", label="駐車場あり", description="無料または有料の駐車場が敷地内または近隣にある。車でのアクセスに便利。", tag_type="normal", sort_order=30),
    Tag(tag_id="station_shuttle", label="駅送迎あり", description="最寄り駅から宿の送迎サービスがある。公共交通機関利用者でも荷物を気にせず来られる。", tag_type="normal", sort_order=31),
    Tag(tag_id="solo_friendly", label="一人旅歓迎", description="一人で気兼ねなく利用できる温泉宿。ソロ料金設定があるか、一人客が自然に馴染める雰囲気がある。", tag_type="normal", sort_order=40),
    Tag(tag_id="pet_ok", label="ペット可", description="ペット同伴での宿泊または入浴が可能。愛犬・愛猫と一緒に旅行したい人向け。", tag_type="normal", sort_order=41),
    Tag(tag_id="non_smoking", label="禁煙", description="全室または館内が禁煙の施設。タバコの煙が苦手な人が快適に過ごせる。", tag_type="normal", sort_order=42),
    Tag(tag_id="deep_mountain", label="山奥", description="人里離れた山間部にある温泉。周囲に民家や商業施設がなく、自然の中に完全に溶け込んだ秘境感がある。", tag_type="normal", sort_order=50),
    Tag(tag_id="riverside", label="川沿いの宿", description="川のせせらぎを聞きながら入浴できる。渓流沿いの露天風呂が多く、季節ごとに異なる表情を楽しめる。", tag_type="normal", sort_order=51),
    Tag(tag_id="yukimi", label="雪見の湯", description="冬季に雪景色を眺めながら入浴できる。白銀の世界と温かい湯のコントラストが楽しめる。", tag_type="normal", sort_order=52),
    Tag(tag_id="starry_sky", label="星空", description="光害のない山間部や離島にあり、夜空の星を見ながら入浴できる。都市では体験できない満天の星空が魅力。", tag_type="normal", sort_order=53),
    Tag(tag_id="sulfur", label="硫黄泉", description="硫黄成分を含む温泉。白濁した湯と独特の香りが特徴。皮膚疾患や慢性皮膚病に効果があるとされる。", tag_type="normal", sort_order=60),
    Tag(tag_id="simple", label="単純温泉", description="成分が薄く刺激が少ない温泉。敏感肌や高齢者、子供でも安心して入れる。癖がなく長湯に向く。", tag_type="normal", sort_order=61),
    Tag(tag_id="bicarbonate", label="炭酸水素塩泉", description="重曹泉とも呼ばれる。入浴後に肌がすべすべになる美肌効果で人気。クレンジング効果も高い。", tag_type="normal", sort_order=62),
    Tag(tag_id="carbonated", label="炭酸泉", description="二酸化炭素を含む温泉。細かい気泡が肌に付着し血行促進効果が高い。疲労回復・血圧降下に効果的。", tag_type="normal", sort_order=63),
    Tag(tag_id="acidic", label="酸性泉", description="pH3未満の強酸性の温泉。殺菌力が強く皮膚疾患に効くとされる。玉川温泉など強酸性の秘湯に多い。", tag_type="normal", sort_order=64),
    Tag(tag_id="alkaline_simple", label="アルカリ性単純泉", description="pH8.5以上のアルカリ性温泉。肌の角質を柔らかくする美肌効果で女性に人気の「美人の湯」。", tag_type="normal", sort_order=65),
    Tag(tag_id="chloride", label="塩化物泉", description="食塩を主成分とする温泉。保温効果が高く湯冷めしにくい。冬の寒い季節に特に効果を発揮する。", tag_type="normal", sort_order=66),
    Tag(tag_id="iron", label="鉄泉", description="鉄分を含む温泉。褐色・赤褐色の湯が特徴的。貧血改善や婦人科疾患への効果が期待される。", tag_type="normal", sort_order=67),
    Tag(tag_id="radioactive", label="放射能泉", description="ラジウムやラドンを含む温泉。微量放射線が新陳代謝を促進する。三朝温泉・増富温泉が有名。", tag_type="normal", sort_order=68),
    Tag(tag_id="other_spring", label="その他泉質", description="上記の分類に当てはまらない特殊な泉質。珍しい成分構成を持つ個性的な温泉。", tag_type="normal", sort_order=69),
    Tag(tag_id="no_water_added", label="加水なし", description="源泉の温度を調整するための加水を一切行っていない。本来の成分濃度がそのまま保たれた純粋な温泉。", tag_type="normal", sort_order=70),
    Tag(tag_id="no_heating", label="加温なし", description="源泉の温度を上げる加温処理をしていない。自然な温度のままで提供される本物の温泉。", tag_type="normal", sort_order=71),
    Tag(tag_id="no_circulation", label="循環ろ過なし", description="湯を循環させてろ過・消毒する処理をしていない。常に新鮮な源泉が浴槽に供給される掛け流し証明。", tag_type="normal", sort_order=72),
    Tag(tag_id="natural_spout", label="自噴源泉", description="ポンプで汲み上げるのではなく地中から自然に湧き出す源泉。自然のエネルギーで湧出する本物の温泉。", tag_type="normal", sort_order=73),
    Tag(tag_id="drinkable", label="飲泉可", description="飲用できる温泉。消化器疾患や糖尿病への効果が期待される。日本では飲泉できる温泉は限られる。", tag_type="normal", sort_order=74),
    Tag(tag_id="yuka", label="湯の花あり", description="温泉成分が結晶化した湯の花（湯華）が浮遊または沈殿している。成分が豊富な証拠として珍重される。", tag_type="normal", sort_order=75),
    Tag(tag_id="mixed_bathing", label="混浴", description="男女が同じ浴槽に入れる混浴温泉。日本の伝統的な入浴文化。秘湯に残る貴重な文化体験。", tag_type="normal", sort_order=80),
    Tag(tag_id="open_air_bath", label="野天風呂", description="建物や屋根が一切ない完全な野外の風呂。自然の中に直接設けられ、雨や雪を直接感じながら入浴できる。", tag_type="normal", sort_order=81),
    Tag(tag_id="cave_bath", label="洞窟風呂", description="洞窟や岩窟の中に設けられた浴槽。幻想的な雰囲気が楽しめる珍しい入浴体験。", tag_type="normal", sort_order=82),
    Tag(tag_id="rock_bath", label="岩風呂", description="天然の岩や石を組んで作られた浴槽。自然の素材が醸し出す重厚な雰囲気が秘湯らしさを演出。", tag_type="normal", sort_order=83),
    Tag(tag_id="wooden_bath", label="木造浴場", description="木材で作られた浴場建築。ヒノキや杉の香りと温もりが温泉の情緒を高める。歴史ある湯治場に多い。", tag_type="normal", sort_order=84),
    Tag(tag_id="view_bath", label="展望風呂", description="山・海・湖・渓谷などの絶景が眺められる浴槽。景色を楽しみながら温泉に浸かれる。", tag_type="normal", sort_order=85),
    Tag(tag_id="foot_bath", label="足湯", description="足だけ浸かれる温泉施設。着替え不要で気軽に楽しめる。立ち寄りや休憩に最適。", tag_type="normal", sort_order=86),
    Tag(tag_id="sauna", label="サウナ", description="浴場内にサウナ設備がある。温泉とサウナを交互に楽しむ「サ活」ができる。", tag_type="normal", sort_order=87),
    Tag(tag_id="cold_bath", label="水風呂", description="サウナや熱い温泉の後に入る冷水浴槽がある。温冷交互浴で血行促進・疲労回復効果が高まる。", tag_type="normal", sort_order=88),
    Tag(tag_id="lakeside", label="湖畔", description="湖のほとりにある温泉。静かな水面と山の景色が楽しめる。", tag_type="normal", sort_order=90),
    Tag(tag_id="seaside", label="海辺", description="海岸沿いにある温泉。波の音を聞きながら海を眺めて入浴できる。", tag_type="normal", sort_order=91),
    Tag(tag_id="highland", label="高原", description="標高の高い高原地帯にある温泉。澄んだ空気と広大な眺望が楽しめる。", tag_type="normal", sort_order=92),
    Tag(tag_id="forest", label="森林", description="深い森の中にある温泉。木々に囲まれた自然環境で森林浴と温泉を同時に楽しめる。", tag_type="normal", sort_order=93),
    Tag(tag_id="gorge", label="渓谷", description="渓谷沿いにある温泉。岩肌と清流が作り出す景観の中で入浴できる。", tag_type="normal", sort_order=94),
    Tag(tag_id="autumn_leaves", label="紅葉", description="秋の紅葉シーズンに特に美しい景観が楽しめる温泉。色鮮やかな山並みを眺めながら入浴できる。", tag_type="normal", sort_order=95),
    Tag(tag_id="cherry_blossoms", label="桜", description="春の桜の季節に特に美しい温泉。満開の桜を眺めながら入浴できる。", tag_type="normal", sort_order=96),
    Tag(tag_id="sea_of_clouds", label="雲海", description="早朝に雲海が発生する標高の高い温泉。幻想的な雲の海を露天風呂から眺められる。", tag_type="normal", sort_order=97),
    Tag(tag_id="ikkenjuku", label="一軒宿", description="その場所にある唯一の宿。周辺に他の宿がなく、完全に孤立した秘境感がある究極の秘湯。", tag_type="normal", sort_order=100),
    Tag(tag_id="hitou_no_kai", label="日本秘湯を守る会加盟", description="日本秘湯を守る会に認定された温泉宿。厳しい審査基準を通過した本物の秘湯の証。", tag_type="normal", sort_order=101),
    Tag(tag_id="lamp_inn", label="ランプの宿", description="電気ではなくランプや囲炉裏を使った趣のある宿。電気が通っていない或いは敢えてランプで演出した宿。", tag_type="normal", sort_order=102),
    Tag(tag_id="thatched_roof", label="茅葺き", description="伝統的な茅葺き屋根の建物を持つ宿。日本の古き良き農村風景を体験できる歴史的建造物。", tag_type="normal", sort_order=103),
    Tag(tag_id="old_100years", label="築100年以上", description="建築から100年以上経過した歴史的な建物で営業している宿。歴史と文化を感じる貴重な体験。", tag_type="normal", sort_order=104),
    Tag(tag_id="hike_only", label="徒歩のみ", description="車道が通じておらず、徒歩でしかアクセスできない温泉。到達すること自体が冒険の秘境温泉。", tag_type="normal", sort_order=105),
    Tag(tag_id="winter_closed", label="冬季閉鎖", description="冬季に積雪や道路閉鎖で営業できない温泉。それだけ自然環境が厳しい本物の秘境にある証。", tag_type="normal", sort_order=106),
    Tag(tag_id="self_powered", label="自家発電", description="電力会社の送電網に頼らず自家発電で運営している宿。電気が届かない本物の秘境にある証。", tag_type="normal", sort_order=107),
    Tag(tag_id="remote_station", label="秘境駅からアクセス", description="利用者が少なく周囲に何もない秘境駅が最寄り駅。駅に降り立つこと自体が旅情を誘う秘湯体験。", tag_type="normal", sort_order=108),
    Tag(tag_id="japanese_room", label="和室", description="畳敷きの日本式客室。布団で寝る伝統的な宿泊スタイル。日本旅行の醍醐味を求める人向け。", tag_type="normal", sort_order=110),
    Tag(tag_id="western_room", label="洋室", description="ベッドのある西洋式客室。畳が苦手な人や膝が悪い人でも快適に過ごせる。", tag_type="normal", sort_order=111),
    Tag(tag_id="hybrid_room", label="和洋室", description="和室と洋室の要素を組み合わせた客室。畳の空間にベッドが置かれるスタイルが多い。", tag_type="normal", sort_order=112),
    Tag(tag_id="detached_room", label="離れ", description="本館から独立した別棟の客室。完全なプライバシーが確保できる特別感のある宿泊。", tag_type="normal", sort_order=113),
    Tag(tag_id="irori_cuisine", label="囲炉裏料理", description="囲炉裏を囲んで食べる伝統的な日本の食事スタイル。炭火で焼いた山の幸・川の幸が楽しめる。", tag_type="normal", sort_order=120),
    Tag(tag_id="local_cuisine", label="郷土料理", description="その土地ならではの伝統的な料理が楽しめる。旅先の食文化を深く体験できる。", tag_type="normal", sort_order=121),
    Tag(tag_id="sansai", label="山菜料理", description="山から採れた山菜を使った料理が中心。春の旬の山菜を活かした素朴で滋味深い料理。", tag_type="normal", sort_order=122),
    Tag(tag_id="gibier", label="ジビエ料理", description="猪・鹿・熊などの野生鳥獣を使った料理。山深い宿ならではの力強い食材体験。", tag_type="normal", sort_order=123),
    Tag(tag_id="river_fish", label="川魚料理", description="清流で獲れたイワナ・ヤマメ・アユなどの川魚料理が楽しめる。山の秘湯宿ならではの食体験。", tag_type="normal", sort_order=124),
    Tag(tag_id="local_sake", label="地酒充実", description="その土地の地酒・地ビール・地ワインが豊富に揃っている。食事と一緒に地域の酒文化を楽しめる。", tag_type="normal", sort_order=125),
    Tag(tag_id="allergy_friendly", label="アレルギー対応", description="食物アレルギーに応じてメニューを調整してくれる。アレルギーを持つ人も安心して食事を楽しめる。", tag_type="normal", sort_order=126),
    Tag(tag_id="car_required", label="車必須", description="公共交通機関でのアクセスが困難で、車がないと訪問できない温泉。その分人が少なく秘境感が高い。", tag_type="normal", sort_order=130),
    Tag(tag_id="transit_only", label="公共交通のみ", description="車道はあるが駐車場がなく、電車・バスでのみアクセスできる温泉。車を持たない旅人に最適。", tag_type="normal", sort_order=131),
    Tag(tag_id="near_station", label="最寄駅から○分以内", description="最寄り駅から徒歩や送迎で短時間で到着できる。移動の負担が少なくアクセスしやすい。", tag_type="normal", sort_order=132),
    Tag(tag_id="near_ic", label="最寄ICから○分以内", description="高速道路の最寄りインターチェンジから短時間で到着できる。車での移動負担が少ない。", tag_type="normal", sort_order=133),
    Tag(tag_id="wifi", label="Wi-Fiあり", description="無線LANインターネット接続が利用できる。リモートワークや情報収集が必要な旅行者向け。", tag_type="normal", sort_order=140),
    Tag(tag_id="no_wifi", label="Wi-Fiなし", description="インターネット接続環境がない。デジタルデトックスを目的に完全にオフラインな時間を過ごせる。", tag_type="normal", sort_order=141),
    Tag(tag_id="ev_charger", label="EV充電器", description="電気自動車の充電設備がある。EV・PHVで旅行する人が安心してアクセスできる。", tag_type="normal", sort_order=142),
    Tag(tag_id="laundry", label="ランドリー", description="コインランドリーまたはランドリーサービスがある。連泊や長期滞在でも衣類を清潔に保てる。", tag_type="normal", sort_order=143),
    Tag(tag_id="shop", label="売店", description="館内に売店があり、土産物や日用品を購入できる。急な忘れ物にも対応できる。", tag_type="normal", sort_order=144),
    Tag(tag_id="lounge", label="ラウンジ", description="宿泊客がくつろげる共有ラウンジスペースがある。読書や休憩に使える落ち着いた空間。", tag_type="normal", sort_order=145),
    Tag(tag_id="toji", label="湯治向け", description="療養目的の長期滞在（湯治）に対応した施設。自炊設備や湯治料金プランがある昔ながらの湯治場。", tag_type="normal", sort_order=150),
    Tag(tag_id="workation", label="ワーケーション向け", description="リモートワークをしながら温泉滞在ができる環境が整っている。Wi-Fi・デスク・電源が充実。", tag_type="normal", sort_order=151),
    Tag(tag_id="photogenic", label="写真映え", description="SNSや写真作品として映える景観・内装・料理がある。フォトジェニックな温泉体験を求める人向け。", tag_type="normal", sort_order=152),
    Tag(tag_id="retro", label="レトロ", description="昭和レトロや大正ロマンの雰囲気が残る温泉施設。古き良き時代の雰囲気に浸れる。", tag_type="normal", sort_order=153),
    Tag(tag_id="luxury", label="高級旅館", description="一流の料理・サービス・設備を誇る高級温泉旅館。記念日や特別な旅行に選ばれる施設。", tag_type="normal", sort_order=154),
    Tag(tag_id="quiet_inn", label="静かな宿", description="館内が静かで落ち着いた雰囲気の宿。大人数グループや子供の利用が少なく、静寂を好む人に向く。", tag_type="normal", sort_order=155),
    Tag(tag_id="no_signal", label="携帯圏外歓迎", description="携帯電話の電波が届かない圏外エリアにある。スマホを手放してデジタルデトックスをしたい人向け。", tag_type="normal", sort_order=156),
]

tags_interactive = [
    Tag(
        tag_id="budget", label="予算", description="入浴料金または宿泊料金の上限を指定して絞り込む。",
        tag_type="interactive", interactive_type="slider",
        interactive_config={"min": 0, "max": 5000, "step": 500, "unit": "円"},
        is_hard_filter=True, sort_order=1,
    ),
    Tag(
        tag_id="stay_type", label="滞在", description="日帰り入浴のみか宿泊も含めるかを選択する。",
        tag_type="interactive", interactive_type="select",
        interactive_config={"options": ["日帰り", "宿泊"]},
        is_hard_filter=True, sort_order=2,
    ),
]

all_tags = tags_normal + tags_interactive
db.add_all(all_tags)
db.flush()
tag_map = {t.tag_id: t for t in all_tags}

# ---------------------------------------------------------------------------
# 4. タグ説明文の埋め込み → tag_embeddings
# ---------------------------------------------------------------------------

tag_vectors: dict[int, np.ndarray] = {}
for tag in all_tags:
    vec = embedder.embed_document(tag.description)
    tag_vectors[tag.id] = vec
    db.add(TagEmbedding(
        tag_id=tag.id,
        model_version=MODEL_VERSION,
        vector=serialize_vector(vec),
        dim=len(vec),
        content_hash=content_hash(tag.description),
    ))
db.flush()
print(f"tag_embeddings: {len(all_tags)}件 埋め込み完了")

# ---------------------------------------------------------------------------
# 5. 本文チャンク分割 → 埋め込み → onsen_embeddings
# ---------------------------------------------------------------------------

onsen_chunk_vectors: dict[str, np.ndarray] = {}  # slug -> (N_chunks, dim)

for data in ONSENS:
    slug = data["slug"]
    onsen = onsen_objs[slug]
    body = build_body_markdown(
        data["intro_text"], data["quietness_comment"], data["solitude_comment"],
        data["accessibility_comment"], data["bathing_review"],
    )
    chunks = split_into_chunks(body)
    vectors = []
    for i, chunk_text in enumerate(chunks):
        vec = embedder.embed_document(chunk_text)
        vectors.append(vec)
        db.add(OnsenEmbedding(
            onsen_id=onsen.id,
            chunk_index=i,
            chunk_text=chunk_text,
            vector=serialize_vector(vec),
            dim=len(vec),
            model_version=MODEL_VERSION,
            content_hash=content_hash(body),
        ))
    onsen_chunk_vectors[slug] = np.stack(vectors)
    print(f"onsen_embeddings: {slug} — {len(chunks)}チャンク")

db.flush()

# ---------------------------------------------------------------------------
# 6. タグ自動付与（AI提案） → onsen_tags(status='proposed')
# ---------------------------------------------------------------------------

proposed: dict[str, dict[str, float]] = {}  # slug -> {tag_id_str: confidence}

for data in ONSENS:
    slug = data["slug"]
    chunk_matrix = onsen_chunk_vectors[slug]
    sims = {tag.tag_id: max_chunk_similarity(tag_vectors[tag.id], chunk_matrix) for tag in tags_normal}
    threshold = float(np.percentile(list(sims.values()), TAG_SUGGESTION_PERCENTILE))
    candidates = {tag_id: sim for tag_id, sim in sims.items() if sim >= threshold}
    proposed[slug] = candidates
    print(f"AI提案: {slug} — 閾値{threshold:.3f} {len(candidates)}件 ({sorted(candidates, key=candidates.get, reverse=True)[:8]})")

# ---------------------------------------------------------------------------
# 7. 執筆者による承認/却下（私が執筆者役を代行） → status確定
# ---------------------------------------------------------------------------

approved_count = 0
rejected_count = 0
manual_count = 0

for data in ONSENS:
    slug = data["slug"]
    onsen = onsen_objs[slug]
    truth = GROUND_TRUTH_TAGS.get(slug, set())
    candidates = proposed[slug]

    # AI提案分を承認/却下
    for tag_id_str, sim in candidates.items():
        tag = tag_map[tag_id_str]
        status = "approved" if tag_id_str in truth else "rejected"
        db.add(OnsenTag(
            onsen_id=onsen.id, tag_id=tag.id,
            confidence=Decimal(str(round(sim, 2))),
            status=status,
        ))
        if status == "approved":
            approved_count += 1
        else:
            rejected_count += 1

    # AIが拾わなかった正解タグは、執筆者が手動追加（confidence=1.00, 最初からapproved）
    missed = truth - set(candidates.keys())
    for tag_id_str in missed:
        tag = tag_map[tag_id_str]
        db.add(OnsenTag(
            onsen_id=onsen.id, tag_id=tag.id,
            confidence=Decimal("1.00"),
            status="approved",
        ))
        manual_count += 1

db.commit()
db.close()

print(
    f"Seed data inserted: onsens={len(ONSENS)}, tags={len(all_tags)}, "
    f"onsen_tags(approved)={approved_count + manual_count} "
    f"(AI承認={approved_count}, 手動追加={manual_count}, 却下={rejected_count})"
)
