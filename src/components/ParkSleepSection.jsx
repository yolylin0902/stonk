import React, { useState, useMemo } from 'react'
import {
  MapPin,
  Navigation,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw
} from 'lucide-react'
import confetti from 'canvas-confetti'

// 台灣知名避難公園經緯度與點位資料（含座標方便換算距離）
const PARKS_DATABASE = [
  {
    id: 'daan',
    name: '台北・大安森林公園',
    city: '台北市',
    lat: 25.0300,
    lng: 121.5358,
    vibe: '👑 公園界信義區 / 外資大佬聚集地',
    spots: 'VIP露天長椅 (85%滿)、溜滑梯底部 (客滿)'
  },
  {
    id: 'taipei_228',
    name: '台北・二二八和平紀念公園',
    city: '台北市',
    lat: 25.0416,
    lng: 121.5152,
    vibe: '🏛️ 歷史悠久 / 近台北車站與證交所',
    spots: '中式涼亭 (75%滿)、噴水池外圍石椅 (空位多)'
  },
  {
    id: 'banciao',
    name: '新北・板橋萬坪都會公園',
    city: '新北市',
    lat: 25.0142,
    lng: 121.4633,
    vibe: '🚆 三鐵共構旁 / 逃難交通極便利',
    spots: '草坪木棧道 (40%滿)、溜冰場旁長凳 (60%滿)'
  },
  {
    id: 'hsinchu_lake',
    name: '新竹・竹科靜心湖',
    city: '新竹市',
    lat: 24.7797,
    lng: 121.0186,
    vibe: '💻 科技園區重災區 / 滿座工程師',
    spots: '九曲橋中段涼亭 (95%爆滿)、湖畔長椅 (50%滿)'
  },
  {
    id: 'taichung_central',
    name: '台中・中央公園',
    city: '台中市',
    lat: 24.1866,
    lng: 120.6534,
    vibe: '🌾 遼闊無邊 / 風大注意紙箱吹走',
    spots: '遊客中心遮雨棚 (60%滿)、抹茶湖平台 (大空位)'
  },
  {
    id: 'tainan_park',
    name: '台南・台南公園',
    city: '台南市',
    lat: 23.0031,
    lng: 120.2132,
    vibe: '🌴 悠閒慢活 / 蚊子稍微熱情',
    spots: '燕潭念慈亭 (80%滿)、百年老樹蔭下石桌 (空位多)'
  },
  {
    id: 'kaohsiung_weiwuying',
    name: '高雄・衛武營都會公園',
    city: '高雄市',
    lat: 22.6219,
    lng: 120.3421,
    vibe: '🎭 藝文氣息避難所 / 寬敞有風',
    spots: '音悅榕樹廣場 (35%滿)、北湖賞鳥木亭 (80%滿)'
  }
]

// Haversine formula 計算兩經緯度距離 (公尺)
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // 地球半徑 (公尺)
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

const MEME_QUOTES = [
  '「本多終勝，可惜我只有一本存摺，裡面還沒錢。」',
  '「只要我不賣，我就不算虧；但只要繳不起房租，我就得住這。」',
  '「跌停只是技術性調整，今晚睡公園也是技術性露營。」',
  '「今天晚上跟巴菲特一樣，大家都在地球表面睡覺。」',
  '「紙箱比股票保值，至少下雨它會吸水，股票只會吸血。」'
]

export default function ParkSleepSection() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // 'idle', 'locating', 'success', 'denied'
  const [randomQuote, setRandomQuote] = useState(MEME_QUOTES[0])

  // 根據 GPS 取得公園距離排序清單
  const parksWithDistance = useMemo(() => {
    if (!userLocation) {
      return PARKS_DATABASE.map((p) => ({ ...p, distance: null }))
    }
    return PARKS_DATABASE.map((park) => {
      const dist = getDistanceFromLatLonInMeters(
        userLocation.latitude,
        userLocation.longitude,
        park.lat,
        park.lng
      )
      return { ...park, distance: dist }
    }).sort((a, b) => a.distance - b.distance)
  }, [userLocation])

  const nearestPark = parksWithDistance[0]

  // 要求定位
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied')
      return
    }
    setLocationStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        })
        setLocationStatus('success')
      },
      (err) => {
        console.warn('定位失敗或未授權:', err.message)
        setLocationStatus('denied')
      },
      { timeout: 8000, enableHighAccuracy: false }
    )
  }

  // 格式化距離
  const formatDistance = (meters) => {
    if (meters === null || meters === undefined) return null
    if (meters < 1000) {
      return `${meters} 公尺`
    }
    return `${(meters / 1000).toFixed(1)} 公里`
  }

  const triggerCheer = () => {
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.8 }
    })
    const quote = MEME_QUOTES[Math.floor(Math.random() * MEME_QUOTES.length)]
    setRandomQuote(quote)
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-slate-100 transition-all">
      {/* 簡潔乾淨的標題列 */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex cursor-pointer items-center justify-between select-none"
      >
        <div className="flex items-center space-x-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-200">
              附近避難公園雷達
            </span>
            <p className="text-[11px] text-slate-400">
              {userLocation && nearestPark?.distance
                ? `最近點：${nearestPark.name.split('・')[1]} (${formatDistance(nearestPark.distance)})`
                : '查詢離你最近的公園長椅距離'}
            </p>
          </div>
        </div>

        <button className="text-slate-400 hover:text-slate-200 p-1">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 展開後的內容 */}
      {isExpanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-slate-800 animate-fade-in">
          {/* 定位按鈕與狀態列 */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">推薦避難長椅（僅供參考）</span>
            {!userLocation ? (
              <button
                onClick={requestLocation}
                disabled={locationStatus === 'locating'}
                className="flex items-center space-x-1 rounded-lg bg-blue-600/20 px-2.5 py-1 text-[11px] font-medium text-blue-400 hover:bg-blue-600/30 active:scale-95 transition-all border border-blue-500/30"
              >
                <Navigation className="h-3 w-3" />
                <span>{locationStatus === 'locating' ? '定位中...' : '取得我的位置'}</span>
              </button>
            ) : (
              <button
                onClick={requestLocation}
                className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                <RefreshCw className="h-3 w-3" />
                <span>更新位置</span>
              </button>
            )}
          </div>

          {locationStatus === 'denied' && (
            <p className="text-[11px] text-slate-400 leading-tight">
              未授權定位，已顯示熱門推薦避難點。
            </p>
          )}

          {/* 推薦公園列表 */}
          <div className="space-y-2">
            {parksWithDistance.slice(0, 3).map((park) => (
              <div
                key={park.id}
                className="rounded-xl bg-slate-800/40 border border-slate-800/80 p-2.5 text-xs transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{park.name}</span>
                  {park.distance !== null ? (
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-400 border border-blue-500/20">
                      約 {formatDistance(park.distance)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-mono">{park.city}</span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mt-1">{park.vibe}</p>
                
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/50 pt-1.5">
                  <span>長椅況：<strong className="text-slate-300 font-normal">{park.spots}</strong></span>
                </div>
              </div>
            ))}
          </div>

          {/* 韭菜金句心靈撫慰 */}
          <div
            onClick={triggerCheer}
            className="cursor-pointer rounded-xl border border-slate-800 bg-slate-800/30 p-2.5 text-[11px] text-slate-300 hover:bg-slate-800/50 transition-all flex items-start space-x-2 active:scale-[0.99]"
          >
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-amber-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-slate-300 italic">{randomQuote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
