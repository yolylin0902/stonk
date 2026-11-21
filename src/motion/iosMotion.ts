/**
 * iOS SwiftUI / Liquid Glass Physics Motion Specification
 * 集中管理全站彈簧參數與互動預設
 */

export const IOS_SPRING = {
  // 適用於 Segmented Control、按鈕變形、點擊反饋等迅速俐落的互動
  snappy: {
    type: 'spring' as const,
    stiffness: 480,
    damping: 36,
    mass: 0.9,
  },
  // 適用於卡片流動補位 (FLIP)、分頁滑動、列表進退場等平滑優雅的位移
  smooth: {
    type: 'spring' as const,
    stiffness: 320,
    damping: 32,
    mass: 1,
  },
  // 適用於彈出選單 (Context Menu)、浮層進場、Modal 展開
  menu: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 30,
    mass: 0.85,
  },
} as const

// 觸控按壓微縮反饋 (模擬 iOS Taptic Engine 觸覺)
export const TACTILE_TAP = {
  scale: 0.96,
  transition: { duration: 0.1 },
}

export const CARD_TAP = {
  scale: 0.985,
  transition: { duration: 0.12 },
}

// 列表交錯進場動畫 variants
export const LIST_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
}

export const LIST_ITEM_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: IOS_SPRING.smooth,
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    transition: {
      duration: 0.2,
      ease: [0.32, 0.72, 0, 1],
    },
  },
}
