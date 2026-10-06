import { Routes, Route } from 'react-router-dom'
import TopPage from './pages/TopPage'
import SearchTestPage from './pages/SearchTestPage'
import OnsenDetailTestPage from './pages/OnsenDetailTestPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<TopPage />} />
      <Route path="/onsens/:slug" element={<OnsenDetailTestPage />} />
      {import.meta.env.DEV && <Route path="/search-test" element={<SearchTestPage />} />}
    </Routes>
  )
}

export default App
