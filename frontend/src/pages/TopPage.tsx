import { useState } from 'react'
import heroImg from '../assets/hero.jpg'
import logoImg from '../assets/logo.svg'


const navItems = [
  { label: '秘湯を探す', href: '#' },
  { label: '地域から', href: '#' },
  { label: '泉質から', href: '#' },
  { label: '宿について', href: '#' }
]

export default function TopPage() {
  const [tripType, setTripType] = useState<'dayTrip' | 'stay' | null>('stay')
  const [core, setCore] = useState('')

  const accent = tripType === 'stay' ? '#a8412f' : '#6F7E4F'

  return (
    <div className="relative w-full h-screen">
      {/* 背景画像 z=0 */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImg})`, filter: 'brightness(0.72) saturate(0.55)' }} />

      {/* グラデーションオーバーレイ z=0 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(20,23,29,0.65) 0%, rgba(20,23,29,0.20) 28%,rgba(20,23,29,0.55) 70%, rgba(20,23,29,0.96) 100%), radial-gradient(60% 50% at 50% 60%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%)'
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
                  fontSize: '0.9rem',
                  fontFamily: "'Shippori Mincho', serif",
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
          top: '39%',
          right: '11%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'row-reverse',
          gap: '0.6rem'
        }}
      >
        {(['秘湯を', 'たずねて', 'まだ見ぬ、ひとつの湯へ。'] as const).map((text) => {

          return((text === 'まだ見ぬ、ひとつの湯へ。'
            ? <span
            key={text}
            style={{
              writingMode: 'vertical-rl',
              fontFamily: "'Shippori Mincho', serif",
              fontSize: '1.1rem',
              letterSpacing: '0.35em',
              marginTop: '20px',
              color: '#c8bca2',
              textShadow: '2px 2px 8px rgba(0,0,0,0.5)'
            }}>{text}</span>
            : <span
            key={text}
            style={{
              writingMode: 'vertical-rl',
              fontFamily: "'Yuji Mai', serif",
              fontSize: '3.75rem',
              letterSpacing: '0.18em',
              color: '#dccda3',
              textShadow: '2px 2px 8px rgba(0,0,0,0.5)'
            }}>{text}</span>)
          )
        })}
      </div>

      {/* 検索UIエリア */}
      <div
        className="absolute z-20"
        style={{
          bottom: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '770px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '15px',
          fontFamily: "'Shippori Mincho', serif",
        }}>
        {/* トグル */}
        <div style={{
          display: 'inline-flex',
          border: '1px solid rgba(214,199,158,0.2)',
          overflow: 'hidden'
          }}>
          {(['daytrip', 'stay']).map((type) => {
            const isSelected = tripType === type
            return(
              <button
                key={type}
                onClick={() => setTripType(type as 'dayTrip' | 'stay')}
                style={{
                  padding: '7px 28px',
                  border: 'none',
                  backgroundColor: isSelected ? accent : 'rgba(15,17,22,0.35)',
                  color: isSelected ? '#f6efe1' : '#7a7264',
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: '12.5px',
                  letterSpacing: '0.22em',
                  cursor: 'pointer',
                  transition: 'background-color 0.55s ease, color 0.3s ease',
                }}
              >
                {type === 'daytrip' ? '日帰り' : '宿泊'}
              </button>
            )
          })}
        </div>
        {/* チップバー */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            backgroundColor: 'rgba(15,17,22,0.52)',
            backdropFilter: 'blur(9px)',
            WebkitBackdropFilter: 'blur(9px)',
            border: '1px solid rgba(214,199,158,0.18)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            overflow: 'hidden',
          } as React.CSSProperties}
        >
          {/* 入力フィールド＋選択済みチップ表示エリア */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

            {/* 入力フィールド */}
            <div style={{
              display: 'flex', paddingLeft: '16px',
              alignItems: 'stretch', minHeight:'50px',
            }}>
              <input
                type="text"
                value={core}
                onChange={(e) => {setCore(e.target.value)}}
                maxLength={26}
                placeholder="静か 近場 日帰り"
                style={{
                  flex: 1, minWidth: 0, alignSelf: 'center',
                  border: 'none', outline: 'none',
                  backgroundColor: 'transparent',
                  color: '#e9dfc7', fontSize: '16px',
                  fontFamily: "'Shippori Mincho', serif",
                  letterSpacing: '0.04em',
                  padding: '13px 0',
                }}
              />
            </div>
            {/* PC用オーバーレイ3種 */}
            <div>

            </div>
            {/* 選択済みチップ表示エリア */}
            <div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
