import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

type Onsen = {
  id: number
  slug: string
  name: string
  region: string
  prefecture: string
  area: string
  quietness_score: number
  solitude_score: number
  accessibility_score: number
  hero_image_url: string | null
  admission_fee_min: number | null
}

type MatchedTag = {
  keyword: string
  tag_id: string
  label: string
  similarity: number
}

type SearchResponse = {
  results: Onsen[]
  matched_tags: MatchedTag[]
  body_queries: string[]
  name_matched_slugs: string[]
}

const PAGE_SIZE = 8

export default function SearchTestPage() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')

  const [core, setCore] = useState('')
  const [tagIds, setTagIds] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [area, setArea] = useState('')
  const [tripType, setTripType] = useState('')

  const [results, setResults] = useState<Onsen[] | null>(null)
  const [matchedTags, setMatchedTags] = useState<MatchedTag[]>([])
  const [bodyQueries, setBodyQueries] = useState<string[]>([])
  const [nameMatchedSlugs, setNameMatchedSlugs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const handleSearch = () => {
    setLoading(true)
    setError('')
    axios
      .post<SearchResponse>('/api/search', {
        core,
        tag_ids: tagIds.split(',').map((s) => s.trim()).filter(Boolean),
        budget_max: budgetMax === '' ? null : Number(budgetMax),
        prefecture: prefecture || null,
        area: area || null,
        trip_type: tripType || null,
      })
      .then((res) => {
        setResults(res.data.results)
        setMatchedTags(res.data.matched_tags)
        setBodyQueries(res.data.body_queries)
        setNameMatchedSlugs(res.data.name_matched_slugs)
        setPage(1)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  const totalPages = results ? Math.max(1, Math.ceil(results.length / PAGE_SIZE)) : 1
  const pageResults = results ? results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : []

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded shadow w-80">
          <h2 className="text-xl font-bold mb-4">管理者認証</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password === '9767') setAuthed(true)
            }}
            placeholder="パスワード"
            className="w-full border rounded px-3 py-2 mb-3 text-sm"
          />
          <button
            onClick={() => { if (password === '9767') setAuthed(true) }}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm"
          >
            ログイン
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-screen-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">検索ロジック 動作確認</h1>

      <div className="bg-gray-50 p-4 rounded border mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">core（スペース区切りキーワード）</label>
          <input
            value={core}
            onChange={(e) => setCore(e.target.value)}
            placeholder="静か 露天風呂"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">tag_ids（カンマ区切り、例: mixed_bathing,gorge）</label>
          <input
            value={tagIds}
            onChange={(e) => setTagIds(e.target.value)}
            placeholder="mixed_bathing,gorge"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">budget_max（円、上限）</label>
          <input
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="1000"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">prefecture</label>
          <input
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            placeholder="秋田県"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">area</label>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="東北"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">trip_type（日帰り/宿泊フィルタ）</label>
          <select
            value={tripType}
            onChange={(e) => setTripType(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="">未指定</option>
            <option value="day_trip">日帰り可のみ</option>
            <option value="stay">宿泊可のみ</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 text-sm disabled:opacity-50"
          >
            {loading ? '検索中…' : '検索実行'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {results !== null && (matchedTags.length > 0 || bodyQueries.length > 0 || nameMatchedSlugs.length > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-sm">
          <p className="font-bold text-xs text-gray-500 mb-2">core入力の内訳</p>
          {nameMatchedSlugs.length > 0 && (
            <p className="mb-1">
              <span className="text-gray-500">施設名一致（ブースト、除外なし）：</span>
              {nameMatchedSlugs.map((slug) => (
                <span key={slug} className="inline-block bg-orange-100 text-orange-800 rounded-full px-2 py-0.5 text-xs mr-2">
                  {slug}
                </span>
              ))}
            </p>
          )}
          {matchedTags.length > 0 && (
            <p className="mb-1">
              <span className="text-gray-500">タグ変換：</span>
              {matchedTags.map((m) => (
                <span key={m.keyword} className="inline-block bg-green-100 text-green-800 rounded-full px-2 py-0.5 text-xs mr-2">
                  「{m.keyword}」→ {m.label}（sim={m.similarity.toFixed(3)}）
                </span>
              ))}
            </p>
          )}
          {bodyQueries.length > 0 && (
            <p>
              <span className="text-gray-500">本文類似度クエリ：</span>
              {bodyQueries.map((q) => (
                <span key={q} className="inline-block bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs mr-2">
                  「{q}」
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {results !== null && (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {results.length} 件ヒット（{page} / {totalPages} ページ）
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {pageResults.map((o, idx) => (
              <div
                key={o.slug}
                onClick={() =>
                  navigate(`/admin/search-test/${o.slug}`, {
                    state: {
                      topThree: pageResults.map((r) => ({
                        slug: r.slug,
                        name: r.name,
                        hero_image_url: r.hero_image_url,
                      })),
                    },
                  })
                }
                className="border rounded overflow-hidden bg-white cursor-pointer hover:shadow-md transition-shadow"
              >
                <img
                  src={o.hero_image_url ?? ''}
                  alt={o.name}
                  className="w-full h-32 object-cover bg-gray-200"
                />
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-0.5">#{(page - 1) * PAGE_SIZE + idx + 1}</p>
                  <p className="font-bold text-sm">{o.name}</p>
                  <p className="text-xs text-gray-500">{o.region}（{o.prefecture} / {o.area}）</p>
                  <p className="text-xs mt-1">
                    静けさ{o.quietness_score} / ソロ{o.solitude_score} / アクセス{o.accessibility_score}
                  </p>
                  <p className="text-xs text-gray-500">
                    {o.admission_fee_min !== null ? `${o.admission_fee_min}円〜` : '料金不明'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                ← 前へ
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                次へ →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
