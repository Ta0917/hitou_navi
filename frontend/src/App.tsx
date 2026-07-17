import { Routes, Route } from 'react-router-dom'
import TopPage from './pages/TopPage'
import AdminPage from './pages/AdminPage'
import SearchTestPage from './pages/SearchTestPage'
import OnsenDetailTestPage from './pages/OnsenDetailTestPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/onsens/:slug" element={<OnsenDetailTestPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/search-test" element={<SearchTestPage />} />
      <Route path="/admin/search-test/:slug" element={<OnsenDetailTestPage />} />
    </Routes>
  )
}

export default App
