import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'

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

export default function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [onsen, setOnsen] = useState<Onsen | null>(null)

  useEffect(() => {
    axios.get(`/api/onsen/${id}`).then(res => {
      setOnsen(res.data)
    })
  }, [id])

  if (!onsen) return <p className="p-8">読み込み中...</p>

  const chartData = [
    { subject: '静けさ', value: onsen.quietness },
    { subject: 'ソロ適性', value: onsen.solo_score },
    { subject: 'アクセス', value: onsen.access_score },
  ]

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-blue-500 hover:underline"
      >
        ← 一覧に戻る
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">{onsen.name}</h1>
      <p className="text-gray-400 mb-6">{onsen.region}</p>
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow p-6 space-y-2 text-sm text-gray-600">
        <p>混雑傾向：{onsen.crowd_tendency}</p>
        <p>メモ：{onsen.memo}</p>
        <p>タグ：{onsen.tags}</p>
      </div>
    </div>
  )
}