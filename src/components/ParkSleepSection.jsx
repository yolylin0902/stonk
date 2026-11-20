import React, { useState, useMemo } from 'react'
import {
  MapPin,
  Navigation,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info
} from 'lucide-react'

// 全台 28 處代表性知名避難公園經緯度與點位資料（涵蓋北、中、南、東各縣市）
const PARKS_DATABASE = [
  // 台北市
  {
    id: 'daan',
    name: '台北・大安森林公園',
    city: '台北市大安區',
    lat: 25.0300,
    lng: 121.5358,
    vibe: '👑 公園界信義區 / 外資大佬避難所',
    spots: 'VIP露天長椅 (85%滿)、溜滑梯底部 (客滿)'
  },
  {
    id: 'taipei_228',
    name: '台北・二二八和平紀念公園',
    city: '台北市中正區',
    lat: 25.0416,
    lng: 121.5152,
    vibe: '🏛️ 歷史悠久 / 近台北車站與證交所',
    spots: '中式涼亭 (75%滿)、噴水池外圍石椅 (空位多)'
  },
  {
    id: 'shilin_residence',
    name: '台北・士林官邸花園公園',
    city: '台北市士林區',
    lat: 25.0939,
    lng: 121.5303,
    vibe: '🌹 綠樹成蔭鳥語花香 / 散心靜修首選',
    spots: '園藝木椅 (40%滿)、歐式溫室遮蔭處 (空位多)'
  },
  {
    id: 'dahu_park',
    name: '台北・內湖大湖公園',
    city: '台北市內湖區',
    lat: 25.0833,
    lng: 121.6027,
    vibe: '🌉 錦帶橋湖景絕佳 / 科技新貴深呼吸',
    spots: '水榭歌台 (60%滿)、湖畔釣魚石階 (空位多)'
  },
  {
    id: 'xiangshan_park',
    name: '台北・信義象山公園(中強公園)',
    city: '台北市信義區',
    lat: 25.0308,
    lng: 121.5701,
    vibe: '🐸 樹蛙保育基地 / 抬頭仰望台北101',
    spots: '捷運出口步道椅 (80%滿)、樹蔭草坪 (空位多)'
  },
  // 新北市
  {
    id: 'banciao',
    name: '新北・板橋萬坪都會公園',
    city: '新北市板橋區',
    lat: 25.0142,
    lng: 121.4633,
    vibe: '🚆 三鐵共構旁 / 避難交通極便利',
    spots: '草坪木棧道 (40%滿)、溜冰場旁長凳 (60%滿)'
  },
  {
    id: 'zhonghe_4th',
    name: '新北・中和四號公園(八二三公園)',
    city: '新北市中和區',
    lat: 25.0006,
    lng: 121.5113,
    vibe: '📚 國立圖書館旁 / 充滿書香避難氣息',
    spots: '圖書館挑高迴廊 (90%滿)、溜冰場看台 (50%滿)'
  },
  {
    id: 'xinzhuang_sports',
    name: '新北・新莊運動公園',
    city: '新北市新莊區',
    lat: 25.0401,
    lng: 121.4485,
    vibe: '🏟️ 綠地寬廣設施齊全 / 陽光充足',
    spots: '景觀湖木棧平台 (55%滿)、林蔭大道石凳 (空位多)'
  },
  {
    id: 'sanchong_metro',
    name: '新北・三重新北大都會公園',
    city: '新北市三重區',
    lat: 25.0543,
    lng: 121.4801,
    vibe: '🎡 佔地超廣闊 / 熊猴森溜滑梯庇護',
    spots: '堤防觀景階梯 (30%滿)、辰光橋挑高遮雨處 (70%滿)'
  },
  {
    id: 'xindian_bitan',
    name: '新北・新店碧潭風景區',
    city: '新北市新店區',
    lat: 24.9546,
    lng: 121.5367,
    vibe: '🚣 湖光山色吊橋旁 / 適合沉思投資哲學',
    spots: '東岸水岸木椅 (65%滿)、吊橋下涼亭 (空位多)'
  },
  // 桃園市
  {
    id: 'taoyuan_art',
    name: '桃園・藝文特區藝文廣場',
    city: '桃園市桃園區',
    lat: 25.0175,
    lng: 121.3005,
    vibe: '🏛️ 桃園總圖旁 / 現代感十足的草皮廣場',
    spots: '總圖挑高穿堂 (70%滿)、廣場木棧椅 (空位多)'
  },
  {
    id: 'zhongli_park',
    name: '桃園・中壢中正公園',
    city: '桃園市中壢區',
    lat: 24.9611,
    lng: 121.2269,
    vibe: '🌳 中壢市中心綠洲 / 鄰近商圈生活便利',
    spots: '巨型花鐘旁長椅 (80%滿)、桐花舞台 (空位充足)'
  },
  // 新竹縣市
  {
    id: 'hsinchu_lake',
    name: '新竹・竹科靜心湖',
    city: '新竹市東區',
    lat: 24.7797,
    lng: 121.0186,
    vibe: '💻 科技園區重災區 / 滿座工程師同溫層',
    spots: '九曲橋中段涼亭 (95%爆滿)、湖畔長椅 (50%滿)'
  },
  {
    id: 'hsinchu_moat',
    name: '新竹・護城河親水公園',
    city: '新竹市東區',
    lat: 24.8041,
    lng: 120.9712,
    vibe: '🌿 市區清流綠帶 / 沿河漫步聽流水療癒',
    spots: '親水階梯石台 (60%滿)、圓形廣場木椅 (空位多)'
  },
  // 台中市
  {
    id: 'taichung_central',
    name: '台中・中央公園',
    city: '台中市西屯區',
    lat: 24.1866,
    lng: 120.6534,
    vibe: '🌾 遼闊無邊 / 風大注意紙箱吹走',
    spots: '遊客中心挑高遮雨棚 (60%滿)、抹茶湖平台 (大空位)'
  },
  {
    id: 'taichung_maple',
    name: '台中・西屯秋紅谷景觀生態公園',
    city: '台中市西屯區',
    lat: 24.1673,
    lng: 120.6394,
    vibe: '🍂 下凹式綠洲豪宅景觀 / 避風效果一級棒',
    spots: '湖畔步道長椅 (70%滿)、紅樹林小徑石階 (空位多)'
  },
  {
    id: 'taichung_park',
    name: '台中・台中公園(日月湖)',
    city: '台中市北區',
    lat: 24.1444,
    lng: 120.6836,
    vibe: '🏰 百年湖心亭地標 / 鴿子成群作伴',
    spots: '望月亭古意長椅 (75%滿)、日月湖畔石欄 (空位多)'
  },
  // 彰化/嘉義
  {
    id: 'changhua_bagua',
    name: '彰化・八卦山大佛風景區',
    city: '彰化縣彰化市',
    lat: 24.0805,
    lng: 120.5487,
    vibe: '🙏 大佛佛光普照 / 俯瞰彰化市區平靜心靈',
    spots: '九龍池景觀平台 (50%滿)、大佛寺迴廊 (空位多)'
  },
  {
    id: 'chiayi_park',
    name: '嘉義・嘉義公園',
    city: '嘉義市東區',
    lat: 23.4831,
    lng: 120.4682,
    vibe: '⛩️ 射日塔與百年林木 / 清幽愜意',
    spots: '福康安紀功碑涼亭 (40%滿)、小橋流水木凳 (空位多)'
  },
  // 台南市
  {
    id: 'tainan_park',
    name: '台南・台南公園',
    city: '台南市北區',
    lat: 23.0031,
    lng: 120.2132,
    vibe: '🌴 百年熱帶老樹林 / 悠閒慢活氣息',
    spots: '燕潭念慈亭 (80%滿)、菩提老樹下石桌 (空位多)'
  },
  {
    id: 'tainan_ncku',
    name: '台南・成大成功湖榕園',
    city: '台南市東區',
    lat: 22.9997,
    lng: 120.2185,
    vibe: '🌳 百年大榕樹冠覆蓋 / 學院風幽靜綠地',
    spots: '大榕樹下大草坪 (45%滿)、湖畔白石欄杆 (空位多)'
  },
  // 高雄市
  {
    id: 'kaohsiung_weiwuying',
    name: '高雄・衛武營都會公園',
    city: '高雄市鳳山區',
    lat: 22.6219,
    lng: 120.3421,
    vibe: '🎭 國際級藝文建築 / 寬敞安靜通風良',
    spots: '音悅榕樹廣場 (35%滿)、北湖賞鳥木亭 (80%滿)'
  },
  {
    id: 'kaohsiung_love_river',
    name: '高雄・愛河之心公園',
    city: '高雄市三民區',
    lat: 22.6567,
    lng: 120.3061,
    vibe: '🌉 夜景璀璨蜿蜒步道 / 晚風徐徐舒適',
    spots: '如意橋景觀台 (65%滿)、湖心情人島長椅 (空位多)'
  },
  {
    id: 'kaohsiung_fine_art',
    name: '高雄・美術館內惟埤生態公園',
    city: '高雄市鼓山區',
    lat: 22.6575,
    lng: 120.2882,
    vibe: '🖼️ 藝術雕塑與環湖綠廊 / 高級住宅區旁',
    spots: '環湖雕塑木棧道 (50%滿)、圓形迷宮草坪 (空位多)'
  },
  // 屏東縣
  {
    id: 'pingtung_millennium',
    name: '屏東・屏東千禧公園',
    city: '屏東縣屏東市',
    lat: 22.6806,
    lng: 120.4952,
    vibe: '🌴 萬年溪畔綠意盎然 / 森林圖書館就在身邊',
    spots: '總圖木棧休閒區 (75%滿)、陽光草坪長椅 (空位充足)'
  },
  // 宜蘭/花蓮/台東
  {
    id: 'yilan_luodong',
    name: '宜蘭・羅東運動公園',
    city: '宜蘭縣羅東鎮',
    lat: 24.6869,
    lng: 121.7511,
    vibe: '🌲 望天丘綠意山水 / 東台灣最大開闊綠地',
    spots: '望天丘草坡 (30%滿)、落羽松林木棧道 (空位多)'
  },
  {
    id: 'hualien_pacific',
    name: '花蓮・太平洋公園(南濱段)',
    city: '花蓮縣花蓮市',
    lat: 23.9702,
    lng: 121.6163,
    vibe: '🌊 浩瀚太平洋海景 / 聽浪潮聲釋懷一切',
    spots: '海景第一排觀海石椅 (50%滿)、椰林休閒亭 (空位充足)'
  },
  {
    id: 'taitung_forest',
    name: '台東・台東森林公園(黑森林)',
    city: '台東市',
    lat: 22.7661,
    lng: 121.1611,
    vibe: '🌲 琵琶湖天然湧泉 / 遠離塵囂洗滌心靈',
    spots: '琵琶湖木造涼亭 (40%滿)、活水湖畔林蔭道 (空位極多)'
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

export default function ParkSleepSection() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAllNearby, setShowAllNearby] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('idle') // 'idle', 'locating', 'success', 'denied'

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

  const visibleParks = showAllNearby ? parksWithDistance.slice(0, 8) : parksWithDistance.slice(0, 3)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-slate-100 transition-all">
      {/* 標題列 */}
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
                : '以 GPS 探測離你最近的避難長椅'}
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
            <span className="text-[11px] text-slate-400">
              {userLocation ? '已依即時距離排序 (全台 28 處指標避難點)' : '全台指標避難公園 (點擊定位可自動算距離)'}
            </span>
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
                <span>重新定位</span>
              </button>
            )}
          </div>

          {locationStatus === 'denied' && (
            <p className="text-[11px] text-amber-400/90 leading-tight">
              ⚠️ 未取得手機 GPS 定位權限，目前顯示預設代表性指標公園。
            </p>
          )}

          {/* 推薦公園列表 */}
          <div className="space-y-2">
            {visibleParks.map((park) => (
              <div
                key={park.id}
                className="rounded-xl bg-slate-800/40 border border-slate-800/80 p-2.5 text-xs transition-all hover:border-slate-700"
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

          {/* 展開更多按鈕 */}
          <div className="text-center pt-1">
            <button
              onClick={() => setShowAllNearby(!showAllNearby)}
              className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors"
            >
              {showAllNearby ? '收合公園列表' : '查看更多附近避難公園 (全台共 28 處)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
