import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

type Item = {
  id: number
  name: string
  description: string | null
}

export default function ListPage() {
  const [items, setItems] = useState<Item[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    axios.get('/api/items').then(res => setItems(res.data))
  }, [])

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Items</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <div
            key={item.id}
            className="bg-white rounded-xl shadow p-5 cursor-pointer hover:shadow-md transition"
            onClick={() => navigate(`/items/${item.id}`)}
          >
            <h2 className="text-lg font-semibold text-gray-700">{item.name}</h2>
            <p className="text-sm text-gray-400 mt-2">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
