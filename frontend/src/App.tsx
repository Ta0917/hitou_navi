import { Routes, Route } from 'react-router-dom'
import TopPage from './pages/TopPage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  )
}

export default App
