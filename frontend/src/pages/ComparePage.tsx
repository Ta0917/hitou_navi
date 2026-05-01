import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, Legend, ResponsiveContainer } from 'recharts'

type Onsen = {
  id: number
  name: string
  region: string
  quietness: number
  solo_score: number
  access_score: number
  crowd_tendency: string
  memo: string
  tags: string
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981']

export default function ComparePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const ids = searchParams.get('ids')?.split(',') ?? []
  const [onsenList, setOnsenList] = useState<Onsen[]>([])

  useEffect(() => {
    Promise.all(
      ids.map(id => axios.get(`/api/onsen/${id}`).then(res => res.data))
    ).then(setOnsenList)
  }, [])

  if (onsenList.length === 0) return <p className="p-8">読み込み中...</p>

  const chartData = [
    { subject: '静けさ', ...Object.fromEntries(onsenList.map(o => [o.name, o.quietness])) },
    { subject: 'ソロ適性', ...Object.fromEntries(onsenList.map(o => [o.name, o.solo_score])) },
    { subject: 'アクセス', ...Object.fromEntries(onsenList.map(o => [o.name, o.access_score])) },
  ]

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-blue-500 hover:underline"
      >
        ← 一覧に戻る
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">温泉比較</h1>
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <ResponsiveContainer width="100%" height={350}>
          <RadarChart data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            {onsenList.map((onsen, i) => (
              <Radar
                key={onsen.id}
                dataKey={onsen.name}
                stroke={COLORS[i]}
                fill={COLORS[i]}
                fillOpacity={0.3}
              />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {onsenList.map((onsen, i) => (
          <div key={onsen.id} className="bg-white rounded-xl shadow p-5">
            <h2 className="font-semibold text-gray-700" style={{ color: COLORS[i] }}>{onsen.name}</h2>
            <p className="text-sm text-gray-400 mb-2">{onsen.region}</p>
            <div className="text-sm text-gray-600 space-y-1">
              <p>静けさ：{onsen.quietness}</p>
              <p>ソロ適性：{onsen.solo_score}</p>
              <p>アクセス：{onsen.access_score}</p>
              <p>混雑：{onsen.crowd_tendency}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}