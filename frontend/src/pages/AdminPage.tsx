import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

type Row = Record<string, unknown>

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [records, setRecords] = useState<Row[]>([])
  const [formData, setFormData] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!authed) return
    axios.get('/api/admin/tables').then((res) => {
      setTables(res.data)
      if (res.data.length > 0) setSelectedTable(res.data[0])
    })
  }, [authed])

  const fetchRecords = useCallback(() => {
    if (!selectedTable) return
    axios.get(`/api/admin/tables/${selectedTable}`).then((res) => {
      setRecords(res.data)
    })
  }, [selectedTable])

  useEffect(() => {
    if (!selectedTable) return
    axios.get(`/api/admin/tables/${selectedTable}/columns`).then((res) => {
      const init: Record<string, string> = {}
      ;(res.data as string[]).forEach((k) => { init[k] = '' })
      setFormData(init)
    })
  }, [selectedTable])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const handleDelete = (id: number) => {
    axios.delete(`/api/admin/tables/${selectedTable}/${id}`).then(fetchRecords)
  }

  const handleAdd = () => {
    const body: Record<string, unknown> = {}
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== '') body[k] = v
    })
    axios.post(`/api/admin/tables/${selectedTable}`, body).then(() => {
      fetchRecords()
      setFormData((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, ''])))
    })
  }

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

  const columns = records.length > 0 ? Object.keys(records[0]) : []
  const formKeys = Object.keys(formData)

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">管理者ページ</h1>

      <div className="mb-4 flex items-center gap-3">
        <label className="font-medium text-sm">テーブル:</label>
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {tables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{records.length} 件</span>
      </div>

      {/* レコード一覧 */}
      <div className="overflow-x-auto mb-8 border rounded">
        {records.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">レコードがありません</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="border-b px-3 py-2 text-left whitespace-nowrap font-medium">
                    {col}
                  </th>
                ))}
                <th className="border-b px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={String(row.id)} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td key={col} className="border-b px-3 py-1.5 max-w-xs truncate text-gray-700">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                  <td className="border-b px-3 py-1.5">
                    <button
                      onClick={() => handleDelete(row.id as number)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* レコード追加フォーム */}
      {formKeys.length > 0 && (
        <div className="bg-gray-50 p-4 rounded border">
          <h2 className="font-bold mb-3 text-sm">レコード追加</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {formKeys.map((key) => (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-0.5">{key}</label>
                <input
                  value={formData[key]}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleAdd}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
          >
            追加
          </button>
        </div>
      )}
    </div>
  )
}
