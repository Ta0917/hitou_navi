import { Routes, Route } from 'react-router-dom'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ListPage />} />
      <Route path="/items/:id" element={<DetailPage />} />
    </Routes>
  )
}

export default App
