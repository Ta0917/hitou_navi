import { Routes, Route } from 'react-router-dom'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'
import ComparePage from './pages/ComparePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ListPage />} />
      <Route path="/onsen/:id" element={<DetailPage />} />
      <Route path="/compare" element={<ComparePage />} />
    </Routes>
  )
}

export default App
