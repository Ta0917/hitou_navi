import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

export default function TopPage() {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    axios
      .get('/api/onsens')
      .then((res) => setCount(res.data.length))
      .catch(() => setError(true))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold text-gray-800">秘湯ナビ</h1>
      <p className="text-gray-600 text-lg">
        {error ? '接続エラー' : count === null ? '読み込み中...' : `温泉データ: ${count}件`}
      </p>
      <Link to="/admin" className="text-blue-600 hover:underline text-sm">
        管理者ページ
      </Link>
    </div>
  )
}
