import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

type Item = {
  id: number
  name: string
  description: string | null
}

export default function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<Item | null>(null)

  useEffect(() => {
    axios.get(`/api/items/${id}`).then(res => setItem(res.data))
  }, [id])

  if (!item) return <p className="p-8">Loading...</p>

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-blue-500 hover:underline"
      >
        ← Back to list
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">{item.name}</h1>
      <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-600">
        <p>{item.description}</p>
      </div>
    </div>
  )
}
