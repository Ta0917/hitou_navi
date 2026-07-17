import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import heroImg from '../assets/hero.jpg'
import logoImg from '../assets/logo.svg'
import { geoMercator, geoPath } from 'd3-geo'
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client'
import japanTopo from '../assets/japan_s5.topojson.json'

// ─── 定数 ────────────────────────────────────────────────────────────────────

const ACCENT_OVERNIGHT = '#a8412f'   // 宿泊時アクセントカラー
const ACCENT_DAYTRIP   = '#6F7E4F'   // 日帰り時アクセントカラー
const CHIP_RADIUS = '0px'
const NAV_LABELS = ['秘湯を探す', '地域から', '泉質から', '宿について'] as const
const AREAS = ['全国', '北海道', '東北', '甲信越', '北陸', '関東', '東海', '近畿', '中国・四国', '九州・沖縄'] as const

const accentAlpha = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const AREA_PREFECTURES: Partial<Record<string, string[]>> = {
  '東北':      ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  '関東':      ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  '甲信越':    ['山梨県', '長野県', '新潟県'],
  '北陸':      ['富山県', '石川県', '福井県'],
  '東海':      ['岐阜県', '静岡県', '愛知県', '三重県'],
  '近畿':      ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  '中国・四国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'],
  '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
}

const PREFECTURE_TO_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_PREFECTURES).flatMap(([r, ps]) => (ps ?? []).map(p => [p, r]))
)

type TagDef = { label: string; scroll?: true; group?: string; mode?: 'basic' | 'all' }

const TAG_DEFS: TagDef[] = [
  // ── 温泉（基本） ──
  { label: '源泉かけ流し',  scroll: true, group: '温泉',     mode: 'basic' },
  { label: '露天風呂',      scroll: true, group: '温泉',     mode: 'basic' },
  { label: '貸切風呂あり',               group: '温泉',     mode: 'basic' },
  { label: '客室露天風呂あり',           group: '温泉',     mode: 'basic' },
  { label: 'にごり湯',      scroll: true, group: '温泉',     mode: 'basic' },
  // ── 食事（基本） ──
  { label: '朝食付き', group: '食事', mode: 'basic' },
  { label: '夕食付き', group: '食事', mode: 'basic' },
  { label: '部屋食',   group: '食事', mode: 'basic' },
  // ── アクセス（基本） ──
  { label: '駐車場あり', group: 'アクセス', mode: 'basic' },
  { label: '駅送迎あり', group: 'アクセス', mode: 'basic' },
  // ── 宿（基本） ──
  { label: '一人旅歓迎', scroll: true, group: '宿', mode: 'basic' },
  { label: 'ペット可',                group: '宿', mode: 'basic' },
  { label: '禁煙',                    group: '宿', mode: 'basic' },
  // ── 雰囲気（基本） ──
  { label: '山奥',        group: '雰囲気', mode: 'basic' },
  { label: '川沿いの宿', scroll: true, group: '雰囲気', mode: 'basic' },
  { label: '雪見の湯',   scroll: true, group: '雰囲気', mode: 'basic' },
  { label: '星空',        group: '雰囲気', mode: 'basic' },
  // ── 温泉の泉質（詳細） ──
  { label: '硫黄泉',        scroll: true, group: '温泉の泉質', mode: 'all' },
  { label: '単純温泉',      scroll: true, group: '温泉の泉質', mode: 'all' },
  { label: '炭酸水素塩泉',  scroll: true, group: '温泉の泉質', mode: 'all' },
  { label: '炭酸泉',                     group: '温泉の泉質', mode: 'all' },
  { label: '酸性泉',                     group: '温泉の泉質', mode: 'all' },
  { label: 'アルカリ性単純泉',           group: '温泉の泉質', mode: 'all' },
  { label: '塩化物泉',                   group: '温泉の泉質', mode: 'all' },
  { label: '鉄泉',                       group: '温泉の泉質', mode: 'all' },
  { label: '放射能泉',                   group: '温泉の泉質', mode: 'all' },
  { label: 'その他泉質',                 group: '温泉の泉質', mode: 'all' },
  // ── 温泉品質（詳細） ──
  { label: '加水なし',     group: '温泉品質', mode: 'all' },
  { label: '加温なし',     group: '温泉品質', mode: 'all' },
  { label: '循環ろ過なし', group: '温泉品質', mode: 'all' },
  { label: '自噴源泉',     group: '温泉品質', mode: 'all' },
  { label: '飲泉可',       group: '温泉品質', mode: 'all' },
  { label: '湯の花あり',   group: '温泉品質', mode: 'all' },
  // ── お風呂（詳細） ──
  { label: '混浴',     group: 'お風呂', mode: 'all' },
  { label: '野天風呂', group: 'お風呂', mode: 'all' },
  { label: '洞窟風呂', group: 'お風呂', mode: 'all' },
  { label: '岩風呂',   group: 'お風呂', mode: 'all' },
  { label: '木造浴場', group: 'お風呂', mode: 'all' },
  { label: '展望風呂', group: 'お風呂', mode: 'all' },
  { label: '足湯',     group: 'お風呂', mode: 'all' },
  { label: 'サウナ',   group: 'お風呂', mode: 'all' },
  { label: '水風呂',   group: 'お風呂', mode: 'all' },
  // ── 景観（詳細） ──
  { label: '湖畔',   group: '景観', mode: 'all' },
  { label: '海辺',   group: '景観', mode: 'all' },
  { label: '高原',   group: '景観', mode: 'all' },
  { label: '森林',   group: '景観', mode: 'all' },
  { label: '渓谷',   group: '景観', mode: 'all' },
  { label: '紅葉',   group: '景観', mode: 'all' },
  { label: '桜',     group: '景観', mode: 'all' },
  { label: '雲海',   group: '景観', mode: 'all' },
  // ── 秘湯度（詳細） ──
  { label: '一軒宿',               scroll: true, group: '秘湯度', mode: 'all' },
  { label: '日本秘湯を守る会加盟',               group: '秘湯度', mode: 'all' },
  { label: 'ランプの宿',           scroll: true, group: '秘湯度', mode: 'all' },
  { label: '茅葺き',                             group: '秘湯度', mode: 'all' },
  { label: '築100年以上',                        group: '秘湯度', mode: 'all' },
  { label: '秘境駅からアクセス',                 group: '秘湯度', mode: 'all' },
  { label: '徒歩のみ',                           group: '秘湯度', mode: 'all' },
  { label: '冬季閉鎖',                           group: '秘湯度', mode: 'all' },
  { label: '自家発電',                           group: '秘湯度', mode: 'all' },
  // ── 客室（詳細） ──
  { label: '和室',   group: '客室', mode: 'all' },
  { label: '洋室',   group: '客室', mode: 'all' },
  { label: '和洋室', group: '客室', mode: 'all' },
  { label: '離れ',   group: '客室', mode: 'all' },
  // ── 食事（詳細） ── ※showAll時に基本の食事グループと合算
  { label: '囲炉裏料理',     group: '食事', mode: 'all' },
  { label: '郷土料理',       group: '食事', mode: 'all' },
  { label: '山菜料理',       group: '食事', mode: 'all' },
  { label: 'ジビエ料理',     group: '食事', mode: 'all' },
  { label: '川魚料理',       group: '食事', mode: 'all' },
  { label: '地酒充実',       group: '食事', mode: 'all' },
  { label: 'アレルギー対応', group: '食事', mode: 'all' },
  // ── アクセス（詳細） ── ※showAll時に基本のアクセスグループと合算
  // 「最寄ICから○分以内」「最寄駅から徒歩○分以内」は特殊チップ（ACCESS_TIME_CHIPS）として
  // 別UIで提供するため、ここには含めない。
  { label: '車必須',             group: 'アクセス', mode: 'all' },
  { label: '公共交通のみ',       group: 'アクセス', mode: 'all' },
  // ── 設備（詳細） ──
  { label: 'Wi-Fiあり',  group: '設備', mode: 'all' },
  { label: 'Wi-Fiなし',  group: '設備', mode: 'all' },
  { label: 'EV充電器',   group: '設備', mode: 'all' },
  { label: 'ランドリー', group: '設備', mode: 'all' },
  { label: '売店',       group: '設備', mode: 'all' },
  { label: 'ラウンジ',   group: '設備', mode: 'all' },
  // ── その他（詳細） ──
  { label: '湯治向け',           group: 'その他', mode: 'all' },
  { label: 'ワーケーション向け', group: 'その他', mode: 'all' },
  { label: '写真映え',           group: 'その他', mode: 'all' },
  { label: 'レトロ',             group: 'その他', mode: 'all' },
  { label: '高級旅館',           group: 'その他', mode: 'all' },
  { label: '静かな宿',  scroll: true, group: 'その他', mode: 'all' },
  { label: '携帯圏外歓迎',       group: 'その他', mode: 'all' },
]

function buildGroups(mode: 'basic' | 'all'): { label: string; items: string[] }[] {
  const result: { label: string; items: string[] }[] = []
  const seen = new Map<string, number>()
  for (const t of TAG_DEFS) {
    if (t.mode !== mode || !t.group) continue
    const idx = seen.get(t.group)
    if (idx === undefined) { seen.set(t.group, result.length); result.push({ label: t.group, items: [t.label] }) }
    else { result[idx].items.push(t.label) }
  }
  return result
}

const BASIC_GROUPS = buildGroups('basic')
const ALL_GROUPS   = buildGroups('all')
const SCROLL_LABELS = TAG_DEFS.filter(t => t.scroll).map(t => t.label)

// 「最寄ICから○分以内」「最寄駅から徒歩○分以内」特殊チップの選択肢
const IC_MINUTES_OPTIONS = [30, 45, 60, 90, 120] as const
const STATION_WALK_MINUTES_OPTIONS = [10, 20, 30] as const

// 小笠原諸島（東京都の MultiPolygon のうち緯度 30°N 未満）を除去
const _filterOgasawara = (f: any): any => {
  if (f.properties.nam_ja !== '東京都' || f.geometry?.type !== 'MultiPolygon') return f
  const coords = (f.geometry.coordinates as number[][][][]).filter(poly => {
    const centLat = poly[0].reduce((s: number, pt: number[]) => s + pt[1], 0) / poly[0].length
    return centLat >= 30
  })
  return { ...f, geometry: { ...f.geometry, coordinates: coords } }
}

// 沖縄を分離（インセット表示）
const _allFeatures  = ((topoFeature(japanTopo as any, (japanTopo as any).objects.japan) as any).features as any[]).map(_filterOgasawara)
const _mainFeatures = _allFeatures.filter(f => f.properties.nam_ja !== '沖縄県')
const _okinawaFeature = _allFeatures.find(f => f.properties.nam_ja === '沖縄県') ?? null

const MAP_W = 500, MAP_H = 560, MAP_Y_OFFSET = 140, MAP_ZOOM = 1.25
const _mapVTotal = MAP_H + MAP_Y_OFFSET
const _mapVW = Math.round(MAP_W / MAP_ZOOM)
const _mapVH = Math.round(_mapVTotal / MAP_ZOOM)
const _mapVX = Math.round((MAP_W - _mapVW) / 2)
const _mapVY = Math.round(MAP_H - _mapVH) - 29  // 底辺を九州の下端に固定、少し下にシフト
const MAP_VIEWBOX = `${_mapVX} ${_mapVY} ${_mapVW} ${_mapVH}`

const _mainGeo = { type: 'FeatureCollection', features: _mainFeatures }
const _mapProj = _mainFeatures.length > 0
  ? geoMercator().fitSize([MAP_W, MAP_H], _mainGeo as any)
  : geoMercator()
const _mapGen  = geoPath(_mapProj)
const PREF_PATHS: { d: string; name: string }[] = _mainFeatures.map((f: any) => ({
  d:    _mapGen(f) ?? '',
  name: f.properties.nam_ja as string,
}))

const _topoObj = (japanTopo as any).objects.japan
const BORDER_MESH = _mapGen(topoMesh(japanTopo as any, _topoObj) as any) ?? ''

const INSET_W = 92, INSET_H = 60
const _insetProj = _okinawaFeature
  ? geoMercator().fitSize([INSET_W, INSET_H], _okinawaFeature)
  : geoMercator()
const _insetGen  = geoPath(_insetProj)
const OKINAWA_PATH = _okinawaFeature ? (_insetGen(_okinawaFeature) ?? '') : ''

// ── ViewBox アニメーション helpers ─────────────────────────────────────────────
type VB = [number, number, number, number]
const parseVB = (s: string): VB => s.trim().split(/\s+/).map(Number) as VB
const lerpVB  = (a: VB, b: VB, t: number): VB => a.map((v, i) => v + (b[i] - v) * t) as VB
const fmtVB   = (vb: VB) => vb.map(v => Math.round(v * 10) / 10).join(' ')
const vbDone  = (a: VB, b: VB) => a.every((v, i) => Math.abs(v - b[i]) < 0.3)
const MAP_DEFAULT_VB: VB = parseVB(MAP_VIEWBOX)

// ── 地域ズーム viewBox を事前計算 ────────────────────────────────────────────────
const _computeRegionVB = (features: any[], pad = 0.2): VB | null => {
  if (!features.length) return null
  try {
    const fc = { type: 'FeatureCollection', features }
    const [[x0, y0], [x1, y1]] = _mapGen.bounds(fc as any)
    if (!isFinite(x0)) return null
    const pw = (x1 - x0) * pad, ph = (y1 - y0) * pad
    const scale = Math.min(_mapVW / (x1 - x0 + pw * 2), _mapVH / (y1 - y0 + ph * 2))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    return [cx - _mapVW / scale / 2, cy - _mapVH / scale / 2, _mapVW / scale, _mapVH / scale]
  } catch { return null }
}

const _REGION_PAD: Partial<Record<string, number>> = { '関東': 0.04 }

// 関東ズーム用: 東京都の南方小島（伊豆諸島など、lat < 35°N）をバウンディングボックス計算から除外
const _stripTokyoSouthIslands = (features: any[]): any[] =>
  features.map(f => {
    if (f.properties.nam_ja !== '東京都' || f.geometry?.type !== 'MultiPolygon') return f
    const coords = (f.geometry.coordinates as number[][][][]).filter(poly => {
      const centLat = poly[0].reduce((s: number, pt: number[]) => s + pt[1], 0) / poly[0].length
      return centLat >= 35
    })
    return { ...f, geometry: { ...f.geometry, coordinates: coords } }
  })

// 九州・沖縄ズーム用: 鹿児島の南方島嶼（奄美など、lat < 30°N）をバウンディングボックス計算から除外
const _stripKagoshimaSouthIslands = (features: any[]): any[] =>
  features.map(f => {
    if (f.properties.nam_ja !== '鹿児島県' || f.geometry?.type !== 'MultiPolygon') return f
    const coords = (f.geometry.coordinates as number[][][][]).filter(poly => {
      const centLat = poly[0].reduce((s: number, pt: number[]) => s + pt[1], 0) / poly[0].length
      return centLat >= 30
    })
    return { ...f, geometry: { ...f.geometry, coordinates: coords } }
  })

type FeatureFilter = (fs: any[]) => any[]
const _REGION_FEAT_FILTER: Partial<Record<string, FeatureFilter>> = {
  '関東': _stripTokyoSouthIslands,
  '九州・沖縄': _stripKagoshimaSouthIslands,
}

const REGION_VB: Partial<Record<string, VB>> = {}
for (const [region, prefs] of Object.entries(AREA_PREFECTURES)) {
  const ep = region === '九州・沖縄' ? prefs!.filter(p => p !== '沖縄県') : prefs!
  const rawFeats = _mainFeatures.filter(f => ep.includes(f.properties.nam_ja))
  const feats = _REGION_FEAT_FILTER[region]?.(rawFeats) ?? rawFeats
  const vb = _computeRegionVB(feats, _REGION_PAD[region] ?? 0.2)
  if (vb) REGION_VB[region] = vb
}
const _hokkaidoVB = _computeRegionVB(_mainFeatures.filter(f => f.properties.nam_ja === '北海道'))
if (_hokkaidoVB) REGION_VB['北海道'] = _hokkaidoVB

// 都道府県個別ズーム viewBox（タイトなパディングで詳細表示用）
const _PREF_PAD: Partial<Record<string, number>> = { '北海道': -0.2 }
const PREF_VB: Partial<Record<string, VB>> = {}
for (const f of _mainFeatures) {
  const name = f.properties.nam_ja as string
  const vb = _computeRegionVB([f], _PREF_PAD[name] ?? 0.05)
  if (vb) PREF_VB[name] = vb
}
// 沖縄はメイン投影で追加（_mainFeatures に含まれないため個別処理）
const OKINAWA_MAIN_PATH = _okinawaFeature ? (_mapGen(_okinawaFeature) ?? '') : ''
if (_okinawaFeature) {
  // 本島周辺（北緯26度以上）のポリゴンのみでVBを計算し、宮古・八重山を除外
  const _okinawaMainFeat = _okinawaFeature.geometry?.type === 'MultiPolygon'
    ? {
        ..._okinawaFeature,
        geometry: {
          ..._okinawaFeature.geometry,
          coordinates: (_okinawaFeature.geometry.coordinates as number[][][][]).filter((poly: number[][][]) => {
            const centLat = poly[0].reduce((s: number, pt: number[]) => s + pt[1], 0) / poly[0].length
            const centLon = poly[0].reduce((s: number, pt: number[]) => s + pt[0], 0) / poly[0].length
            return centLat >= 26 && centLon >= 127.3  // 久米島(~126.8°E)を除外
          })
        }
      }
    : _okinawaFeature
  const vb = _computeRegionVB([_okinawaMainFeat], -0.05)
  if (vb) {
    vb[0] += vb[2] * 0.25  // 左寄せ
    vb[1] += vb[3] * 0.04  // 上寄せ
    PREF_VB['沖縄県'] = vb
  }
}

// ── 施設数アイコン表示用の事前計算 ──────────────────────────────────────────────
// 各県のバウンディングボックス（viewBoxとの交差判定＝「画面に映っているか」の判定用）と
// 重心（アイコンの配置座標用）。
type BBox = [number, number, number, number]  // [x0, y0, x1, y1]
const PREF_BOUNDS: Partial<Record<string, BBox>> = {}
const PREF_CENTROIDS: Partial<Record<string, [number, number]>> = {}
for (const f of _mainFeatures) {
  const name = f.properties.nam_ja as string
  try {
    const [[x0, y0], [x1, y1]] = _mapGen.bounds(f as any)
    if (isFinite(x0)) PREF_BOUNDS[name] = [x0, y0, x1, y1]
    const c = _mapGen.centroid(f as any)
    if (c && isFinite(c[0])) PREF_CENTROIDS[name] = [c[0], c[1]]
  } catch { /* 投影できない場合はスキップ */ }
}
// 沖縄県は _mainFeatures に含まれない（インセット表示のため分離済み）ので、
// 県詳細モードで実際に描画する OKINAWA_MAIN_PATH と同じ投影（_mapGen）で個別に計算する。
if (_okinawaFeature) {
  try {
    const [[x0, y0], [x1, y1]] = _mapGen.bounds(_okinawaFeature as any)
    if (isFinite(x0)) PREF_BOUNDS['沖縄県'] = [x0, y0, x1, y1]
    const c = _mapGen.centroid(_okinawaFeature as any)
    if (c && isFinite(c[0])) PREF_CENTROIDS['沖縄県'] = [c[0], c[1]]
  } catch { /* 投影できない場合はスキップ */ }
}

// 県詳細モード（選択状態）で、その県に属する施設の「大体の位置」マーカーを表示するための
// 決定論的な座標生成。
//
// TODO(暫定実装): Onsen/OnsenAccess は実際の緯度経度を持たない（架空施設のためDB未整備、
// backend/app/models.py の OnsenAccess.latitude/longitude は現状常にNULL）。そのため、
// 県の重心（PREF_CENTROIDS）を中心に slug ベースの疑似乱数でジッターさせて散らす代用実装
// にしている（同じ施設は常に同じ位置に表示される＝決定論的だが、実在の場所とは無関係）。
// 実際の緯度経度データを投入する場合は、この関数を呼ぶのをやめて
// d3-geo の投影関数（_mapProj）で実座標を直接プロジェクションする方式に差し替えること
// （呼び出し元は下記 JapanMap 内の施設マーカー描画箇所の1箇所のみ）。
function _seededUnit(seed: string, salt: number): number {
  let h = salt
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % 100000) / 100000
}

function facilityMarkerPoint(slug: string, prefName: string): [number, number] | null {
  const c = PREF_CENTROIDS[prefName]
  const b = PREF_BOUNDS[prefName]
  if (!c || !b) return null
  const [x0, y0, x1, y1] = b
  const jitterX = (x1 - x0) * 0.32
  const jitterY = (y1 - y0) * 0.32
  const rx = (_seededUnit(slug, 101) - 0.5) * 2
  const ry = (_seededUnit(slug, 202) - 0.5) * 2
  return [c[0] + rx * jitterX, c[1] + ry * jitterY]
}

// 「第一段階チップへのホバー」がもたらすズーム倍率の下限（＝REGION_VBの幅の最大値）。
// ホバーしていなくても viewBox 幅がこれ以下＝この拡大率まで（またはそれ以上）ズームされた、
// とみなす。上限は設けない＝そこからさらにズームインしてもアイコンは消えない。
const _regionWidths = Object.values(REGION_VB)
  .filter((v): v is VB => !!v)
  .map(v => v[2])
const REGION_ZOOM_MAX_W = _regionWidths.length ? Math.max(..._regionWidths) * 1.15 : 0

// バウンディングボックスが現在のviewBoxと交差する（＝画面に映っている）県名一覧を返す。
function prefsVisibleInViewBox(vb: VB): string[] {
  const [vx, vy, vw, vh] = vb
  const result: string[] = []
  for (const { name } of PREF_PATHS) {
    const b = PREF_BOUNDS[name]
    if (!b) continue
    const [x0, y0, x1, y1] = b
    if (x0 <= vx + vw && x1 >= vx && y0 <= vy + vh && y1 >= vy) result.push(name)
  }
  return result
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

// ─── 共通コンポーネント ───────────────────────────────────────────────────────

function LogoBlock() {
  return <img src={logoImg} alt="秘湯ナビロゴ" style={{ height: '60px' }} />
}

// ─── 詳細条件オーバーレイ ─────────────────────────────────────────────────────

function DetailOverlay({
  open, onClose, accent, activeConditions, onToggleCondition,
  budgetEnabled, setBudgetEnabled, budgetValue, setBudgetValue,
  icMinutesEnabled, setIcMinutesEnabled, icMinutesValue, setIcMinutesValue,
  stationWalkEnabled, setStationWalkEnabled, stationWalkValue, setStationWalkValue,
}: {
  open: boolean; onClose: () => void; accent: string
  activeConditions: string[]; onToggleCondition: (name: string) => void
  budgetEnabled: boolean; setBudgetEnabled: (v: boolean) => void
  budgetValue: number; setBudgetValue: (v: number) => void
  icMinutesEnabled: boolean; setIcMinutesEnabled: (v: boolean) => void
  icMinutesValue: number; setIcMinutesValue: (v: number) => void
  stationWalkEnabled: boolean; setStationWalkEnabled: (v: boolean) => void
  stationWalkValue: number; setStationWalkValue: (v: number) => void
}) {
  const [showAll, setShowAll] = useState(false)

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const chipStyle = (sel: boolean): React.CSSProperties => ({
    padding: '5px 13px',
    border: sel ? 'none' : '1px solid rgba(214,199,158,0.28)',
    outline: 'none',
    background: sel ? accent : 'rgba(214,199,158,0.08)',
    color: sel ? '#f6efe1' : '#c4b898',
    fontFamily: "'Shippori Mincho', serif",
    fontSize: '13.5px', letterSpacing: '0.06em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.45s ease, color 0.2s',
  })

  const renderSection = (label: string, items: string[], key: string) => (
    <div key={key} style={{ marginBottom: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '11px' }}>
        <span style={{ display: 'block', width: '18px', height: '1px', background: 'rgba(205,191,160,0.45)', flexShrink: 0 }} />
        <span style={{ fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em', fontFamily: "'Shippori Mincho', serif", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
        {items.map(name => (
          <button key={name} onClick={() => onToggleCondition(name)} className={activeConditions.includes(name) ? 'active-chip' : 'overlay-chip'} style={chipStyle(activeConditions.includes(name))}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div
      onClick={onBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(8,10,14,0.72)',
        backdropFilter: open ? 'blur(6px)' : 'blur(0px)',
        WebkitBackdropFilter: open ? 'blur(6px)' : 'blur(0px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.32s ease, backdrop-filter 0.32s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      } as React.CSSProperties}
    >
      <div style={{
        width: '600px', maxWidth: '92vw',
        height: '78vh', minHeight: '480px',
        background: 'rgba(13,16,21,0.97)',
        border: '1px solid rgba(214,199,158,0.2)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transform: open ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.97)',
        transition: 'transform 0.38s cubic-bezier(.34,1.05,.5,1)',
      }}>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(214,199,158,0.12)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'Yuji Mai', serif",
            fontSize: '20px', letterSpacing: '0.22em', color: '#e3d6b4',
            fontWeight: 400,
          }}>詳細条件</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6a6255', fontSize: '20px', lineHeight: 1, padding: '4px 6px',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#cdbfa0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6a6255')}
          >×</button>
        </div>

        {/* コンテンツ */}
        <div className="overlay-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 8px' }}>

          {/* 料金 */}
          <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '11px' }}>
              <span style={{ display: 'block', width: '18px', height: '1px', background: 'rgba(205,191,160,0.45)', flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em', fontFamily: "'Shippori Mincho', serif", fontWeight: 600 }}>料金</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: budgetEnabled ? '10px' : 0 }}>
              <button onClick={() => setBudgetEnabled(!budgetEnabled)} className={budgetEnabled ? 'active-chip' : 'overlay-chip'} style={chipStyle(budgetEnabled)}>
                予算（1人あたり）
              </button>
            </div>
            {budgetEnabled && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '9px 14px',
                background: 'rgba(214,199,158,0.04)',
                border: '1px solid rgba(214,199,158,0.1)',
              }}>
                <input
                  type="range" min={3000} max={100000} step={1000}
                  value={budgetValue}
                  onChange={e => setBudgetValue(Number(e.target.value))}
                  style={{ flex: 1, accentColor: accent }}
                />
                <span style={{
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: '13px', color: '#e9dfc7', whiteSpace: 'nowrap', minWidth: '88px', textAlign: 'right',
                }}>〜{budgetValue.toLocaleString()}円</span>
              </div>
            )}
          </div>

          {/* よく使うセクション */}
          {BASIC_GROUPS.map(s => renderSection(s.label, s.items, `basic_${s.label}`))}

          {/* すべて表示トグル */}
          <button
            onClick={() => setShowAll(v => !v)}
            className="show-all-btn"
            style={{
              display: 'block', width: '100%',
              padding: '11px', marginBottom: '8px',
              border: '1px solid rgba(214,199,158,0.18)',
              background: 'transparent',
              color: '#c8b898',
              fontFamily: "'Shippori Mincho', serif",
              fontSize: '13px', letterSpacing: '0.22em',
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {showAll ? '▲ 非表示' : '▼ すべて表示'}
          </button>

          {/* 詳細セクション */}
          {showAll && (
            <>
              <div style={{ height: '4px' }} />
              {ALL_GROUPS.map(s => renderSection(s.label, s.items, `all_${s.label}`))}

              {/* アクセス時間（最寄IC・最寄駅から徒歩）: 段階選択式の特殊チップ */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '11px' }}>
                  <span style={{ display: 'block', width: '18px', height: '1px', background: 'rgba(205,191,160,0.45)', flexShrink: 0 }} />
                  <span style={{ fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em', fontFamily: "'Shippori Mincho', serif", fontWeight: 600 }}>アクセス時間</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: icMinutesEnabled ? '10px' : '14px' }}>
                  <button onClick={() => setIcMinutesEnabled(!icMinutesEnabled)} className={icMinutesEnabled ? 'active-chip' : 'overlay-chip'} style={chipStyle(icMinutesEnabled)}>
                    最寄ICから○分以内
                  </button>
                </div>
                {icMinutesEnabled && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '14px' }}>
                    {IC_MINUTES_OPTIONS.map(v => (
                      <button key={v} onClick={() => setIcMinutesValue(v)} className={v === icMinutesValue ? 'active-chip' : 'overlay-chip'} style={chipStyle(v === icMinutesValue)}>
                        {v}分
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: stationWalkEnabled ? '10px' : 0 }}>
                  <button onClick={() => setStationWalkEnabled(!stationWalkEnabled)} className={stationWalkEnabled ? 'active-chip' : 'overlay-chip'} style={chipStyle(stationWalkEnabled)}>
                    最寄駅から徒歩○分以内
                  </button>
                </div>
                {stationWalkEnabled && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {STATION_WALK_MINUTES_OPTIONS.map(v => (
                      <button key={v} onClick={() => setStationWalkValue(v)} className={v === stationWalkValue ? 'active-chip' : 'overlay-chip'} style={chipStyle(v === stationWalkValue)}>
                        徒歩{v}分
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* フッター */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(214,199,158,0.12)',
          display: 'flex', justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 28px',
              border: 'none', background: accent,
              color: '#f6efe1',
              fontFamily: "'Shippori Mincho', serif",
              fontSize: '13px', letterSpacing: '0.22em',
              cursor: 'pointer',
              transition: 'background-color 0.55s ease, filter 0.2s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.12)')}
            onMouseLeave={e => (e.currentTarget.style.filter = '')}
          >条件を適用する</button>
        </div>

      </div>
    </div>
  )
}

function ScrollCue() {
  return (
    <div style={{
      position: 'absolute', bottom: '26px', left: '52px', zIndex: 20,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
    }}>
      <span style={{
        writingMode: 'vertical-rl', fontSize: '10px',
        color: '#9b917a', letterSpacing: '0.4em',
      }}>SCROLL</span>
      <span
        className="scroll-pulse-line"
        style={{ width: '1px', height: '42px', background: 'rgba(205,191,160,0.6)' }}
      />
    </div>
  )
}

// ─── PC 専用コンポーネント ────────────────────────────────────────────────────

function DesktopNav() {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '30px', paddingTop: '8px' }}>
      {NAV_LABELS.map(label => (
        <a key={label} href="#" className="nav-link">{label}</a>
      ))}
    </nav>
  )
}

function DesktopHeroCopy() {
  return (
    <div style={{
      position: 'absolute', top: '36%', right: '11%',
      transform: 'translateY(-50%)', zIndex: 20,
      display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: '0.85rem',
    }}>
      <span style={{
        writingMode: 'vertical-rl', fontFamily: "'Yuji Mai', serif",
        fontSize: '60px', color: '#dccda3', letterSpacing: '0.18em',
        textShadow: '0 3px 18px rgba(0,0,0,0.7)',
      }}>秘湯を</span>
      <span style={{
        writingMode: 'vertical-rl', fontFamily: "'Yuji Mai', serif",
        fontSize: '60px', color: '#dccda3', letterSpacing: '0.18em',
        textShadow: '0 3px 18px rgba(0,0,0,0.7)',
      }}>たずねて</span>
      <span style={{
        writingMode: 'vertical-rl', fontFamily: "'Shippori Mincho', serif",
        fontWeight: 400, fontSize: '17px', color: '#c8bca2',
        letterSpacing: '0.42em', marginTop: '20px',
        textShadow: '0 2px 12px rgba(0,0,0,0.6)',
      }}>まだ見ぬ、ひとつの湯へ。</span>
    </div>
  )
}

// ─── モバイル専用コンポーネント ───────────────────────────────────────────────

function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 0',
          display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end',
        }}
      >
        <span style={{
          display: 'block', width: '22px', height: '1.5px', background: '#ddd0b2',
          transformOrigin: 'center',
          transform: open ? 'translateY(7.5px) rotate(45deg)' : 'none',
          transition: 'transform 0.36s cubic-bezier(.4,0,.2,1)',
        }} />
        <span style={{
          display: 'block', width: '16px', height: '1.5px', background: '#ddd0b2',
          opacity: open ? 0 : 1,
          transition: 'opacity 0.22s ease',
        }} />
        <span style={{
          display: 'block', width: '22px', height: '1.5px', background: '#ddd0b2',
          transformOrigin: 'center',
          transform: open ? 'translateY(-7.5px) rotate(-45deg)' : 'none',
          transition: 'transform 0.36s cubic-bezier(.4,0,.2,1)',
        }} />
      </button>

      {createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(10,12,16,0.97)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
            transition: 'opacity 0.38s ease',
          } as React.CSSProperties}
        >
          <button
            onClick={() => setOpen(false)}
            aria-label="メニューを閉じる"
            style={{
              position: 'absolute', top: '22px', right: '22px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#8a8070', fontSize: '24px', lineHeight: '1', padding: '8px',
            }}
          >×</button>

          <div style={{ marginBottom: '52px', textAlign: 'center' }}>
            <img src={logoImg} alt="秘湯ナビロゴ" style={{ height: '54px' }} />
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '36px' }}>
            {NAV_LABELS.map((label, i) => (
              <a
                key={label}
                href="#"
                onClick={() => setOpen(false)}
                style={{
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: '17px', color: '#ddd0b2', letterSpacing: '0.3em',
                  textDecoration: 'none',
                  opacity: open ? 1 : 0,
                  transform: open ? 'translateY(0)' : 'translateY(12px)',
                  transition: open
                    ? `opacity 0.42s ease ${0.1 + i * 0.07}s, transform 0.48s cubic-bezier(.34,1.1,.5,1) ${0.1 + i * 0.07}s`
                    : 'opacity 0.16s ease, transform 0.16s ease',
                }}
              >{label}</a>
            ))}
          </nav>
        </div>,
        document.body
      )}
    </>
  )
}

function MobileHeroCopy() {
  return (
    <div style={{
      position: 'absolute', top: '30%', left: '50%',
      transform: 'translate(-50%, -50%)', zIndex: 20,
      textAlign: 'center', width: '100%', padding: '0 24px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        fontFamily: "'Yuji Mai', serif",
        fontSize: '34px', color: '#dccda3', letterSpacing: '0.2em',
        textShadow: '0 3px 18px rgba(0,0,0,0.7)',
        lineHeight: 1.5,
      }}>秘湯をたずねて</div>
      <div style={{
        fontFamily: "'Shippori Mincho', serif",
        fontWeight: 400, fontSize: '11px', color: '#c8bca2',
        letterSpacing: '0.42em', marginTop: '14px',
        textShadow: '0 2px 12px rgba(0,0,0,0.6)',
      }}>まだ見ぬ、ひとつの湯へ。</div>
    </div>
  )
}

// ─── 検索フィルター コンポーネント（PC 専用） ─────────────────────────────────

type TripType  = 'daytrip' | 'overnight'
type FilterKey = 'area' | 'guests' | 'dates'

function TripToggle({ value, onChange, accent }: {
  value: TripType; onChange: (v: TripType) => void; accent: string
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid rgba(214,199,158,0.2)',
      overflow: 'hidden',
    }}>
      {(['daytrip', 'overnight'] as const).map(type => {
        const active = value === type
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            style={{
              padding: '7px 28px',
              border: 'none',
              background: active ? accent : 'rgba(15,17,22,0.35)',
              color: active ? '#f6efe1' : '#7a7264',
              fontFamily: "'Shippori Mincho', serif",
              fontSize: '12.5px', letterSpacing: '0.22em',
              cursor: 'pointer',
              transition: 'background-color 0.55s ease, color 0.3s ease',
            }}
          >
            {type === 'daytrip' ? '日帰り' : '宿泊'}
          </button>
        )
      })}
    </div>
  )
}

function FilterBtn({ label, active, hasValue, accent, onClick, onMouseEnter }: {
  label: string; active: boolean; hasValue: boolean; accent: string; onClick: () => void; onMouseEnter?: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 16px', flexShrink: 0, alignSelf: 'stretch',
        display: 'flex', alignItems: 'center', gap: '5px',
        fontFamily: "'Shippori Mincho', serif",
        fontSize: '13px', letterSpacing: '0.1em',
        color: (active || hasValue) ? '#e9dfc7' : '#6a6255',
        borderLeft: '1px solid rgba(214,199,158,0.12)',
        transition: 'color 0.25s ease',
        position: 'relative',
      }}
    >
      {label}
      {hasValue && (
        <span style={{
          display: 'inline-block', width: '4px', height: '4px',
          borderRadius: '50%', background: accent, flexShrink: 0,
          transition: 'background-color 0.55s ease',
        }} />
      )}
      {/* アクティブ時の下線インジケーター */}
      <span style={{
        position: 'absolute', bottom: 0, left: '16px', right: '16px', height: '2px',
        background: active ? accent : 'transparent',
        transition: 'background-color 0.55s ease',
      }} />
    </button>
  )
}

function AreaPanel({ selected, onChange, accent, prefectureCounts, onsens, onSelectOnsen }: {
  selected: string[]; onChange: (v: string[]) => void; accent: string
  prefectureCounts: Record<string, number>
  onsens: OnsenSummary[]; onSelectOnsen: (slug: string) => void
}) {
  const [hoveredArea, setHoveredArea] = useState<string | null>(null)
  const [hoveredFirstTier, setHoveredFirstTier] = useState<string | null>(null)
  const [hoveredPref, setHoveredPref] = useState<string | null>(null)
  const [displayedPrefs, setDisplayedPrefs] = useState<string[] | null>(null)
  const [bubbleTop, setBubbleTop] = useState(0)
  const [prefDetail, setPrefDetail] = useState<string | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefClearRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const columnRef     = useRef<HTMLDivElement>(null)
  const chipRefs      = useRef<(HTMLButtonElement | null)[]>([])

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? [] : [name])

  const enterPrefDetail = (name: string) => {
    setPrefDetail(name)
    onChange([name])
    setHoveredArea(null)
    setHoveredFirstTier(null)
    setHoveredPref(null)
    if (prefClearRef.current) clearTimeout(prefClearRef.current)
    setDisplayedPrefs(null)
  }

  const exitPrefDetail = () => {
    setPrefDetail(null)
    onChange([])
  }

  const showPrefs = !prefDetail && !!hoveredArea && !!AREA_PREFECTURES[hoveredArea]

  const cancelLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
  }

  const scheduleLeave = () => {
    cancelLeave()
    leaveTimerRef.current = setTimeout(() => {
      setHoveredArea(null)
      setHoveredFirstTier(null)
      setHoveredPref(null)
      if (prefClearRef.current) clearTimeout(prefClearRef.current)
      prefClearRef.current = setTimeout(() => setDisplayedPrefs(null), 240)
    }, 150)
  }

  const handleAreaEnter = (area: string) => {
    cancelLeave()
    setHoveredFirstTier(area)
    setHoveredPref(null)
    // 北海道は第一・第二両階層を兼ねる（バブル不要）
    if (area === '北海道') {
      setHoveredArea('北海道')
      setHoveredPref('北海道')
      if (prefClearRef.current) clearTimeout(prefClearRef.current)
      prefClearRef.current = setTimeout(() => setDisplayedPrefs(null), 240)
      return
    }
    const subs = AREA_PREFECTURES[area]
    if (subs) {
      if (prefClearRef.current) clearTimeout(prefClearRef.current)
      setHoveredArea(area)
      setDisplayedPrefs(subs)

      const idx  = AREAS.findIndex(a => a === area)
      const chip = chipRefs.current[idx]
      const col  = columnRef.current
      if (chip && col) {
        const chipTop = chip.offsetTop
        const bubbleH = 20 + subs.length * 30
        const colH    = col.offsetHeight
        setBubbleTop(Math.min(chipTop, Math.max(0, colH - bubbleH)))
      }
    } else {
      // 全国 → ズームなし、北海道 → 北海道にズーム
      setHoveredArea(area === '全国' ? null : area)
      if (prefClearRef.current) clearTimeout(prefClearRef.current)
      prefClearRef.current = setTimeout(() => setDisplayedPrefs(null), 240)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', position: 'relative' }}>

      {/* 第一階層: 地域チップ — 詳細モード時も visibility:hidden で高さ維持 */}
      <div
        ref={columnRef}
        style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '140px', flexShrink: 0, position: 'relative' }}
        onMouseLeave={prefDetail ? undefined : scheduleLeave}
      >
        {/* チップ: 常にレンダリング（高さ維持）、詳細モード時は非表示 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', visibility: prefDetail ? 'hidden' : 'visible' }}>
          {AREAS.map((area, i) => {
            const sel           = selected.includes(area)
            const expanded      = hoveredArea === area
            const hasSubs       = !!AREA_PREFECTURES[area]
            const isParentOfSel = !sel && (AREA_PREFECTURES[area]?.some(p => selected.includes(p)) ?? false)
            return (
              <button
                key={area}
                ref={el => { chipRefs.current[i] = el }}
                onMouseEnter={() => handleAreaEnter(area)}
                onClick={() => area === '北海道' ? enterPrefDetail(area) : toggle(area)}
                className={sel ? 'active-chip' : 'suggest-chip'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px 8px 16px',
                  border: (sel || isParentOfSel) ? 'none'
                        : `1px solid rgba(214,199,158,${expanded ? '0.48' : '0.18'})`,
                  outline: 'none', cursor: 'pointer',
                  fontFamily: "'Shippori Mincho', serif",
                  fontSize: '13px', letterSpacing: '0.1em',
                  color: (sel || isParentOfSel) ? '#f6efe1' : expanded ? '#ede2c8' : '#9b917a',
                  background: (sel || isParentOfSel) ? accent : expanded ? 'rgba(214,199,158,0.2)' : 'rgba(214,199,158,0.06)',
                  transition: 'background 0.45s ease, color 0.2s, border-color 0.2s, filter 0.2s',
                  width: '100%',
                }}
              >
                <span>{area}</span>
                {hasSubs && area !== '北海道' && (
                  <span style={{ fontSize: '13px', lineHeight: 1, color: expanded ? '#ede2c8' : '#3a3530', transition: 'color 0.2s' }}>›</span>
                )}
              </button>
            )
          })}
        </div>
        {/* 戻るボタン: 詳細モード時のみ絶対配置で重ねる */}
        {prefDetail !== null && (
          <button
            onClick={exitPrefDetail}
            className="suggest-chip"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px 8px 16px',
              border: '1px solid rgba(214,199,158,0.18)',
              outline: 'none', cursor: 'pointer',
              fontFamily: "'Shippori Mincho', serif",
              fontSize: '13px', letterSpacing: '0.1em',
              color: '#9b917a', background: 'rgba(214,199,158,0.06)',
              transition: 'background 0.45s ease, color 0.2s',
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>←</span>
            <span>戻る</span>
          </button>
        )}
      </div>

      {/* 地図 */}
      <div style={{ flex: 1, alignSelf: 'stretch', minHeight: '300px', position: 'relative', overflow: 'hidden' }}>
        <JapanMap
          selected={selected}
          hoveredArea={hoveredArea}
          hoveredPref={hoveredPref}
          accent={accent}
          onToggle={enterPrefDetail}
          zoomPref={prefDetail}
          prefectureCounts={prefectureCounts}
          onsens={onsens}
          onSelectOnsen={onSelectOnsen}
        />
        <OkinawaInset
          selected={selected}
          hoveredArea={hoveredArea}
          hoveredPref={hoveredPref}
          accent={accent}
          onToggle={enterPrefDetail}
          visible={
            prefDetail === null && (
              (hoveredFirstTier === null && selected.length === 0) ||
              selected.includes('全国') ||
              hoveredFirstTier === '全国' ||
              selected.includes('九州・沖縄') ||
              hoveredFirstTier === '九州・沖縄' ||
              (AREA_PREFECTURES['九州・沖縄']?.some(p => selected.includes(p)) ?? false)
            )
          }
        />
        {prefDetail && (
          <div style={{
            position: 'absolute', top: 0, right: '14px', bottom: 0,
            display: 'flex', alignItems: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px',
            }}>
              <span style={{ fontSize: '7px', color: '#cdbfa0', lineHeight: 1 }}>●</span>
              <span style={{
                writingMode: 'vertical-rl',
                fontFamily: "'Yuji Mai', serif",
                fontSize: '23px',
                color: '#cdbfa0',
                letterSpacing: '0.18em',
                userSelect: 'none',
              }}>
                {prefDetail}
              </span>
              <span style={{ fontSize: '7px', color: '#cdbfa0', lineHeight: 1 }}>●</span>
            </div>
          </div>
        )}
      </div>

      {/* 第二階層: 吹き出し */}
      <div
        onMouseEnter={cancelLeave}
        onMouseLeave={scheduleLeave}
        style={{
          position: 'absolute',
          left: '150px',
          top: `${bubbleTop}px`,
          width: '132px',
          padding: '10px 0',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(10,12,16,0.94)',
          border: '1px solid rgba(214,199,158,0.22)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          opacity: showPrefs ? 1 : 0,
          transform: showPrefs ? 'translateX(0)' : 'translateX(-8px)',
          pointerEvents: showPrefs ? 'auto' : 'none',
          transition: 'opacity 0.22s ease, transform 0.25s cubic-bezier(.34,1.1,.5,1)',
          zIndex: 2,
        }}
      >
        {displayedPrefs && displayedPrefs.map(pref => {
          const sel = selected.includes(pref)
          return (
            <button
              key={pref}
              onClick={() => enterPrefDetail(pref)}
              onMouseEnter={() => setHoveredPref(pref)}
              onMouseLeave={() => setHoveredPref(null)}
              className={sel ? 'active-chip' : 'suggest-chip'}
              style={{
                padding: '7px 16px',
                border: 'none', outline: 'none', cursor: 'pointer',
                fontFamily: "'Shippori Mincho', serif",
                fontSize: '12.5px', letterSpacing: '0.08em',
                color: sel ? '#f6efe1' : '#9b917a',
                background: sel ? accent : 'transparent',
                transition: 'background-color 0.45s ease, color 0.2s ease, filter 0.2s',
                textAlign: 'left', width: '100%',
              }}
            >{pref}</button>
          )
        })}
      </div>

    </div>
  )
}

function JapanMap({ selected, hoveredArea, hoveredPref, accent, onToggle, zoomPref, prefectureCounts, onsens, onSelectOnsen }: {
  selected:    string[]
  hoveredArea: string | null
  hoveredPref: string | null
  accent:      string
  onToggle:    (name: string) => void
  zoomPref:    string | null
  prefectureCounts: Record<string, number>
  onsens: OnsenSummary[]
  onSelectOnsen: (slug: string) => void
}) {
  const svgRef          = useRef<SVGSVGElement>(null)
  const vbRef           = useRef<VB>(MAP_DEFAULT_VB)
  const rafRef          = useRef<number>(0)
  const dragRef         = useRef<{ x: number; y: number; vb: VB } | null>(null)
  const pinchRef        = useRef<{ dist: number; midX: number; midY: number } | null>(null)
  const movedRef        = useRef(false)
  const shapeResetTimer = useRef<ReturnType<typeof setTimeout>>(0 as any)
  const [mapHoveredPref, setMapHoveredPref] = useState<string | null>(null)
  const [hdPath, setHdPath] = useState<string | null>(null)

  // ── 施設数アイコン表示（第一段階チップへのホバー、またはその拡大率までのズーム） ──
  const hoveredAreaRef = useRef(hoveredArea)
  const hoveredPrefRef = useRef(hoveredPref)
  const zoomPrefRef    = useRef(zoomPref)
  useEffect(() => { hoveredAreaRef.current = hoveredArea }, [hoveredArea])
  useEffect(() => { hoveredPrefRef.current = hoveredPref }, [hoveredPref])
  useEffect(() => { zoomPrefRef.current = zoomPref }, [zoomPref])

  const [countOverlayPrefs, setCountOverlayPrefs] = useState<string[]>([])
  // 現在のviewBox幅（施設数アイコン・施設マーカーの見た目サイズをズーム倍率に応じて
  // 補正するために使う）。モード（通常/県詳細）に関わらず常に追従させる。
  const [liveVbWidth, setLiveVbWidth] = useState(MAP_DEFAULT_VB[2])
  const countOverlayKeyRef = useRef('')
  const liveVbWidthKeyRef = useRef(MAP_DEFAULT_VB[2])
  const prevHoveredAreaRef = useRef(hoveredArea)
  // チップのホバーが外れた直後、ズームが国土表示へ戻りきるまでの間は
  // 「ホバーなしでのズーム相当」判定（Case B）を一時的に無効化するためのフラグ。
  // ユーザーが自分で新たにズーム操作をした場合はその場で解除する。
  const suppressZoomCaseRef = useRef(false)

  // 現在のviewBoxとホバー状態から、施設数アイコンを表示すべき県の一覧・現在のズーム幅を再計算する。
  // 変化があったときだけ setState するため、ズーム中の毎フレーム呼んでも問題ない。
  const syncCountOverlay = () => {
    const vb = vbRef.current

    const widthKey = Math.round(vb[2] / 2)
    if (widthKey !== liveVbWidthKeyRef.current) {
      liveVbWidthKeyRef.current = widthKey
      setLiveVbWidth(vb[2])
    }

    let prefs: string[] = []
    if (!zoomPrefRef.current) {
      const ha = hoveredAreaRef.current
      if (ha) {
        // 第一段階チップへのホバー中: フォーカスされている地方の県のみ
        prefs = ha === '北海道' ? ['北海道'] : (AREA_PREFECTURES[ha] ?? [])
      } else if (!hoveredPrefRef.current && !suppressZoomCaseRef.current && vb[2] <= REGION_ZOOM_MAX_W) {
        // ホバーなしで地方相当以上のズーム倍率に達している: 画面に映っている県すべて
        prefs = prefsVisibleInViewBox(vb)
      }
    }
    const key = prefs.length ? prefs.slice().sort().join(',') : ''
    if (key !== countOverlayKeyRef.current) {
      countOverlayKeyRef.current = key
      setCountOverlayPrefs(prefs)
    }
  }

  // hoveredArea/hoveredPref/zoomPref の変化に即座に反応（アニメーション開始前でも表示切替）
  useEffect(() => {
    if (prevHoveredAreaRef.current && !hoveredArea) {
      // チップのホバーが外れた瞬間: ズームが戻りきる前に即座にアイコンを消す
      suppressZoomCaseRef.current = true
    }
    prevHoveredAreaRef.current = hoveredArea
    syncCountOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredArea, hoveredPref, zoomPref])

  // 詳細モード時のみ高精細データを動的ロード
  useEffect(() => {
    if (!zoomPref) { setHdPath(null); return }
    let cancelled = false
    import('../assets/japan_s35.topojson.json').then((mod: any) => {
      if (cancelled) return
      const topo = mod.default
      const feats = ((topoFeature(topo as any, (topo as any).objects.japan) as any).features as any[])
        .map(_filterOgasawara)
      const f = feats.find((ft: any) => ft.properties.nam_ja === zoomPref)
      setHdPath(f ? (_mapGen(f) ?? null) : null)
    })
    return () => { cancelled = true }
  }, [zoomPref])

  useEffect(() => {
    if (dragRef.current || pinchRef.current) return  // ドラッグ・ピンチ中はズームアニメを止める
    let target: VB = MAP_DEFAULT_VB
    if (hoveredArea) {
      target = REGION_VB[hoveredArea] ?? MAP_DEFAULT_VB
    } else if (zoomPref) {
      target = PREF_VB[zoomPref]
          ?? REGION_VB[PREFECTURE_TO_REGION[zoomPref] ?? zoomPref]
          ?? MAP_DEFAULT_VB
    } else if (!selected.includes('全国') && selected.length > 0) {
      const s = selected[0]
      const za = REGION_VB[s] ? s : (PREFECTURE_TO_REGION[s] ?? null)
      if (za) target = REGION_VB[za] ?? MAP_DEFAULT_VB
    }
    cancelAnimationFrame(rafRef.current)
    const tick = () => {
      if (dragRef.current || pinchRef.current) return  // ドラッグ・ピンチが割り込んだら停止
      const next = lerpVB(vbRef.current, target, 0.1)
      vbRef.current = next
      svgRef.current?.setAttribute('viewBox', fmtVB(next))
      syncCountOverlay()
      if (!vbDone(next, target)) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        vbRef.current = target
        svgRef.current?.setAttribute('viewBox', fmtVB(target))
        svgRef.current?.setAttribute('shape-rendering', 'auto')
        // 国土表示まで戻りきった＝ホバー解除後の抑制はもう不要
        if (target === MAP_DEFAULT_VB) suppressZoomCaseRef.current = false
        syncCountOverlay()
      }
    }
    svgRef.current?.setAttribute('shape-rendering', 'optimizeSpeed')
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [hoveredArea, selected, zoomPref])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      // 2本指ピンチ: ズーム（＋2指の中点移動でパン）
      if ('touches' in e && e.touches.length >= 2 && pinchRef.current) {
        e.preventDefault()
        const svg = svgRef.current
        if (!svg) return
        const t1 = e.touches[0], t2 = e.touches[1]
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
        const midX = (t1.clientX + t2.clientX) / 2
        const midY = (t1.clientY + t2.clientY) / 2
        const rect = svg.getBoundingClientRect()
        const vb = vbRef.current
        // 2指の中点を SVG 座標へ変換し、その点を基準にズーム
        const svgX = vb[0] + (midX - rect.left) / rect.width  * vb[2]
        const svgY = vb[1] + (midY - rect.top)  / rect.height * vb[3]
        const factor = pinchRef.current.dist / (dist || 1)  // 指を広げる=factor<1=ズームイン
        const minW = 30
        const maxW = MAP_DEFAULT_VB[2] * 1.3
        const newW = Math.max(minW, Math.min(maxW, vb[2] * factor))
        const s = newW / vb[2]
        let nvb: VB = [
          svgX - (svgX - vb[0]) * s,
          svgY - (svgY - vb[1]) * s,
          newW,
          vb[3] * s,
        ]
        // 中点の移動ぶんパン
        const dMidX = midX - pinchRef.current.midX
        const dMidY = midY - pinchRef.current.midY
        nvb = [
          nvb[0] - dMidX * (nvb[2] / rect.width),
          nvb[1] - dMidY * (nvb[3] / rect.height),
          nvb[2],
          nvb[3],
        ]
        vbRef.current = nvb
        svg.setAttribute('viewBox', fmtVB(nvb))
        syncCountOverlay()
        pinchRef.current = { dist, midX, midY }
        return
      }
      if (!dragRef.current) return
      e.preventDefault()
      const pt = 'touches' in e ? e.touches[0] : e
      const dx = pt.clientX - dragRef.current.x
      const dy = pt.clientY - dragRef.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const { vb } = dragRef.current
      const newVb: VB = [
        vb[0] - dx * (vb[2] / rect.width),
        vb[1] - dy * (vb[3] / rect.height),
        vb[2],
        vb[3],
      ]
      vbRef.current = newVb
      svg.setAttribute('viewBox', fmtVB(newVb))
      syncCountOverlay()
    }
    const onUp = (e?: MouseEvent | TouchEvent) => {
      // ピンチ中に指が2本未満へ減ったら終了処理
      if (e && 'touches' in e && e.touches.length >= 2) return  // まだピンチ継続
      pinchRef.current = null
      // 1本残っていれば単指パンへ引き継ぐ（地図が飛ばないよう基準を取り直す）
      if (e && 'touches' in e && e.touches.length === 1) {
        const t = e.touches[0]
        dragRef.current = { x: t.clientX, y: t.clientY, vb: [...vbRef.current] as VB }
        return
      }
      if (!dragRef.current) {
        svgRef.current?.setAttribute('shape-rendering', 'auto')
        return
      }
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      svgRef.current?.setAttribute('shape-rendering', 'auto')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    window.addEventListener('touchcancel', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchcancel', onUp)
    }
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const isPinch      = e.ctrlKey
      // line/page deltaMode → マウスホイール確定。pixel modeでも大きなdelta → マウスホイールと判断
      const isMouseWheel = !e.ctrlKey && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40)
      if (!isPinch && !isMouseWheel) return  // トラックパッドの通常スクロール → ページへ委譲

      e.preventDefault()
      cancelAnimationFrame(rafRef.current)
      suppressZoomCaseRef.current = false  // ユーザーの明示的なズーム操作: 抑制をその場で解除

      const rect = svg.getBoundingClientRect()
      const vb   = vbRef.current
      // カーソル位置を SVG 座標に変換
      const svgX = vb[0] + (e.clientX - rect.left)  / rect.width  * vb[2]
      const svgY = vb[1] + (e.clientY - rect.top)   / rect.height * vb[3]

      // ズーム係数: factor > 1 = ズームアウト（VB 拡大）
      const factor = isPinch
        ? Math.pow(1.01, e.deltaY)          // ピンチ: 連続・小刻み
        : (e.deltaY > 0 ? 1.25 : 0.8)      // マウスホイール: 1段=20%

      const minW = 30
      const maxW = MAP_DEFAULT_VB[2] * 1.3
      const newW = Math.max(minW, Math.min(maxW, vb[2] * factor))
      const s    = newW / vb[2]  // 実際のスケール比（クランプ後）
      const newVb: VB = [
        svgX - (svgX - vb[0]) * s,
        svgY - (svgY - vb[1]) * s,
        newW,
        vb[3] * s,
      ]
      vbRef.current = newVb
      svg.setAttribute('viewBox', fmtVB(newVb))
      svg.setAttribute('shape-rendering', 'optimizeSpeed')
      syncCountOverlay()

      clearTimeout(shapeResetTimer.current)
      shapeResetTimer.current = setTimeout(() => {
        svg.setAttribute('shape-rendering', 'auto')
      }, 200)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const handlePointerDown = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    // 2本指 → ピンチ開始（指間距離と中点を記録し、ドラッグは無効化）
    if ('touches' in e && e.touches.length >= 2) {
      const t1 = e.touches[0], t2 = e.touches[1]
      pinchRef.current = {
        dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      }
      dragRef.current = null
      movedRef.current = true  // タップ選択が誤発火しないように
      cancelAnimationFrame(rafRef.current)
      suppressZoomCaseRef.current = false  // ユーザーの明示的なズーム操作: 抑制をその場で解除
      svgRef.current?.setAttribute('shape-rendering', 'optimizeSpeed')
      return
    }
    const pt = 'touches' in e ? e.touches[0] : e
    movedRef.current = false
    dragRef.current = { x: pt.clientX, y: pt.clientY, vb: [...vbRef.current] as VB }
    cancelAnimationFrame(rafRef.current)
    svgRef.current?.setAttribute('shape-rendering', 'optimizeSpeed')
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  const getFill = (name: string) => {
    const region = PREFECTURE_TO_REGION[name] ?? name
    const sel = selected.includes('全国') || selected.includes(name) || selected.includes(region)
    // 全国選択中かつ全国以外ホバー → 全オフ
    if (selected.includes('全国') && (hoveredArea !== null || hoveredPref !== null)) {
      if (hoveredPref !== null && name === hoveredPref) return accentAlpha(accent, 0.38)
      return 'rgba(214,199,158,0.07)'
    }
    // 第一・第二階層チップいずれかホバー中
    if (hoveredArea !== null || hoveredPref !== null) {
      // 第二階層ホバー: 対象県のみ半透明
      if (hoveredPref !== null && name === hoveredPref) return accentAlpha(accent, 0.38)
      // 第一階層ホバー中かつ第二階層ホバーなし: ホバーエリア内の選択済み県は不透明
      if (hoveredArea !== null && hoveredPref === null) {
        const inArea = hoveredArea === name || hoveredArea === region ||
          (AREA_PREFECTURES[hoveredArea]?.includes(name) ?? false)
        if (inArea && sel) return accent
      }
      return 'rgba(214,199,158,0.07)'
    }
    // マップ直接ホバー: 対象県=半透明 / 他=選択状態
    if (mapHoveredPref !== null) {
      if (name === mapHoveredPref) return accentAlpha(accent, 0.38)
      return sel ? accent : 'rgba(214,199,158,0.07)'
    }
    // ホバーなし: 選択済み=不透明 / 非選択=オフ
    return sel ? accent : 'rgba(214,199,158,0.07)'
  }

  return (
    <svg
      ref={svgRef}
      viewBox={fmtVB(vbRef.current)}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'grab' }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      {zoomPref ? (
        // 詳細モード: 対象県の高精細パスのみ描画（HD ロード前は簡略版で表示）＋施設マーカー
        (() => {
          const baseD = zoomPref === '沖縄県'
            ? OKINAWA_MAIN_PATH
            : (PREF_PATHS.find(p => p.name === zoomPref)?.d ?? '')
          if (!baseD) return null
          const markerScale = liveVbWidth / MAP_DEFAULT_VB[2]
          return (
            <React.Fragment key={zoomPref}>
              <path
                d={hdPath ?? baseD}
                fill={accent}
                style={{ cursor: 'pointer', transition: 'fill 0.3s ease' }}
                onClick={() => { if (!movedRef.current) onToggle(zoomPref) }}
              />
              {/* 施設マーカー: 県に属する施設の大体の位置。クリックで詳細ページへ直接遷移 */}
              {onsens.filter(o => o.prefecture === zoomPref).map(o => {
                const pt = facilityMarkerPoint(o.slug, zoomPref)
                if (!pt) return null
                return (
                  <g
                    key={`mk_${o.slug}`}
                    transform={`translate(${pt[0]},${pt[1]}) scale(${markerScale})`}
                    style={{ cursor: 'pointer' }}
                    onClick={e => {
                      e.stopPropagation()
                      if (!movedRef.current) onSelectOnsen(o.slug)
                    }}
                  >
                    <circle r={10} fill="rgba(20,22,27,0.92)" stroke="#f6efe1" strokeWidth={1.4} />
                    <circle r={3.4} fill="#f6efe1" />
                  </g>
                )
              })}
            </React.Fragment>
          )
        })()
      ) : (
        <>
          {PREF_PATHS.map(({ d, name }) => (
            <path
              key={name}
              d={d}
              fill={getFill(name)}
              style={{ cursor: 'pointer', transition: 'fill 0.3s ease' }}
              onMouseEnter={() => { if (!dragRef.current) setMapHoveredPref(name) }}
              onMouseLeave={() => setMapHoveredPref(null)}
              onClick={() => { if (!movedRef.current) onToggle(name) }}
            />
          ))}
          <path d={BORDER_MESH} fill="none" stroke="rgba(214,199,158,0.22)" strokeWidth={0.6} style={{ pointerEvents: 'none' }} />

          {/* 施設数アイコン: 第一段階チップへのホバー中はその地方の県のみ、
              ホバーなしで地方相当のズーム倍率に達しているときは画面に映っている県すべて */}
          {countOverlayPrefs.map(name => {
            const c = PREF_CENTROIDS[name]
            if (!c) return null
            // viewBoxが狭くなる（ズームインする）ほど scale を小さくし、見た目のアイコンサイズをほぼ一定に保つ
            const scale = liveVbWidth / MAP_DEFAULT_VB[2]
            const count = prefectureCounts[name] ?? 0
            return (
              <g key={`cnt_${name}`} transform={`translate(${c[0]},${c[1]}) scale(${scale})`} style={{ pointerEvents: 'none' }}>
                <circle r={12} fill={accentAlpha(accent, 0.92)} stroke="rgba(246,239,225,0.85)" strokeWidth={1} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  fontFamily="'Shippori Mincho', serif"
                  fontWeight={600}
                  fill="#f6efe1"
                >{count}</text>
              </g>
            )
          })}
        </>
      )}
    </svg>
  )
}

function OkinawaInset({ selected, hoveredArea, hoveredPref, accent, onToggle, visible }: {
  selected:    string[]
  hoveredArea: string | null
  hoveredPref: string | null
  accent:      string
  onToggle:    (name: string) => void
  visible:     boolean
}) {
  if (!OKINAWA_PATH) return null

  const name   = '沖縄県'
  const region = '九州・沖縄'
  const sel = selected.includes('全国') || selected.includes(name) || selected.includes(region)
  const hov = hoveredPref === name || (!!hoveredArea && (
    hoveredArea === name || hoveredArea === region ||
    (AREA_PREFECTURES[hoveredArea]?.includes(name) ?? false)
  ))
  const anyHovered = hoveredArea !== null || hoveredPref !== null
  const fill = (selected.includes('全国') && anyHovered)
    ? (hov ? accentAlpha(accent, 0.38) : 'rgba(214,199,158,0.07)')
    : sel ? accent : hov ? accentAlpha(accent, 0.38) : 'rgba(214,199,158,0.07)'

  return (
    <div
      onClick={visible ? () => onToggle(name) : undefined}
      style={{
        position: 'absolute', bottom: '10px', right: '6px',
        width: `${INSET_W}px`,
        cursor: visible ? 'pointer' : 'default',
        borderTop:  '1px solid rgba(214,199,158,0.22)',
        borderLeft: '1px solid rgba(214,199,158,0.22)',
        paddingLeft: '10px',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.35s ease',
      }}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${INSET_W} ${INSET_H}`}
        style={{ display: 'block' }}
      >
        <path
          d={OKINAWA_PATH}
          fill={fill}
          stroke="rgba(214,199,158,0.28)"
          strokeWidth={0.7}
          style={{ transition: 'fill 0.3s ease' }}
        />
      </svg>
    </div>
  )
}

function GuestsPanel({ count, onChange, roomCount, onRoomChange, isMobile = false }: {
  count: number; onChange: (n: number) => void
  roomCount: number; onRoomChange: (n: number) => void
  isMobile?: boolean
}) {
  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    width: '32px', height: '32px', flexShrink: 0,
    border: `1px solid rgba(214,199,158,${enabled ? '0.22' : '0.08'})`,
    background: 'transparent', cursor: enabled ? 'pointer' : 'default',
    color: enabled ? '#cdbfa0' : '#3a3530',
    fontSize: '16px', lineHeight: '1',
    fontFamily: "'Shippori Mincho', serif",
    transition: 'color 0.2s ease, border-color 0.2s ease, background 0.2s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })
  const labelStyle: React.CSSProperties = {
    fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em',
    fontFamily: "'Shippori Mincho', serif", fontWeight: 600, marginBottom: '14px',
  }
  const counterStyle: React.CSSProperties = {
    minWidth: '52px', textAlign: 'center',
    fontFamily: "'Shippori Mincho', serif", fontSize: '22px', color: '#e9dfc7',
  }
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? '20px' : '40px',
    }}>
      <div>
        <div style={labelStyle}>宿泊人数</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <button style={btnStyle(count > 1)} className={count > 1 ? 'guests-btn' : ''} onClick={() => onChange(Math.max(1, count - 1))} disabled={count <= 1}>ー</button>
          <div style={counterStyle}>
            {count}
            <span style={{ fontSize: '12px', color: '#9b917a', marginLeft: '4px' }}>名</span>
          </div>
          <button style={btnStyle(count < 10)} className={count < 10 ? 'guests-btn' : ''} onClick={() => onChange(Math.min(10, count + 1))} disabled={count >= 10}>＋</button>
        </div>
      </div>
      <div style={{
        background: 'rgba(214,199,158,0.1)',
        ...(isMobile ? { height: '1px', width: '100%' } : { width: '1px', alignSelf: 'stretch' }),
      }} />
      <div>
        <div style={labelStyle}>部屋数</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <button style={btnStyle(roomCount > 1)} className={roomCount > 1 ? 'guests-btn' : ''} onClick={() => onRoomChange(Math.max(1, roomCount - 1))} disabled={roomCount <= 1}>ー</button>
          <div style={counterStyle}>
            {roomCount}
            <span style={{ fontSize: '12px', color: '#9b917a', marginLeft: '4px' }}>室</span>
          </div>
          <button style={btnStyle(roomCount < 10)} className={roomCount < 10 ? 'guests-btn' : ''} onClick={() => onRoomChange(Math.min(10, roomCount + 1))} disabled={roomCount >= 10}>＋</button>
        </div>
      </div>
    </div>
  )
}

function DatesPanel({ checkIn, checkOut, onCheckIn, onCheckOut, isMobile = false }: {
  checkIn: string; checkOut: string
  onCheckIn: (v: string) => void; onCheckOut: (v: string) => void
  isMobile?: boolean
}) {
  const inputStyle: React.CSSProperties = {
    background: 'transparent', outline: 'none',
    border: '1px solid rgba(214,199,158,0.22)',
    color: '#e9dfc7', fontFamily: "'Shippori Mincho', serif",
    fontSize: '13px', letterSpacing: '0.06em',
    padding: '7px 12px',
    colorScheme: 'dark',
    ...(isMobile ? { width: '100%', boxSizing: 'border-box' as const } : {}),
  }
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? '16px' : '24px',
      alignItems: isMobile ? 'stretch' : 'flex-end',
    }}>
      <div style={isMobile ? { width: '100%' } : undefined}>
        <div style={{ fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em', fontFamily: "'Shippori Mincho', serif", fontWeight: 600, marginBottom: '10px' }}>チェックイン</div>
        <input type="date" value={checkIn} onChange={e => onCheckIn(e.target.value)} style={inputStyle} />
      </div>
      {!isMobile && <span style={{ color: '#4a443a', fontSize: '16px', paddingBottom: '9px' }}>→</span>}
      <div style={isMobile ? { width: '100%' } : undefined}>
        <div style={{ fontSize: '12.5px', color: '#c8b898', letterSpacing: '0.22em', fontFamily: "'Shippori Mincho', serif", fontWeight: 600, marginBottom: '10px' }}>チェックアウト</div>
        <input type="date" value={checkOut} onChange={e => onCheckOut(e.target.value)} style={inputStyle} />
      </div>
    </div>
  )
}

// ─── モバイル専用フィルター UI ────────────────────────────────────────────────

// モバイル: 検索バー下に並ぶフィルター起点ボタン（タップでモーダルを開く）
function MobileFilterPill({ label, hasValue, active, accent, onClick }: {
  label: string; hasValue: boolean; active: boolean; accent: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        padding: '9px 10px',
        border: `1px solid rgba(214,199,158,${active ? '0.5' : '0.2'})`,
        background: active ? 'rgba(214,199,158,0.12)' : 'rgba(15,17,22,0.52)',
        backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)',
        color: (hasValue || active) ? '#e9dfc7' : '#9b917a',
        fontFamily: "'Shippori Mincho', serif",
        fontSize: '13px', letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: 'color 0.2s, border-color 0.2s, background 0.2s',
      } as React.CSSProperties}
    >
      {label}
      {hasValue && (
        <span style={{ display: 'inline-block', width: '4px', height: '4px', borderRadius: '50%', background: accent, flexShrink: 0 }} />
      )}
    </button>
  )
}

// モバイル: フィルター内容を包むボトムシート型モーダル
function MobileFilterModal({ open, title, onClose, accent, children }: {
  open: boolean; title: string; onClose: () => void; accent: string; children: React.ReactNode
}) {
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(8,10,14,0.72)',
        backdropFilter: open ? 'blur(6px)' : 'blur(0px)',
        WebkitBackdropFilter: open ? 'blur(6px)' : 'blur(0px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.3s ease, backdrop-filter 0.3s ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      } as React.CSSProperties}
    >
      <div style={{
        background: 'rgba(13,16,21,0.98)',
        borderTop: '1px solid rgba(214,199,158,0.2)',
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(.34,1.05,.5,1)',
      }}>
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(214,199,158,0.12)',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Yuji Mai', serif", fontSize: '18px', letterSpacing: '0.22em', color: '#e3d6b4' }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8070', fontSize: '22px', lineHeight: 1, padding: '4px 6px' }}
          >×</button>
        </div>
        {/* 中身 */}
        <div className="overlay-scroll" style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
          {children}
        </div>
        {/* フッター */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(214,199,158,0.12)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px', border: 'none', background: accent, color: '#f6efe1',
              fontFamily: "'Shippori Mincho', serif", fontSize: '14px', letterSpacing: '0.22em', cursor: 'pointer',
              transition: 'background-color 0.55s ease',
            }}
          >決定</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// モバイル: エリア選択（横並びの吹き出しではなくタップでドリルダウンする縦積みレイアウト）
function MobileAreaPanel({ selected, onChange, accent, prefectureCounts, onsens, onSelectOnsen }: {
  selected: string[]; onChange: (v: string[]) => void; accent: string
  prefectureCounts: Record<string, number>
  onsens: OnsenSummary[]; onSelectOnsen: (slug: string) => void
}) {
  const [view, setView] = useState<'areas' | 'prefs'>('areas')
  const [activeArea, setActiveArea] = useState<string | null>(null)
  const [prefDetail, setPrefDetail] = useState<string | null>(null)

  const enterPrefDetail = (name: string) => { setPrefDetail(name); onChange([name]) }
  const clearPrefDetail = () => { setPrefDetail(null); onChange([]) }

  const onAreaTap = (area: string) => {
    if (area === '全国') { onChange(selected.includes('全国') ? [] : ['全国']); return }
    if (area === '北海道') { enterPrefDetail('北海道'); return }
    if (AREA_PREFECTURES[area]) { setActiveArea(area); setView('prefs') }
    else { onChange(selected.includes(area) ? [] : [area]) }
  }

  const goBackToAreas = () => { setView('areas'); setActiveArea(null) }

  const chipStyle = (sel: boolean): React.CSSProperties => ({
    padding: '9px 14px', outline: 'none', cursor: 'pointer',
    border: sel ? 'none' : '1px solid rgba(214,199,158,0.2)',
    color: sel ? '#f6efe1' : '#c4b898',
    background: sel ? accent : 'rgba(214,199,158,0.06)',
    fontFamily: "'Shippori Mincho', serif", fontSize: '13.5px', letterSpacing: '0.08em',
    transition: 'background 0.4s ease, color 0.2s, border-color 0.2s',
  })

  const backBtnStyle: React.CSSProperties = {
    ...chipStyle(false), alignSelf: 'flex-start',
    display: 'flex', alignItems: 'center', gap: '6px',
  }

  // 地図ズーム: prefDetail 優先 → prefs 表示中は選択エリアへ地域ズーム
  const mapHoveredArea = !prefDetail && view === 'prefs' ? activeArea : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 地図 */}
      <div style={{ position: 'relative', width: '100%', height: '300px', overflow: 'hidden', border: '1px solid rgba(214,199,158,0.12)' }}>
        <JapanMap
          selected={selected}
          hoveredArea={mapHoveredArea}
          hoveredPref={null}
          accent={accent}
          onToggle={enterPrefDetail}
          zoomPref={prefDetail}
          prefectureCounts={prefectureCounts}
          onsens={onsens}
          onSelectOnsen={onSelectOnsen}
        />
        <OkinawaInset
          selected={selected}
          hoveredArea={mapHoveredArea}
          hoveredPref={null}
          accent={accent}
          onToggle={enterPrefDetail}
          visible={
            prefDetail === null && (
              (activeArea === null && selected.length === 0) ||
              selected.includes('全国') ||
              activeArea === '九州・沖縄' ||
              (AREA_PREFECTURES['九州・沖縄']?.some(p => selected.includes(p)) ?? false)
            )
          }
        />
        {prefDetail && (
          <div style={{ position: 'absolute', top: 0, right: '12px', bottom: 0, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <span style={{
              writingMode: 'vertical-rl', fontFamily: "'Yuji Mai', serif",
              fontSize: '22px', color: '#cdbfa0', letterSpacing: '0.18em', userSelect: 'none',
            }}>{prefDetail}</span>
          </div>
        )}
      </div>

      {/* コントロール（タップでドリルダウン） */}
      {prefDetail ? (
        <button onClick={clearPrefDetail} style={backBtnStyle}>
          <span style={{ fontSize: '15px', lineHeight: 1 }}>←</span> 選び直す
        </button>
      ) : view === 'prefs' && activeArea ? (
        <>
          <button onClick={goBackToAreas} style={backBtnStyle}>
            <span style={{ fontSize: '15px', lineHeight: 1 }}>←</span> {activeArea}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {AREA_PREFECTURES[activeArea]!.map(pref => (
              <button key={pref} onClick={() => enterPrefDetail(pref)} style={chipStyle(selected.includes(pref))}>{pref}</button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {AREAS.map(area => {
            const sel = selected.includes(area)
            const hasSubs = !!AREA_PREFECTURES[area]
            return (
              <button
                key={area}
                onClick={() => onAreaTap(area)}
                style={{ ...chipStyle(sel), display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {area}
                {hasSubs && area !== '北海道' && (
                  <span style={{ fontSize: '13px', lineHeight: 1, color: sel ? '#f6efe1' : '#6a6255' }}>›</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 検索結果 ────────────────────────────────────────────────────────────────

type OnsenSummary = {
  id: number
  slug: string
  name: string
  region: string
  prefecture: string
  area: string
  quietness_score: number
  solitude_score: number
  accessibility_score: number
  hero_image_url: string | null
  day_trip_available: boolean
  accommodation_available: boolean
  admission_fee_min: number | null
  lodging_fee_min: number | null
  tags: string[]
}

// TOP3の「軽い詳細」エリア用。GET /onsens/{slug} のうち必要なフィールドだけ。
type Top3Detail = {
  slug: string
  intro_text: string | null
  // 「混みあい」欄の代用データ：DBに専用カラムが無いため、混雑傾向を含む静けさコメントを流用する
  quietness_comment: string | null
  spring_info: { spring_type: string | null } | null
  access: {
    public_transport_route: string | null
    nearest_ic_minutes: number | null
    nearest_station_walk_minutes: number | null
  } | null
}

// Detailsセクションの章番号（第一席・第二席・第三席）。TOP3固定なので3つで足りる。
const KANJI_RANK = ['一', '二', '三']

// アクセス難易度が高い（4以上）施設の警告色。湯あかり公式パレットの「朱」。
const WARN_COLOR = '#a8412f'

// 都道府県の全集合（北海道を含む）。地域選択が都道府県か集約エリアかの判定に使う。
const PREF_SET = new Set<string>([
  ...Object.values(AREA_PREFECTURES).flatMap(ps => ps ?? []),
  '北海道',
])

// 検索時の旅行タイプに応じた料金ラベル（宿泊→宿泊料/人、日帰り→入浴料）
function feeLabel(onsen: OnsenSummary, mode: TripType): string {
  if (mode === 'overnight') {
    return onsen.lodging_fee_min !== null ? `${onsen.lodging_fee_min.toLocaleString()}円〜/人` : '宿泊料 不明'
  }
  return onsen.admission_fee_min !== null ? `${onsen.admission_fee_min.toLocaleString()}円〜` : '入浴料 不明'
}

// 施設の日帰り/宿泊可否チップ
function AvailabilityChips({ dayTrip, stay, accent }: { dayTrip: boolean; stay: boolean; accent: string }) {
  const chipStyle: React.CSSProperties = {
    fontSize: '11px', letterSpacing: '0.08em',
    padding: '2px 9px',
    border: `1px solid ${accentAlpha(accent, 0.5)}`,
    color: '#e9dfc7', background: accentAlpha(accent, 0.14),
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {dayTrip && <span style={chipStyle}>日帰り可</span>}
      {stay && <span style={chipStyle}>宿泊可</span>}
    </div>
  )
}

// 秘湯スコア1軸ぶんのドットバー（塗りセグメントで達成度を示す）
function ScoreDots({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ flex: 1, height: '2px', background: i < value ? color : 'rgba(214,199,158,0.16)' }} />
      ))}
    </div>
  )
}

// 秘湯スコア3軸（静けさ・ソロ適性・アクセス難易度）：ラベル/数値/ドットバーの3列グリッド。
// アクセス難易度は値4以上で警告色に反転する（アクセスが悪いほど警告色）。
function ScoreDotBars({ q, s, a, accent }: { q: number; s: number; a: number; accent: string }) {
  const col = (label: string, value: number, isAccess = false) => {
    const color = isAccess && value >= 4 ? WARN_COLOR : accent
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={{ fontSize: '9.5px', color: '#7e765f', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontFamily: "'Shippori Mincho', serif", fontSize: '16px', color: '#dccda3', fontWeight: 500, lineHeight: 1 }}>
          {value}<span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '10px', color: '#7e765f', marginLeft: '2px' }}>/5</span>
        </span>
        <ScoreDots value={value} color={color} />
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', paddingTop: '11px', borderTop: '1px solid rgba(214,199,158,0.14)' }}>
      {col('静けさ', q)}
      {col('ソロ適性', s)}
      {col('アクセス難易度', a, true)}
    </div>
  )
}

// 検索結果カード（design_handoff_yushuku「夜の湯宿」テーマ準拠。色は湯あかり公式パレットにマッピング）
function ResultCard({ onsen, accent, feeMode, onClick, style }: {
  onsen: OnsenSummary; accent: string; feeMode: TripType; onClick: () => void; style?: React.CSSProperties
}) {
  return (
    <div
      onClick={onClick}
      className="result-card cand-card-anim"
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(214,199,158,0.18)',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
        ...style,
      }}
    >
      {/* 写真 */}
      <div
        className={onsen.hero_image_url ? undefined : 'cand-thumb-texture'}
        style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', overflow: 'hidden' }}
      >
        {onsen.hero_image_url && (
          <img src={onsen.hero_image_url} alt={onsen.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      {/* 本文 */}
      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: '11px', flex: 1 }}>
        <div>
          <div style={{ fontSize: '11px', color: '#7e765f', letterSpacing: '0.14em' }}>
            {onsen.area}<span style={{ color: '#a99e84', marginLeft: '0.6em' }}>{onsen.region}</span>
          </div>
          <div style={{ fontFamily: "'Shippori Mincho', serif", fontWeight: 600, fontSize: '17px', color: '#dccda3', letterSpacing: '0.06em', lineHeight: 1.5, marginTop: '4px' }}>{onsen.name}</div>
        </div>
        {onsen.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {onsen.tags.map(t => (
              <span key={t} style={{ fontSize: '11px', color: '#c8bca2', padding: '2px 9px', border: '1px solid rgba(214,199,158,0.3)', letterSpacing: '0.1em' }}>{t}</span>
            ))}
          </div>
        )}
        <ScoreDotBars q={onsen.quietness_score} s={onsen.solitude_score} a={onsen.accessibility_score} accent={accent} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto', paddingTop: '2px' }}>
          <AvailabilityChips dayTrip={onsen.day_trip_available} stay={onsen.accommodation_available} accent={accent} />
          <span style={{ fontSize: '12px', color: '#c4b898', whiteSpace: 'nowrap' }}>
            {feeLabel(onsen, feeMode)}
          </span>
        </div>
      </div>
    </div>
  )
}

// アクセス情報を1行に要約（駅徒歩 > IC分数 > 交通手段テキストの順で優先）
function formatAccess(access: Top3Detail['access']): string {
  if (!access) return ''
  if (access.nearest_station_walk_minutes != null) return `最寄り駅から徒歩${access.nearest_station_walk_minutes}分`
  if (access.nearest_ic_minutes != null) return `最寄りICから車で${access.nearest_ic_minutes}分`
  return access.public_transport_route ?? ''
}

// 大型3軸スコア表示（Detailsセクション用。カード内のScoreDotBarsより一回り大きい）
function BigScoreBars({ q, s, a, accent }: { q: number; s: number; a: number; accent: string }) {
  const col = (label: string, value: number, isAccess = false) => {
    const color = isAccess && value >= 4 ? WARN_COLOR : accent
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#a99e84', letterSpacing: '0.14em' }}>{label}</span>
        <span style={{ fontFamily: "'Shippori Mincho', serif", fontSize: '26px', color: '#dccda3', fontWeight: 500, lineHeight: 1 }}>
          {value}<span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '13px', color: '#7e765f', marginLeft: '4px' }}>/5</span>
        </span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ flex: 1, height: '3px', background: i < value ? color : 'rgba(214,199,158,0.16)' }} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
      {col('静けさ', q)}
      {col('ソロ適性', s)}
      {col('アクセス難易度', a, true)}
    </div>
  )
}

// Detailsセクション見出し（見本「— 湯宿三景」相当）
function DetailsHead({ accent, isMobile }: { accent: string; isMobile: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
      padding: isMobile ? '30px 0 18px' : '52px 0 26px',
      borderTop: '1px solid rgba(214,199,158,0.14)',
      marginTop: isMobile ? '28px' : '40px',
    }}>
      <span style={{ fontFamily: "'Shippori Mincho', serif", fontSize: isMobile ? '13px' : '15px', color: accent, letterSpacing: '0.5em' }}>— 湯宿三景</span>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: '#7e765f', letterSpacing: '0.1em' }}>three onsen · scroll to compare</span>
    </div>
  )
}

// ステージ画像1枚（見本 .stage-img 相当。sticky/fixedのステージ内に重ねて配置し、is-activeでクロスフェード）
function StageImage({ onsen, index, active, accent }: { onsen: OnsenSummary; index: number; active: boolean; accent: string }) {
  const bg = onsen.hero_image_url
    ? `linear-gradient(180deg, rgba(16,19,24,0.1) 0%, rgba(16,19,24,0.75) 100%), url(${onsen.hero_image_url})`
    : 'linear-gradient(160deg, #1a1d24 0%, #232730 55%, #0e1116 100%)'
  return (
    <div
      className={`stage-img-yushuku${active ? ' is-active' : ''}`}
      style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div style={{
        position: 'absolute', top: '1.3rem', left: '1.5rem',
        fontFamily: "'Shippori Mincho', serif", fontSize: '4.4rem', color: accent,
        writingMode: 'vertical-rl', opacity: 0.62, lineHeight: 1,
        textShadow: '0 0 18px rgba(0,0,0,0.6)',
      }}>{KANJI_RANK[index]}</div>
      <div style={{ position: 'absolute', left: '1.5rem', right: '1.5rem', bottom: '1.4rem', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '12px', color: accent, letterSpacing: '0.2em' }}>{onsen.area}</span>
        <span style={{ fontFamily: "'Shippori Mincho', serif", fontSize: '20px', color: '#f4ecd6', letterSpacing: '0.06em', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>{onsen.name}</span>
      </div>
    </div>
  )
}

// TOP3の詳細ブロック1件ぶん（見本 .detail 相当）。
// 「雰囲気」はDBに項目が無いため上位承認タグで代用、「混みあい」も専用カラムが無いため
// 混雑傾向を含む静けさコメント（quietness_comment）で代用する（捏造データは使わない）。
function DetailBlock({ onsen, detail, index, accent, isMobile, bookmarked, onToggleBookmark, onGoDetail, innerRef }: {
  onsen: OnsenSummary; detail: Top3Detail | undefined; index: number; accent: string; isMobile: boolean
  bookmarked: boolean; onToggleBookmark: () => void; onGoDetail: () => void
  innerRef: (el: HTMLDivElement | null) => void
}) {
  const lead = detail?.intro_text?.trim() ?? ''
  const springType = detail?.spring_info?.spring_type
  const accessText = formatAccess(detail?.access ?? null)
  const atmosphere = onsen.tags[0]
  const crowd = detail?.quietness_comment?.trim()

  const feat = (label: string, value: string | undefined | null) => (
    <div>
      <div style={{ fontSize: '10.5px', color: '#7e765f', letterSpacing: '0.14em' }}>{label}</div>
      <div style={{ fontSize: '13.5px', color: '#dccda3', marginTop: '5px', lineHeight: 1.6 }}>{value || '—'}</div>
    </div>
  )

  const content = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '640px',
      ...(isMobile ? {
        background: 'rgba(16,19,24,0.8)', backdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid rgba(214,199,158,0.14)', padding: '26px 22px',
      } : {}),
    } as React.CSSProperties}>
      <div>
        <div style={{ fontSize: '12px', color: accent, letterSpacing: '0.2em' }}>
          {onsen.area}<span style={{ color: '#a99e84', marginLeft: '0.6em' }}>{onsen.region} — 第{KANJI_RANK[index]}席</span>
        </div>
        <h2 style={{ fontFamily: "'Shippori Mincho', serif", fontWeight: 500, fontSize: isMobile ? '24px' : '30px', lineHeight: 1.5, letterSpacing: '0.08em', color: '#dccda3', marginTop: '8px' }}>{onsen.name}</h2>
      </div>

      {lead && (
        <p style={{ color: '#c8bca2', fontSize: '15px', lineHeight: 2, letterSpacing: '0.03em', margin: 0 }}>
          <span style={{ fontFamily: "'Shippori Mincho', serif", fontSize: '24px', fontWeight: 500, color: '#dccda3', marginRight: '2px' }}>{lead.slice(0, 1)}</span>
          {lead.slice(1)}
        </p>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 26px',
        padding: '20px 0', borderTop: '1px solid rgba(214,199,158,0.14)', borderBottom: '1px solid rgba(214,199,158,0.14)',
      }}>
        {feat('雰囲気', atmosphere)}
        {feat('泉質', springType)}
        {feat('行き方', accessText)}
        {feat('混みあい', crowd)}
      </div>

      <BigScoreBars q={onsen.quietness_score} s={onsen.solitude_score} a={onsen.accessibility_score} accent={accent} />

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={onGoDetail}
          style={{
            padding: '13px 26px', border: 'none', background: accent, color: '#f6efe1',
            fontFamily: "'Shippori Mincho', serif", fontSize: '13.5px', letterSpacing: '0.2em',
            cursor: 'pointer', transition: 'filter 0.2s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.12)')}
          onMouseLeave={e => (e.currentTarget.style.filter = '')}
        >湯宿を見る →</button>
        {/* 「栞を挟む」は見本どおりのアクセントだが比較/お気に入り機能は未実装のため、
            見た目だけのローカルトグル（保存・同期はされない）にとどめている。 */}
        <button
          onClick={onToggleBookmark}
          style={{
            padding: '13px 22px', background: 'transparent',
            color: bookmarked ? accent : '#dccda3',
            border: `1px solid ${bookmarked ? accent : 'rgba(214,199,158,0.3)'}`,
            fontFamily: "'Shippori Mincho', serif", fontSize: '13.5px', letterSpacing: '0.2em',
            cursor: 'pointer', transition: 'border-color 0.2s ease, color 0.2s ease',
          }}
        >{bookmarked ? '栞を外す' : '栞を挟む'}</button>
      </div>
    </div>
  )

  return (
    <div
      ref={innerRef}
      style={{
        minHeight: isMobile ? undefined : '78vh',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '26px 0' : '56px 0',
        borderBottom: '1px solid rgba(214,199,158,0.12)',
      }}
    >
      {content}
    </div>
  )
}

// 画面右固定の「now viewing」インジケータ（見本 .section-indicator 相当。モバイルは縦書き）
function SectionIndicator({ visible, onsen, index, accent, isMobile }: {
  visible: boolean; onsen: OnsenSummary | undefined; index: number; accent: string; isMobile: boolean
}) {
  if (!onsen) return null
  return (
    <div style={{
      position: 'fixed', right: isMobile ? 0 : '1.4rem', top: '50%',
      transform: `translateY(-50%) translateX(${visible ? 0 : isMobile ? 6 : 20}px)`,
      opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
      zIndex: 90, display: 'flex', alignItems: 'stretch', gap: '1rem',
      background: 'rgba(20,23,29,0.82)', backdropFilter: 'blur(20px) saturate(140%)',
      border: '1px solid rgba(214,199,158,0.2)',
      padding: isMobile ? '0.8rem 0.55rem' : '0.9rem 1.1rem',
      minWidth: isMobile ? undefined : '248px', maxWidth: isMobile ? undefined : '288px',
      writingMode: isMobile ? 'vertical-rl' : undefined,
    } as React.CSSProperties}>
      <div style={{ width: isMobile ? 'auto' : '2px', height: isMobile ? '2px' : 'auto', background: accent, alignSelf: 'stretch' }} />
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '4px',
        writingMode: isMobile ? 'vertical-rl' : undefined,
        alignItems: isMobile ? 'center' : undefined,
      } as React.CSSProperties}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '11px', color: '#7e765f', letterSpacing: '0.2em' }}>now viewing</span>
        <span style={{ fontFamily: "'Shippori Mincho', serif", fontWeight: 500, fontSize: isMobile ? '14px' : '16px', color: '#dccda3', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{onsen.name}</span>
        <span style={{ fontSize: '12px', color: '#a99e84', letterSpacing: '0.1em' }}>{onsen.region}</span>
      </div>
      <span style={{
        alignSelf: 'center', fontFamily: "'Shippori Mincho', serif", fontWeight: 600, fontSize: '14px',
        color: accent, border: `1px solid ${accentAlpha(accent, 0.5)}`, padding: '5px 8px',
        writingMode: isMobile ? 'horizontal-tb' : undefined,
      } as React.CSSProperties}>{KANJI_RANK[index]}</span>
    </div>
  )
}

// 比較CTA（見本の「比較する」ボタンはREADMEにも明記された通り本番導線が未実装のデモ動作。
// 比較機能自体がまだ無いため、クリックで一時的にラベルが変わるだけの見本どおりの挙動にとどめる）
function CompareCta({ visible, accent, innerRef }: { visible: boolean; accent: string; innerRef: (el: HTMLDivElement | null) => void }) {
  const [clicked, setClicked] = useState(false)
  const handleClick = () => {
    if (clicked) return
    setClicked(true)
    setTimeout(() => setClicked(false), 1400)
  }
  return (
    <div
      ref={innerRef}
      style={{
        maxWidth: '1240px', margin: '0 auto', padding: '60px 20px 88px', textAlign: 'center',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div style={{ fontFamily: "'Shippori Mincho', serif", fontSize: '13px', color: accent, letterSpacing: '0.6em', marginBottom: '18px' }}>— ひとつを、選ぶ</div>
      <h3 style={{ fontFamily: "'Shippori Mincho', serif", fontWeight: 500, fontSize: 'clamp(22px, 3.2vw, 30px)', letterSpacing: '0.14em', color: '#dccda3', marginBottom: '16px', lineHeight: 1.6 }}>三つを並べて、比べる。</h3>
      <p style={{ color: '#a99e84', marginBottom: '34px', fontSize: '13.5px', lineHeight: 2, letterSpacing: '0.04em' }}>
        静けさ・ソロ適性・アクセス難易度を<br />同じ尺度で並列に。あなたの軸でひとつを。
      </p>
      <button
        onClick={handleClick}
        className="compare-btn-yushuku"
        style={{
          '--compare-accent': accent,
          display: 'inline-flex', alignItems: 'center', gap: '14px',
          padding: '15px 34px', background: 'transparent', color: accent,
          border: `1px solid ${accent}`, fontFamily: "'Shippori Mincho', serif",
          fontSize: '14px', letterSpacing: '0.4em', cursor: 'pointer',
        } as React.CSSProperties}
      >
        <span>{clicked ? '比較ページへ…' : '比 較 す る'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function TopPage() {

  const isMobile = useIsMobile()

  // ── 旅行タイプ + PC フィルター ──
  const [tripType, setTripType] = useState<TripType>('overnight')
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)
  const [displayedFilter, setDisplayedFilter] = useState<FilterKey | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  const [roomCount, setRoomCount] = useState(1)
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')

  // アクセントカラー（クロスフェード用: CSS transition で各要素が補間する）
  const accent = tripType === 'daytrip' ? ACCENT_DAYTRIP : ACCENT_OVERNIGHT

  const closeFilter = () => {
    setOpenFilter(null)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setDisplayedFilter(null), 260)
  }

  // 日帰り切替時に宿泊専用パネルを閉じる
  useEffect(() => {
    if (tripType === 'daytrip' && (openFilter === 'guests' || openFilter === 'dates')) {
      closeFilter()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripType, openFilter])

  // フィルターパネル外クリックで閉じる（PC のみ。モバイルはモーダルの背景タップで閉じる）
  const searchBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!openFilter || isMobile) return
    const handler = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        closeFilter()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFilter, isMobile])

  const toggleFilter = (key: FilterKey) => {
    if (openFilter === key) {
      closeFilter()
    } else {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      setOpenFilter(key)
      setDisplayedFilter(key)
    }
  }

  const hoverOpenFilter = (key: FilterKey) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpenFilter(key)
    setDisplayedFilter(key)
  }

  // ── State ──
  const [core, setCore] = useState('')
  const [active, setActive] = useState<string[]>([])
  const [overlayBudgetEnabled, setOverlayBudgetEnabled] = useState(false)
  const [overlayBudgetValue, setOverlayBudgetValue] = useState(15000)
  const [icMinutesEnabled, setIcMinutesEnabled] = useState(false)
  const [icMinutesValue, setIcMinutesValue] = useState<number>(IC_MINUTES_OPTIONS[2])
  const [stationWalkEnabled, setStationWalkEnabled] = useState(false)
  const [stationWalkValue, setStationWalkValue] = useState<number>(STATION_WALK_MINUTES_OPTIONS[1])
  const [detailOpen, setDetailOpen] = useState(false)

  // ── 検索 ──
  const navigate = useNavigate()
  const [labelToTagId, setLabelToTagId] = useState<Record<string, string>>({})
  const [results, setResults] = useState<OnsenSummary[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  // 結果カードの料金表示は検索時の旅行タイプに追従させる（後からトグルを変えても結果はそのまま）
  const [resultTripType, setResultTripType] = useState<TripType>('overnight')
  // 検索結果カード列（横スクロール）の再マウント用キー。新しい検索のたびに増やし、
  // スクロール位置を先頭に戻す（同じDOMノードが使い回されるとposXが前回の検索の値のまま残るため）。
  const [searchSeq, setSearchSeq] = useState(0)
  // TOP3の詳細エリア用データ（GET /onsens/{slug}を検索後にTOP3件だけ追加取得）。slug→detail。
  const [top3Details, setTop3Details] = useState<Record<string, Top3Detail>>({})
  const resultsRef = useRef<HTMLDivElement>(null)

  // ── Detailsセクション（スクロール連動のステージ切替・インジケータ・比較CTA） ──
  const candidatesRegionRef = useRef<HTMLDivElement>(null)
  const detailRefs = useRef<(HTMLDivElement | null)[]>([])
  const compareCtaRef = useRef<HTMLDivElement>(null)
  const [activeDetailIdx, setActiveDetailIdx] = useState(0)
  const [indicatorVisible, setIndicatorVisible] = useState(false)
  const [compareCtaVisible, setCompareCtaVisible] = useState(false)
  // 「栞を挟む」はローカル表示専用のトグル（保存・同期はしない）。slug→挟んでいるか。
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({})

  // スクロールに応じて、ビューポート35%地点に最も近いdetailブロックをactive判定し、
  // ステージ画像のクロスフェード・インジケータ更新・比較CTAのフェードインを行う
  // （見本index.htmlのrefreshIndicator()/refreshCompareCta()相当）。
  useEffect(() => {
    if (!results || results.length === 0) return

    const onScroll = () => {
      const candRect = candidatesRegionRef.current?.getBoundingClientRect()
      const cardsAbove = candRect ? candRect.bottom < 80 : false
      if (!cardsAbove) {
        setIndicatorVisible(false)
      } else {
        const pivot = window.innerHeight * 0.35
        let bestIdx = -1
        let bestDist = Infinity
        detailRefs.current.forEach((el, i) => {
          if (!el) return
          const r = el.getBoundingClientRect()
          if (r.top <= pivot && r.bottom > 80) {
            const dist = Math.abs(r.top - pivot)
            if (dist < bestDist) { bestDist = dist; bestIdx = i }
          }
        })
        if (bestIdx >= 0) {
          setActiveDetailIdx(bestIdx)
          setIndicatorVisible(true)
        } else {
          setIndicatorVisible(false)
        }
      }

      const ctaRect = compareCtaRef.current?.getBoundingClientRect()
      if (ctaRect && ctaRect.top < window.innerHeight - 100) setCompareCtaVisible(true)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [results])

  // タグ一覧を取得し、表示ラベル → tag_id の変換表を作る
  useEffect(() => {
    axios.get<{ tag_id: string; label: string }[]>('/api/tags')
      .then(res => {
        const map: Record<string, string> = {}
        for (const t of res.data) map[t.label] = t.tag_id
        setLabelToTagId(map)
      })
      .catch(() => { /* タグ取得失敗時は tag_id なしで検索（core経由の埋め込みに委ねる） */ })
  }, [])

  // 全施設一覧（エリアオーバーレイの施設数アイコン・県詳細モードの施設マーカー表示用）
  const [allOnsens, setAllOnsens] = useState<OnsenSummary[]>([])
  const [prefectureCounts, setPrefectureCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    axios.get<OnsenSummary[]>('/api/onsens')
      .then(res => {
        setAllOnsens(res.data)
        const counts: Record<string, number> = {}
        for (const o of res.data) counts[o.prefecture] = (counts[o.prefecture] ?? 0) + 1
        setPrefectureCounts(counts)
      })
      .catch(() => { /* 取得失敗時はアイコン・マーカーを表示しない（0件扱い） */ })
  }, [])

  const goToOnsenSlug = (slug: string) => navigate(`/onsens/${slug}`)

  const addNormal = (name: string) =>
    setActive(prev => prev.includes(name) ? prev : [...prev, name])
  const removeNormal = (name: string) =>
    setActive(prev => prev.filter(n => n !== name))
  const toggleCondition = (name: string) =>
    setActive(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])

  const hasConditions = active.length > 0 || overlayBudgetEnabled || icMinutesEnabled || stationWalkEnabled
  const canSearch =
    core.trim().length > 0 || active.length > 0 || overlayBudgetEnabled ||
    icMinutesEnabled || stationWalkEnabled || selectedAreas.length > 0

  const runSearch = () => {
    if (!canSearch || searching) return

    // 地域選択の解決：都道府県ならサーバの prefecture フィルタ、集約エリア（東北など）は
    // バックエンドの8エリア体系と粒度が異なるため、結果をクライアント側で都道府県集合で絞る。
    const sel = selectedAreas[0]
    let prefecture: string | null = null
    let clientRegionPrefs: Set<string> | null = null
    if (sel && sel !== '全国') {
      if (PREF_SET.has(sel)) prefecture = sel
      else {
        const prefs = AREA_PREFECTURES[sel]
        if (prefs) clientRegionPrefs = new Set(prefs)
      }
    }

    const tag_ids = active.map(l => labelToTagId[l]).filter(Boolean)
    const trip_type = tripType === 'daytrip' ? 'day_trip' : 'stay'

    setSearching(true)
    setSearchError('')
    setResultTripType(tripType)
    axios
      .post<{ results: OnsenSummary[] }>('/api/search', {
        core,
        tag_ids,
        budget_max: overlayBudgetEnabled ? overlayBudgetValue : null,
        prefecture,
        area: null,
        trip_type,
        ic_minutes_max: icMinutesEnabled ? icMinutesValue : null,
        station_walk_minutes_max: stationWalkEnabled ? stationWalkValue : null,
      })
      .then(res => {
        let rs = res.data.results
        if (clientRegionPrefs) rs = rs.filter(o => clientRegionPrefs!.has(o.prefecture))
        setResults(rs)
        setSearchSeq(n => n + 1)
        setTop3Details({}) // 前回検索のTOP3詳細が新しい結果に紛れ込まないよう先にクリア
        requestAnimationFrame(() =>
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        )

        // TOP3の「軽い詳細」パネル用に、上位3件だけ詳細エンドポイントを追加取得する。
        const top3 = rs.slice(0, 3)
        Promise.all(
          top3.map(o =>
            axios.get<Top3Detail>(`/api/onsens/${o.slug}`)
              .then(r => r.data)
              .catch(() => null)
          )
        ).then(list => {
          const map: Record<string, Top3Detail> = {}
          list.forEach(d => { if (d) map[d.slug] = d })
          setTop3Details(map)
        })
      })
      .catch(e => setSearchError(e?.response?.data?.detail ? String(e.response.data.detail) : '検索に失敗しました。時間をおいて再度お試しください。'))
      .finally(() => setSearching(false))
  }

  const goDetail = (onsen: OnsenSummary) => {
    const topThree = (results ?? []).slice(0, 3).map(r => ({
      slug: r.slug, name: r.name, hero_image_url: r.hero_image_url,
    }))
    navigate(`/onsens/${onsen.slug}`, { state: { topThree } })
  }

  const suggests = SCROLL_LABELS
    .filter(name => !active.includes(name))
    .map(name => ({ name, onClick: () => addNormal(name) }))
  const suggestsLoop = [...suggests, ...suggests, ...suggests]

  const rafRef = useRef<number>(0)

  const scrollCallback = useCallback((outer: HTMLDivElement | null) => {
    cancelAnimationFrame(rafRef.current)
    if (!outer) return

    const inner = outer.firstElementChild as HTMLDivElement

    let posX = inner.scrollWidth / 3
    const third = () => inner.scrollWidth / 3

    const applyPos = () => {
      inner.style.transform = `translateX(-${posX}px)`
    }
    const norm = () => {
      const t = third()
      if (t <= 0) return
      if (posX >= 2 * t) posX -= t
      else if (posX < t)  posX += t
    }

    applyPos()

    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      posX += delta
      norm()
      applyPos()
      e.preventDefault()
    }
    outer.addEventListener('wheel', onWheel, { passive: false })

    let down = false, startX = 0, startLeft = 0, moved = false
    let velocity = 0, lastX = 0, lastT = 0
    let captured = false, pid = 0

    const onPointerDown = (e: PointerEvent) => {
      down = true; moved = false; pid = e.pointerId
      startX = e.clientX; startLeft = posX
      velocity = 0; lastX = e.clientX; lastT = performance.now()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (Math.abs(dx) > 3 && !moved) {
        moved = true; outer.style.cursor = 'grabbing'
        try { outer.setPointerCapture(pid); captured = true } catch (_) {}
      }
      if (!moved) return
      const t = third()
      if (t > 0) {
        let target = startLeft - dx
        while (target >= 2 * t) { target -= t; startLeft -= t }
        while (target < t)      { target += t; startLeft += t }
        posX = target
      } else {
        posX = startLeft - dx
      }
      applyPos()
      const now = performance.now()
      const dt = (now - lastT) / 1000
      if (dt > 0) { velocity = -(e.clientX - lastX) / dt; lastX = e.clientX; lastT = now }
    }
    const endDrag = () => {
      down = false; outer.style.cursor = 'grab'
      if (captured) { try { outer.releasePointerCapture(pid) } catch (_) {} captured = false }
    }

    const onClickCapture = (e: MouseEvent) => {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false }
    }

    outer.addEventListener('pointerdown', onPointerDown)
    outer.addEventListener('pointermove', onPointerMove)
    outer.addEventListener('pointerup', endDrag)
    outer.addEventListener('pointercancel', endDrag)
    outer.addEventListener('click', onClickCapture, true)

    outer.style.cursor = 'grab'

    const SPEED = 24
    let lastNow = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000)
      lastNow = now
      if (!down) {
        if (Math.abs(velocity) > 8) {
          posX += velocity * dt
          norm()
          velocity *= Math.pow(0.0018, dt)
        } else {
          velocity = 0
          posX += SPEED * dt
          norm()
        }
        applyPos()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // 検索結果の横スクロール（TOP3 + 以降の候補を1本のカード列で表示）。
  // scrollLeft/scrollTo() の直接操作は環境によって描画が更新されないことがあるため、
  // suggestsのスクロールと同じくCSS transformで動かす（サジェストと違い無限ループはしない・端で止める）。
  const resultsRafRef = useRef<number>(0)

  const resultsScrollCallback = useCallback((outer: HTMLDivElement | null) => {
    cancelAnimationFrame(resultsRafRef.current)
    if (!outer) return

    const inner = outer.firstElementChild as HTMLDivElement

    let posX = 0
    const maxX = () => Math.max(0, inner.scrollWidth - outer.clientWidth)
    const clamp = (x: number) => Math.min(maxX(), Math.max(0, x))

    const applyPos = () => {
      inner.style.transform = `translateX(-${posX}px)`
    }
    applyPos()

    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      const next = clamp(posX + delta)
      if (next === posX) return // 端に達していれば素通し（ページの縦スクロールを妨げない）
      posX = next
      applyPos()
      e.preventDefault()
    }
    outer.addEventListener('wheel', onWheel, { passive: false })

    let down = false, startX = 0, startLeft = 0, moved = false
    let velocity = 0, lastX = 0, lastT = 0
    let captured = false, pid = 0

    const onPointerDown = (e: PointerEvent) => {
      down = true; moved = false; pid = e.pointerId
      startX = e.clientX; startLeft = posX
      velocity = 0; lastX = e.clientX; lastT = performance.now()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (Math.abs(dx) > 3 && !moved) {
        moved = true; outer.style.cursor = 'grabbing'
        try { outer.setPointerCapture(pid); captured = true } catch (_) {}
      }
      if (!moved) return
      posX = clamp(startLeft - dx)
      applyPos()
      const now = performance.now()
      const dt = (now - lastT) / 1000
      if (dt > 0) { velocity = -(e.clientX - lastX) / dt; lastX = e.clientX; lastT = now }
    }
    const startMomentum = () => {
      cancelAnimationFrame(resultsRafRef.current)
      let lastNow = performance.now()
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - lastNow) / 1000)
        lastNow = now
        if (Math.abs(velocity) > 8) {
          const before = posX
          posX = clamp(posX + velocity * dt)
          velocity *= Math.pow(0.0018, dt)
          if (posX !== before) applyPos()
          if (posX === 0 || posX === maxX()) velocity = 0
          resultsRafRef.current = requestAnimationFrame(step)
        }
      }
      resultsRafRef.current = requestAnimationFrame(step)
    }
    const endDrag = () => {
      down = false; outer.style.cursor = maxX() > 0 ? 'grab' : 'default'
      if (captured) { try { outer.releasePointerCapture(pid) } catch (_) {} captured = false }
      startMomentum()
    }

    const onClickCapture = (e: MouseEvent) => {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false }
    }

    outer.addEventListener('pointerdown', onPointerDown)
    outer.addEventListener('pointermove', onPointerMove)
    outer.addEventListener('pointerup', endDrag)
    outer.addEventListener('pointercancel', endDrag)
    outer.addEventListener('click', onClickCapture, true)

    outer.style.cursor = maxX() > 0 ? 'grab' : 'default'
  }, [])

  return (
    <div style={{
      position: 'relative', width: '100%',
      background: '#0E1014',
      fontFamily: "'Shippori Mincho', serif",
    }}>

      {/* ── ヒーロー（全画面セクション） ── */}
      <section style={{
        position: 'relative', width: '100%', height: '100vh', minHeight: '680px',
        overflow: 'hidden',
      }}>

      {/* 背景画像 + グラデーションオーバーレイ */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${heroImg})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'brightness(0.66) saturate(0.5)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: [
          'linear-gradient(to bottom, rgba(16,19,24,0.78) 0%, rgba(16,19,24,0.22) 26%, rgba(16,19,24,0.42) 62%, rgba(14,16,20,0.94) 100%)',
          'radial-gradient(58% 50% at 56% 52%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)',
        ].join(', '),
      }} />

      {/* ── ヘッダー ── */}
      <header style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        padding: isMobile ? '20px 24px' : '30px 52px',
      }}>
        <LogoBlock />
        {isMobile ? <MobileNav /> : <DesktopNav />}
      </header>

      {/* ── ヒーローコピー ── */}
      {isMobile ? <MobileHeroCopy /> : <DesktopHeroCopy />}

      {/* ── 検索ブロック ── */}
      <div style={{
        position: 'absolute', bottom: '6.5%', left: '50%',
        transform: 'translateX(-50%)', zIndex: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        width: '770px', maxWidth: '92vw',
      }}>

        {/* 日帰り / 宿泊 トグル */}
        <TripToggle value={tripType} onChange={setTripType} accent={accent} />

        {/* 統合チップバー + 展開パネル */}
        <div ref={searchBarRef} style={{ width: '100%', position: 'relative' }} onMouseLeave={isMobile ? undefined : () => closeFilter()}>

          {/* チップバー */}
          <div style={{
            display: 'flex', alignItems: 'stretch', width: '100%',
            background: 'rgba(15,17,22,0.52)',
            backdropFilter: 'blur(9px)',
            WebkitBackdropFilter: 'blur(9px)',
            border: '1px solid rgba(214,199,158,0.18)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            overflow: 'hidden',
          } as React.CSSProperties}>

            {/* 左カラム: テキスト入力 + 選択済みチップ */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

              {/* キーワード入力行 */}
              <div style={{
                display: 'flex', alignItems: 'stretch',
                paddingLeft: '16px', minHeight: '50px',
              }}>
                <input
                  type="text"
                  value={core}
                  onChange={e => setCore(e.target.value)}
                  maxLength={26}
                  placeholder="静か 近場 日帰り"
                  style={{
                    flex: 1, minWidth: 0, alignSelf: 'center',
                    background: 'transparent', border: 'none', outline: 'none',
                    color: '#e9dfc7', fontFamily: "'Shippori Mincho', serif",
                    fontSize: '16px', letterSpacing: '0.04em',
                    padding: '13px 0',
                  }}
                />
                {/* PC フィルターボタン */}
                {!isMobile && (
                  <>
                    <FilterBtn
                      label="エリア"
                      active={openFilter === 'area'}
                      hasValue={selectedAreas.length > 0}
                      accent={accent}
                      onClick={() => toggleFilter('area')}
                      onMouseEnter={() => hoverOpenFilter('area')}
                    />
                    {tripType === 'overnight' && (
                      <FilterBtn
                        label="人数"
                        active={openFilter === 'guests'}
                        hasValue={guestCount !== 2}
                        accent={accent}
                        onClick={() => toggleFilter('guests')}
                        onMouseEnter={() => hoverOpenFilter('guests')}
                      />
                    )}
                    {tripType === 'overnight' && (
                      <FilterBtn
                        label="宿泊日"
                        active={openFilter === 'dates'}
                        hasValue={!!checkIn}
                        accent={accent}
                        onClick={() => toggleFilter('dates')}
                        onMouseEnter={() => hoverOpenFilter('dates')}
                      />
                    )}
                  </>
                )}
              </div>

              {/* 選択済みチップ行 */}
              {hasConditions && (
                <>
                  <div style={{ height: '1px', background: 'rgba(214,199,158,0.14)', margin: '0 16px' }} />
                  <div
                    className="chips-scroll"
                    style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                      gap: '9px', padding: '11px 16px 13px',
                      // モバイルは3行（chip33px×3 + gap9px×2 + 上下padding24px = 141px）で頭打ちにしスクロール
                      maxHeight: isMobile ? '141px' : '56px',
                      overflowY: 'auto',
                      ...(isMobile ? {
                        overflowX: 'hidden',
                        touchAction: 'pan-y',
                      } : {}),
                    } as React.CSSProperties}
                  >
                    {overlayBudgetEnabled && (
                      <div
                        onClick={() => setOverlayBudgetEnabled(false)}
                        className="active-chip"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          whiteSpace: 'nowrap', flex: 'none',
                          padding: '6px 12px 6px 14px',
                          borderRadius: CHIP_RADIUS,
                          border: '1px solid rgba(214,199,158,0.4)',
                          background: 'rgba(214,199,158,0.18)',
                          color: '#f4ecd6', fontSize: '13px', letterSpacing: '0.08em',
                          cursor: 'pointer', transition: 'filter .2s',
                        }}
                      >
                        {overlayBudgetValue.toLocaleString()}円以内/人
                        <span style={{ fontSize: '15px', lineHeight: '1', color: '#d8caa6' }}>×</span>
                      </div>
                    )}

                    {icMinutesEnabled && (
                      <div
                        onClick={() => setIcMinutesEnabled(false)}
                        className="active-chip"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          whiteSpace: 'nowrap', flex: 'none',
                          padding: '6px 12px 6px 14px',
                          borderRadius: CHIP_RADIUS,
                          border: '1px solid rgba(214,199,158,0.4)',
                          background: 'rgba(214,199,158,0.18)',
                          color: '#f4ecd6', fontSize: '13px', letterSpacing: '0.08em',
                          cursor: 'pointer', transition: 'filter .2s',
                        }}
                      >
                        最寄IC{icMinutesValue}分以内
                        <span style={{ fontSize: '15px', lineHeight: '1', color: '#d8caa6' }}>×</span>
                      </div>
                    )}

                    {stationWalkEnabled && (
                      <div
                        onClick={() => setStationWalkEnabled(false)}
                        className="active-chip"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          whiteSpace: 'nowrap', flex: 'none',
                          padding: '6px 12px 6px 14px',
                          borderRadius: CHIP_RADIUS,
                          border: '1px solid rgba(214,199,158,0.4)',
                          background: 'rgba(214,199,158,0.18)',
                          color: '#f4ecd6', fontSize: '13px', letterSpacing: '0.08em',
                          cursor: 'pointer', transition: 'filter .2s',
                        }}
                      >
                        最寄駅徒歩{stationWalkValue}分以内
                        <span style={{ fontSize: '15px', lineHeight: '1', color: '#d8caa6' }}>×</span>
                      </div>
                    )}

                    {active.map(name => (
                      <div
                        key={name}
                        onClick={() => removeNormal(name)}
                        className="active-chip"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '8px',
                          whiteSpace: 'nowrap', flex: 'none',
                          padding: '6px 12px 6px 14px',
                          borderRadius: CHIP_RADIUS,
                          border: '1px solid rgba(214,199,158,0.4)',
                          background: 'rgba(214,199,158,0.18)',
                          color: '#f4ecd6', fontSize: '13px', letterSpacing: '0.08em',
                          cursor: 'pointer', transition: 'filter .2s',
                        }}
                      >
                        {name}
                        <span style={{ fontSize: '15px', lineHeight: '1', color: '#d8caa6' }}>×</span>
                      </div>
                    ))}

                  </div>
                </>
              )}
            </div>

            {/* 探すボタン */}
            <button
              onClick={runSearch}
              disabled={!canSearch || searching}
              className="search-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                flexShrink: 0,
                border: 'none', background: accent, color: '#f6efe1',
                fontFamily: "'Shippori Mincho', serif", fontWeight: 600,
                fontSize: '16px', letterSpacing: '0.22em',
                padding: '0 30px',
                cursor: canSearch ? 'pointer' : 'not-allowed',
                opacity: canSearch ? 1 : 0.42,
                transition: 'background-color 0.55s ease, filter .2s, opacity .25s',
              }}
            >
              <span style={{
                display: 'inline-block', width: '13px', height: '13px',
                border: '1.6px solid #f6efe1', borderRadius: '50%', position: 'relative', flexShrink: 0,
              }}>
                <span style={{
                  position: 'absolute', width: '6px', height: '1.6px',
                  background: '#f6efe1', transform: 'rotate(45deg)',
                  right: '-5px', bottom: '-1px',
                }} />
              </span>
              {searching ? '検索中…' : '探す'}
            </button>
          </div>

          {/* フィルター展開パネル（PC のみ、検索バー真上にオーバーレイ） */}
          {!isMobile && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              paddingBottom: '8px',
              opacity: openFilter ? 1 : 0,
              transform: openFilter ? 'translateY(0)' : 'translateY(6px)',
              backdropFilter: openFilter ? 'blur(12px)' : 'blur(0px)',
              WebkitBackdropFilter: openFilter ? 'blur(12px)' : 'blur(0px)',
              pointerEvents: openFilter ? 'auto' : 'none',
              transition: 'opacity 0.24s ease, transform 0.28s cubic-bezier(.34,1.1,.5,1), backdrop-filter 0.24s ease',
              zIndex: 40,
            } as React.CSSProperties}>
              <div style={{
                background: 'rgba(15,17,22,0.72)',
                border: '1px solid rgba(214,199,158,0.18)',
                padding: '20px 24px',
              }}>
                {displayedFilter === 'area' && (
                  <AreaPanel selected={selectedAreas} onChange={setSelectedAreas} accent={accent} prefectureCounts={prefectureCounts} onsens={allOnsens} onSelectOnsen={goToOnsenSlug} />
                )}
                {displayedFilter === 'guests' && (
                  <GuestsPanel count={guestCount} onChange={setGuestCount} roomCount={roomCount} onRoomChange={setRoomCount} />
                )}
                {displayedFilter === 'dates' && (
                  <DatesPanel
                    checkIn={checkIn} checkOut={checkOut}
                    onCheckIn={setCheckIn} onCheckOut={setCheckOut}
                  />
                )}
              </div>
            </div>
          )}

        </div>{/* /searchBarRef */}

        {/* モバイル: フィルター起点ボタン（エリア / 人数 / 宿泊日） */}
        {isMobile && (
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <MobileFilterPill
              label="エリア"
              hasValue={selectedAreas.length > 0}
              active={openFilter === 'area'}
              accent={accent}
              onClick={() => toggleFilter('area')}
            />
            {tripType === 'overnight' && (
              <MobileFilterPill
                label="人数"
                hasValue={guestCount !== 2 || roomCount !== 1}
                active={openFilter === 'guests'}
                accent={accent}
                onClick={() => toggleFilter('guests')}
              />
            )}
            {tripType === 'overnight' && (
              <MobileFilterPill
                label="宿泊日"
                hasValue={!!checkIn}
                active={openFilter === 'dates'}
                accent={accent}
                onClick={() => toggleFilter('dates')}
              />
            )}
          </div>
        )}

        {/* 詳細条件ボタン */}
        <button
          onClick={() => setDetailOpen(true)}
          className="detail-open-btn"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: '#9b917a',
            fontFamily: "'Shippori Mincho', serif",
            fontSize: '12px', letterSpacing: '0.22em',
          }}
        >＋ 詳細条件を選ぶ</button>

        {/* サジェストチップ 横スクロール列 */}
        <div
          ref={scrollCallback}
          className="suggest-scroll"
          style={{
            width: '100%',
            overflow: 'hidden',
            userSelect: 'none',
            maskImage: 'linear-gradient(to right, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)',
          } as React.CSSProperties}
        >
          <div style={{
            display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-start', gap: '9px',
            padding: '6px 4px',
            willChange: 'transform',
          }}>
            {suggestsLoop.map((s, i) => (
              <div
                key={i}
                onClick={s.onClick}
                className="suggest-chip"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  whiteSpace: 'nowrap', flex: 'none',
                  padding: '6px 14px', borderRadius: CHIP_RADIUS,
                  border: '1px solid rgba(214,199,158,0.2)', background: 'transparent',
                  color: '#bcad8f', fontSize: '13px', letterSpacing: '0.08em',
                  cursor: 'pointer', transition: 'border-color .2s, background .2s, color .2s',
                }}
              >
                <span style={{ fontSize: '14px', lineHeight: '1', color: '#9b917a' }}>+</span>
                {s.name}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── スクロールキュー（PC のみ） ── */}
      {!isMobile && <ScrollCue />}

      </section>{/* /ヒーロー */}

      {/* ── 検索結果エリア（ヒーロー下・ダークテーマ） ── */}
      {results !== null && (
        <section
          ref={resultsRef}
          style={{
            position: 'relative', width: '100%',
            background: '#0E1014',
            padding: isMobile ? '44px 20px 72px' : '72px 52px 104px',
          }}
        >
          <div style={{ maxWidth: '1120px', margin: '0 auto' }}>

            {/* 見出し */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: isMobile ? '28px' : '40px' }}>
              <span style={{ fontFamily: "'Yuji Mai', serif", fontSize: isMobile ? '24px' : '30px', color: '#dccda3', letterSpacing: '0.14em' }}>検索結果</span>
              <span style={{ fontSize: '13px', color: '#9b917a', letterSpacing: '0.1em' }}>
                {results.length > 0 ? `${results.length}件の秘湯が見つかりました` : ''}
              </span>
            </div>

            {searchError && (
              <p style={{ color: '#d88', fontSize: '13px', marginBottom: '20px' }}>{searchError}</p>
            )}

            {results.length === 0 ? (
              <p style={{ color: '#9b917a', fontSize: '14px', letterSpacing: '0.08em', lineHeight: 1.9 }}>
                条件に合う秘湯が見つかりませんでした。<br />
                キーワードや絞り込み条件をゆるめて、もう一度お試しください。
              </p>
            ) : (
              <div ref={candidatesRegionRef}>
                {/* TOP3 + それ以降の候補を1本のカード列に並べ、横スクロールで見る
                    （ドラッグ / トラックパッド / マウスホイールに対応。端まで来たら止まる） */}
                <div key={searchSeq} ref={resultsScrollCallback} style={{ overflow: 'hidden', width: '100%' }}>
                  <div style={{ display: 'flex', gap: isMobile ? '14px' : '22px', willChange: 'transform' }}>
                    {results.map(o => (
                      <ResultCard
                        key={o.slug}
                        onsen={o}
                        accent={accent}
                        feeMode={resultTripType}
                        onClick={() => goDetail(o)}
                        style={{ flexShrink: 0, width: isMobile ? '78vw' : 'calc((100% - 44px) / 3)' }}
                      />
                    ))}
                  </div>
                </div>
                {results.length > 3 && (
                  <p style={{ marginTop: '14px', fontSize: '11px', color: '#7e765f', letterSpacing: '0.1em' }}>
                    ドラッグ / スクロールで他の候補も見られます
                  </p>
                )}
              </div>
            )}

            {/* Detailsセクション（見本4.3節フル実装：左にsticky/fixedのステージ画像、
                右にTOP3それぞれの詳細ブロック。スクロールに応じてクロスフェード） */}
            {results.length > 0 && (
              <>
                <DetailsHead accent={accent} isMobile={isMobile} />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr',
                  gap: isMobile ? '0' : '4rem',
                  position: 'relative',
                }}>
                  {!isMobile && (
                    <div style={{
                      position: 'sticky', top: '80px', alignSelf: 'start',
                      height: 'calc(100vh - 140px)', overflow: 'hidden',
                      border: '1px solid rgba(214,199,158,0.14)', background: '#1b1e25',
                    }}>
                      {results.slice(0, 3).map((o, i) => (
                        <StageImage key={o.slug} onsen={o} index={i} active={activeDetailIdx === i} accent={accent} />
                      ))}
                    </div>
                  )}
                  {isMobile && indicatorVisible && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
                      {results.slice(0, 3).map((o, i) => (
                        <StageImage key={o.slug} onsen={o} index={i} active={activeDetailIdx === i} accent={accent} />
                      ))}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,23,29,0.55) 0%, rgba(20,23,29,0.85) 70%, rgba(20,23,29,0.96) 100%)' }} />
                    </div>
                  )}
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    {results.slice(0, 3).map((o, i) => (
                      <DetailBlock
                        key={o.slug}
                        onsen={o}
                        detail={top3Details[o.slug]}
                        index={i}
                        accent={accent}
                        isMobile={isMobile}
                        bookmarked={!!bookmarks[o.slug]}
                        onToggleBookmark={() => setBookmarks(b => ({ ...b, [o.slug]: !b[o.slug] }))}
                        onGoDetail={() => goDetail(o)}
                        innerRef={el => { detailRefs.current[i] = el }}
                      />
                    ))}
                  </div>
                </div>
                <CompareCta visible={compareCtaVisible} accent={accent} innerRef={el => { compareCtaRef.current = el }} />
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Detailsセクション用インジケータ（画面右固定、position:fixedのため結果セクションの外に置く） ── */}
      <SectionIndicator
        visible={indicatorVisible}
        onsen={results?.[activeDetailIdx]}
        index={activeDetailIdx}
        accent={accent}
        isMobile={isMobile}
      />

      {/* ── 詳細条件オーバーレイ ── */}
      <DetailOverlay
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        accent={accent}
        activeConditions={active}
        onToggleCondition={toggleCondition}
        budgetEnabled={overlayBudgetEnabled}
        setBudgetEnabled={setOverlayBudgetEnabled}
        budgetValue={overlayBudgetValue}
        setBudgetValue={setOverlayBudgetValue}
        icMinutesEnabled={icMinutesEnabled}
        setIcMinutesEnabled={setIcMinutesEnabled}
        icMinutesValue={icMinutesValue}
        setIcMinutesValue={setIcMinutesValue}
        stationWalkEnabled={stationWalkEnabled}
        setStationWalkEnabled={setStationWalkEnabled}
        stationWalkValue={stationWalkValue}
        setStationWalkValue={setStationWalkValue}
      />

      {/* ── モバイル: フィルターモーダル（エリア / 人数 / 宿泊日） ── */}
      {isMobile && (
        <MobileFilterModal
          open={!!openFilter}
          title={displayedFilter === 'area' ? 'エリア' : displayedFilter === 'guests' ? '人数・部屋数' : '宿泊日'}
          onClose={closeFilter}
          accent={accent}
        >
          {displayedFilter === 'area' && (
            <MobileAreaPanel selected={selectedAreas} onChange={setSelectedAreas} accent={accent} prefectureCounts={prefectureCounts} onsens={allOnsens} onSelectOnsen={goToOnsenSlug} />
          )}
          {displayedFilter === 'guests' && (
            <GuestsPanel count={guestCount} onChange={setGuestCount} roomCount={roomCount} onRoomChange={setRoomCount} isMobile />
          )}
          {displayedFilter === 'dates' && (
            <DatesPanel checkIn={checkIn} checkOut={checkOut} onCheckIn={setCheckIn} onCheckOut={setCheckOut} isMobile />
          )}
        </MobileFilterModal>
      )}

    </div>
  )
}
