// UI_DESIGN.md「詳細ページ / セクション構成（確定版）」に準拠した簡易表示。
// 検索ロジック動作確認（SearchTestPage）専用の実装で、演出（地図切り替えアニメーション等）は省略している。
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import axios from 'axios'

type Tag = { id: number; tag_id: string; label: string }
type OnsenTag = { id: number; status: 'proposed' | 'approved' | 'rejected'; tag: Tag }
type Photo = { id: number; url: string; category: string; caption: string | null; is_hero: boolean }
type NearbySpot = { id: number; name: string; distance: string | null; transport_method: string | null; description: string | null }

type SpringInfo = {
  spring_type: string | null; source_name: string | null
  source_temperature: string | null; ph: string | null; total_dissolved_solids: string | null
  water_added: string | null; heated: string | null; circulation: string | null; disinfected: string | null
  indoor_baths_count: number | null; outdoor_bath: boolean | null; private_bath: boolean | null
  sauna: boolean | null; cold_bath: boolean | null
  source_usage_rate: string | null; spout_temperature: string | null
  yuka_present: boolean | null; drinkable: boolean | null; analysis_pdf_url: string | null
}

type Accommodation = {
  room_types: string | null; room_style: string | null; smoking_policy: string | null
  room_outdoor_bath: boolean | null; dinner_type: string | null; breakfast_type: string | null
  room_dining: boolean | null; local_ingredients: boolean | null; facilities: string | null
  signal_info: string | null; outlet_count: number | null; vending_machine_price: string | null
  luggage_storage: boolean | null; late_checkout_bath: boolean | null
}

type Access = {
  public_transport_route: string | null; car_route: string | null; winter_road_notes: string | null
  convenience_store_distance: string | null; google_maps_embed_url: string | null
  google_maps_link_url: string | null
  nearest_ic_minutes: number | null; nearest_station_walk_minutes: number | null
}

type BookingLinks = {
  official_website: string | null; official_booking_url: string | null
  jalan_url: string | null; rakuten_travel_url: string | null; ikyu_url: string | null
}

type OnsenDetail = {
  id: number; slug: string; name: string; region: string; prefecture: string; area: string
  address: string | null; phone: string | null; business_hours: string | null; closed_days: string | null
  admission_fee: string | null; admission_fee_min: number | null; lodging_fee_min: number | null
  day_trip_available: boolean; accommodation_available: boolean
  parking_available: boolean | null; wifi_available: boolean | null
  established_year: number | null; room_count: number | null
  hero_image_url: string | null; intro_text: string | null
  quietness_score: number; quietness_comment: string | null
  solitude_score: number; solitude_comment: string | null
  accessibility_score: number; accessibility_comment: string | null
  bathing_review: string | null
  last_visited_date: string | null; info_updated_date: string | null
  spring_info: SpringInfo | null
  accommodation: Accommodation | null
  access: Access | null
  nearby_spots: NearbySpot[]
  photos: Photo[]
  booking_links: BookingLinks | null
  onsen_tags: OnsenTag[]
}

type TopThreeItem = { slug: string; name: string; hero_image_url: string | null }

function ScoreBar({ label, score, comment }: { label: string; score: number; comment: string | null }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium w-24">{label}</span>
        <div className="flex-1 bg-gray-200 rounded h-2">
          <div className="bg-green-700 h-2 rounded" style={{ width: `${(score / 5) * 100}%` }} />
        </div>
        <span className="text-xs text-gray-500">{score}/5</span>
      </div>
      {comment && <p className="text-xs text-gray-600 ml-24">{comment}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 border-t pt-4">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      {children}
    </section>
  )
}

function yn(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '不明'
  return v ? 'あり' : 'なし'
}

export default function OnsenDetailTestPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const topThree = (location.state as { topThree?: TopThreeItem[] } | null)?.topThree

  // 公開ルート(/onsens)と検索確認ルート(/admin/search-test)の両方で使う。遷移先の基点を切り替える。
  const base = location.pathname.startsWith('/onsens') ? '/onsens' : '/admin/search-test'
  const backTo = base === '/onsens' ? '/' : '/admin/search-test'
  const backLabel = base === '/onsens' ? 'トップに戻る' : '検索に戻る'

  const [onsen, setOnsen] = useState<OnsenDetail | null>(null)

  useEffect(() => {
    if (!slug) return
    axios.get(`/api/onsens/${slug}`).then((res) => setOnsen(res.data))
  }, [slug])

  if (!onsen) {
    return <div className="p-6 text-sm text-gray-500">読み込み中…</div>
  }

  const approvedTags = onsen.onsen_tags.filter((ot) => ot.status === 'approved')
  const photosByCategory = onsen.photos.reduce<Record<string, Photo[]>>((acc, p) => {
    ;(acc[p.category] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 固定ヘッダー：小カードナビ（UI_DESIGN.md「固定ヘッダー」） */}
      {topThree && topThree.length > 0 && (
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm flex gap-2 p-2">
          {topThree.map((t) => (
            <button
              key={t.slug}
              onClick={() => navigate(`${base}/${t.slug}`, { state: { topThree } })}
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs border ${
                t.slug === slug ? 'border-green-700 bg-green-50 font-bold' : 'border-gray-200'
              }`}
            >
              <img src={t.hero_image_url ?? ''} alt={t.name} className="w-8 h-8 object-cover rounded bg-gray-200" />
              {t.name}
            </button>
          ))}
          <Link to={backTo} className="ml-auto text-xs text-gray-500 self-center underline">
            {backLabel}
          </Link>
        </div>
      )}

      {/* ヒーロー */}
      <div className="relative h-64 bg-gray-800">
        <img src={onsen.hero_image_url ?? ''} alt={onsen.name} className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-black/30 flex items-end">
          <h1 className="text-white text-2xl font-bold p-6">{onsen.name}</h1>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto p-6">
        {/* 紹介文（intro_text。本文チャンク分割・埋め込みの対象でもある） */}
        {onsen.intro_text && (
          <p className="text-sm leading-relaxed bg-white p-4 rounded border mb-6">{onsen.intro_text}</p>
        )}

        {/* タグ（承認済みのみ、ラベル表示） */}
        {approvedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {approvedTags.map((ot) => (
              <span key={ot.id} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                {ot.tag.label}
              </span>
            ))}
          </div>
        )}

        {/* ① 秘湯スコア＋編集コメント */}
        <Section title="① 秘湯スコア">
          <ScoreBar label="静けさ" score={onsen.quietness_score} comment={onsen.quietness_comment} />
          <ScoreBar label="ソロ適性" score={onsen.solitude_score} comment={onsen.solitude_comment} />
          <ScoreBar label="アクセス難易度" score={onsen.accessibility_score} comment={onsen.accessibility_comment} />
          {onsen.bathing_review && (
            <p className="text-sm mt-3 bg-white p-3 rounded border">{onsen.bathing_review}</p>
          )}
        </Section>

        {/* ② 基本情報 */}
        <Section title="② 基本情報">
          <table className="text-sm w-full">
            <tbody>
              <tr><td className="text-gray-500 w-32 py-0.5">所在地</td><td>{onsen.address ?? '—'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">電話番号</td><td>{onsen.phone ?? '—'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">営業時間</td><td>{onsen.business_hours ?? '—'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">定休日</td><td>{onsen.closed_days ?? '—'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">日帰り入浴料</td><td>{onsen.admission_fee ?? '—'}</td></tr>
              {onsen.accommodation_available && (
                <tr><td className="text-gray-500 py-0.5">宿泊料（1人〜）</td><td>{onsen.lodging_fee_min !== null ? `${onsen.lodging_fee_min.toLocaleString()}円〜` : '—'}</td></tr>
              )}
              <tr><td className="text-gray-500 py-0.5">日帰り可否</td><td>{onsen.day_trip_available ? '可' : '不可'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">宿泊可否</td><td>{onsen.accommodation_available ? '可' : '不可'}</td></tr>
              <tr><td className="text-gray-500 py-0.5">駐車場</td><td>{yn(onsen.parking_available)}</td></tr>
              <tr><td className="text-gray-500 py-0.5">Wi-Fi</td><td>{yn(onsen.wifi_available)}</td></tr>
              {onsen.established_year && <tr><td className="text-gray-500 py-0.5">開業年</td><td>{onsen.established_year}年</td></tr>}
              {onsen.accommodation_available && onsen.room_count && <tr><td className="text-gray-500 py-0.5">客室数</td><td>{onsen.room_count}室</td></tr>}
            </tbody>
          </table>
        </Section>

        {/* ③ 温泉情報 */}
        {onsen.spring_info && (
          <Section title="③ 温泉情報">
            <table className="text-sm w-full mb-3">
              <tbody>
                <tr><td className="text-gray-500 w-32 py-0.5">泉質</td><td>{onsen.spring_info.spring_type ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">源泉名</td><td>{onsen.spring_info.source_name ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">源泉温度</td><td>{onsen.spring_info.source_temperature ? `${onsen.spring_info.source_temperature}℃` : '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">pH</td><td>{onsen.spring_info.ph ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">成分総計</td><td>{onsen.spring_info.total_dissolved_solids ? `${onsen.spring_info.total_dissolved_solids}mg/L` : '—'}</td></tr>
              </tbody>
            </table>

            <p className="text-xs text-gray-500 mb-1">運用状況</p>
            <table className="text-sm w-full mb-3 border">
              <tbody>
                <tr><td className="border px-2 py-1">加水</td><td className="border px-2 py-1">{onsen.spring_info.water_added ?? '不明'}</td>
                    <td className="border px-2 py-1">加温</td><td className="border px-2 py-1">{onsen.spring_info.heated ?? '不明'}</td></tr>
                <tr><td className="border px-2 py-1">循環</td><td className="border px-2 py-1">{onsen.spring_info.circulation ?? '不明'}</td>
                    <td className="border px-2 py-1">消毒</td><td className="border px-2 py-1">{onsen.spring_info.disinfected ?? '不明'}</td></tr>
              </tbody>
            </table>

            <table className="text-sm w-full">
              <tbody>
                <tr><td className="text-gray-500 w-32 py-0.5">内湯数</td><td>{onsen.spring_info.indoor_baths_count ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">露天風呂</td><td>{yn(onsen.spring_info.outdoor_bath)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">貸切風呂</td><td>{yn(onsen.spring_info.private_bath)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">サウナ</td><td>{yn(onsen.spring_info.sauna)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">水風呂</td><td>{yn(onsen.spring_info.cold_bath)}</td></tr>
                {onsen.spring_info.source_usage_rate && <tr><td className="text-gray-500 py-0.5">源泉利用率</td><td>{onsen.spring_info.source_usage_rate}</td></tr>}
                {onsen.spring_info.spout_temperature && <tr><td className="text-gray-500 py-0.5">湯口温度</td><td>{onsen.spring_info.spout_temperature}℃</td></tr>}
                {onsen.spring_info.yuka_present !== null && <tr><td className="text-gray-500 py-0.5">湯花</td><td>{yn(onsen.spring_info.yuka_present)}</td></tr>}
                {onsen.spring_info.drinkable !== null && <tr><td className="text-gray-500 py-0.5">飲泉可否</td><td>{yn(onsen.spring_info.drinkable)}</td></tr>}
              </tbody>
            </table>
          </Section>
        )}

        {/* ④ 宿泊情報 */}
        <Section title="④ 宿泊情報">
          {!onsen.accommodation ? (
            <p className="text-sm text-gray-500">宿泊情報：なし</p>
          ) : (
            <table className="text-sm w-full">
              <tbody>
                <tr><td className="text-gray-500 w-32 py-0.5">客室タイプ</td><td>{onsen.accommodation.room_types ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">和洋</td><td>{onsen.accommodation.room_style ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">喫煙</td><td>{onsen.accommodation.smoking_policy ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">客室露天風呂</td><td>{yn(onsen.accommodation.room_outdoor_bath)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">夕食形式</td><td>{onsen.accommodation.dinner_type ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">朝食形式</td><td>{onsen.accommodation.breakfast_type ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">部屋食</td><td>{yn(onsen.accommodation.room_dining)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">地元食材</td><td>{yn(onsen.accommodation.local_ingredients)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">館内設備</td><td>{onsen.accommodation.facilities ?? '—'}</td></tr>
              </tbody>
            </table>
          )}
        </Section>

        {/* ⑤ 宿泊者向け実用情報（宿泊可施設のみ） */}
        {onsen.accommodation && (
          <Section title="⑤ 宿泊者向け実用情報">
            <table className="text-sm w-full">
              <tbody>
                <tr><td className="text-gray-500 w-32 py-0.5">電波状況</td><td>{onsen.accommodation.signal_info ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">コンセント数</td><td>{onsen.accommodation.outlet_count ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">自販機価格</td><td>{onsen.accommodation.vending_machine_price ?? '—'}</td></tr>
                <tr><td className="text-gray-500 py-0.5">荷物預かり</td><td>{yn(onsen.accommodation.luggage_storage)}</td></tr>
                <tr><td className="text-gray-500 py-0.5">チェックアウト後入浴</td><td>{yn(onsen.accommodation.late_checkout_bath)}</td></tr>
              </tbody>
            </table>
          </Section>
        )}

        {/* ⑥ アクセス ＋ ⑦ 周辺観光（地図固定は省略、簡易版） */}
        {onsen.access && (
          <Section title="⑥ アクセス">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-sm space-y-2">
                {onsen.access.public_transport_route && <p><span className="text-gray-500">公共交通：</span>{onsen.access.public_transport_route}</p>}
                {onsen.access.car_route && <p><span className="text-gray-500">車：</span>{onsen.access.car_route}</p>}
                {onsen.access.winter_road_notes && <p><span className="text-gray-500">冬季注意：</span>{onsen.access.winter_road_notes}</p>}
                {onsen.access.convenience_store_distance && <p><span className="text-gray-500">コンビニまで：</span>{onsen.access.convenience_store_distance}</p>}
                {onsen.access.google_maps_link_url && (
                  <a href={onsen.access.google_maps_link_url} target="_blank" rel="noreferrer" className="inline-block text-xs bg-green-700 text-white px-3 py-1 rounded">
                    Googleマップで開く
                  </a>
                )}
              </div>
              <div className="bg-gray-200 h-40 flex items-center justify-center text-xs text-gray-500 rounded">
                {onsen.access.google_maps_embed_url ? '地図埋め込み（URLあり）' : '地図情報なし'}
              </div>
            </div>

            {/* アクセス時間（最寄IC・最寄駅から徒歩）: UIは未実装、表示エリアの確保のみ */}
            <div className="text-sm border rounded p-3 mt-4 bg-white">
              <p className="text-xs text-gray-400 mb-1">アクセス時間（仮表示）</p>
              <p>最寄ICから：{onsen.access.nearest_ic_minutes !== null ? `${onsen.access.nearest_ic_minutes}分` : '情報なし'}</p>
              <p>最寄駅から徒歩：{onsen.access.nearest_station_walk_minutes !== null ? `${onsen.access.nearest_station_walk_minutes}分` : '情報なし'}</p>
            </div>
          </Section>
        )}

        {onsen.nearby_spots.length > 0 && (
          <Section title="⑦ 周辺観光">
            <ul className="text-sm space-y-2">
              {onsen.nearby_spots.map((s) => (
                <li key={s.id} className="border-b pb-1">
                  <span className="font-medium">{s.name}</span>
                  {s.distance && <span className="text-gray-500"> ・ {s.distance}</span>}
                  {s.transport_method && <span className="text-gray-500">（{s.transport_method}）</span>}
                  {s.description && <p className="text-gray-600 text-xs mt-0.5">{s.description}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ⑧ 写真ギャラリー */}
        {onsen.photos.length > 0 && (
          <Section title="⑧ 写真ギャラリー">
            {Object.entries(photosByCategory).map(([category, photos]) => (
              <div key={category} className="mb-4">
                <p className="text-xs text-gray-500 mb-1">{category}</p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <img key={p.id} src={p.url} alt={p.caption ?? onsen.name} className="w-full h-24 object-cover rounded" />
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* ⑨ 予約リンク */}
        {onsen.booking_links && (
          <Section title="⑨ 予約リンク">
            <div className="flex flex-wrap gap-2 text-sm">
              {onsen.booking_links.official_website && <a href={onsen.booking_links.official_website} target="_blank" rel="noreferrer" className="underline text-blue-700">公式サイト</a>}
              {onsen.booking_links.official_booking_url && <a href={onsen.booking_links.official_booking_url} target="_blank" rel="noreferrer" className="underline text-blue-700">公式予約</a>}
              {onsen.booking_links.jalan_url && <a href={onsen.booking_links.jalan_url} target="_blank" rel="noreferrer" className="underline text-blue-700">じゃらん</a>}
              {onsen.booking_links.rakuten_travel_url && <a href={onsen.booking_links.rakuten_travel_url} target="_blank" rel="noreferrer" className="underline text-blue-700">楽天トラベル</a>}
              {onsen.booking_links.ikyu_url && <a href={onsen.booking_links.ikyu_url} target="_blank" rel="noreferrer" className="underline text-blue-700">一休</a>}
            </div>
          </Section>
        )}

        {/* ⑩ 更新情報 */}
        <Section title="⑩ 更新情報">
          <p className="text-sm text-gray-600">最終訪問日：{onsen.last_visited_date ?? '不明'}</p>
          <p className="text-sm text-gray-600">情報更新日：{onsen.info_updated_date ?? '不明'}</p>
        </Section>
      </div>
    </div>
  )
}
