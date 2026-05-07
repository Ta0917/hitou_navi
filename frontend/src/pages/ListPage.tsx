import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

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

export default function ListPage() {
  const [onsenList, setOnsenList] = useState<Onsen[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('/api/onsen').then(res => {
      setOnsenList(res.data)
    })
  }, [])

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🌸 俺の最強温泉リスト</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {onsenList.map(onsen => (
          <div
            key={onsen.id}
            className="bg-white rounded-xl shadow p-5 cursor-pointer hover:shadow-md transition"
            onClick={() => navigate(`/onsen/${onsen.id}`)}
          >
            <h2 className="text-lg font-semibold text-gray-700">{onsen.name}</h2>
            <p className="text-sm text-gray-400 mb-3">{onsen.region}</p>
            <div className="text-sm text-gray-600 space-y-1">
              <p>静けさ：{onsen.quietness}</p>
              <p>ソロ適性：{onsen.solo_score}</p>
              <p>アクセス：{onsen.access_score}</p>
            </div>
            <p className="text-xs text-gray-400 mt-3">{onsen.memo}</p>
          </div>
        ))}
      </div>
    </div>
  )
}