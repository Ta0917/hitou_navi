import { useEffect, useState } from 'react'
import heroImg from '../assets/hero.jpg'
import logoImg from '../assets/logo.svg'
import axios from 'axios'

const navItems = [
  { label: '秘湯を探す', href: '#' },
  { label: '地域から', href: '#' },
  { label: '泉質から', href: '#' },
  { label: '宿について', href: '#' }
]

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
    <div className="relative w-full h-screen">
      {/* 背景画像 z=0 */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImg})`, filter: 'brightness(0.72) saturate(0.55)' }} />

      {/* グラデーションオーバーレイ z=0 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(20,23,29,0.65) 0%, rgba(20,23,29,0.20) 28%,rgba(20,23,29,0.55) 70%, rgba(20,23,29,0.96) 100%), radial-gradient(60% 50% at 50% 60%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.60) 100%)'
        }}
      >
      </div>

      {/* ヘッダー z=30 */}
      <header style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '30px 52px'
      }}>
        <div>
          <div><img src={logoImg} alt="秘湯ナビロゴ" style={{height: '60px' }} /></div>
        </div>
        <nav className="px-4 py-2"
          style={{
            display: 'flex',
            gap: '1.8rem'
          }}>
          {navItems.map((item) => {
            return (
              <a href={item.href}
                key={item.label}
                className="nav-link"
                style={{
                  fontSize: '0.95rem',
                  fontFamily: "'Shippori Mincho', serif",
                  color: '#ddd0b2',
                  letterSpacing: '0.1em',
                  textShadow: '2px 2px 8px rgba(0,0,0,0.5)'
                }}>
                {item.label}
              </a>
            )
          })}
        </nav>
      </header>

      {/* 縦書きテキスト z=20 */}
      <div
        className="absolute z-20"
        style={{
          top: '50%',
          right: '12%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'row-reverse',
          gap: '0.6rem'
        }}
      >
        {(['こころ', '解ける', '湯の宿'] as const).map((col, i) => {
          const spacing = i === 2 ? '0.3em' : '0'
          return (
          <span
            key={i}
            style={{
              writingMode: 'vertical-rl',
              fontFamily: '"Yuji Mai", serif',
              fontSize: '6.0rem',
              color: '#d8cdb0',
              textShadow: '0 2px 12px rgba(0,0,0,0.6)'
            }}
          >
            {col.split('').map((char, ci, arr) => (
              <span key={ci} style={{ letterSpacing: ci < arr.length - 1 ? '0.5em' : spacing }}>
                {char}
              </span>
            ))}
            {i === 2 && (
                <span style={{ fontSize: '0.55em', opacity: 0.45 }}>。</span>
            )}
          </span>
        )})}
      </div>
    </div>
  )
}
