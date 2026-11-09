import { useState } from 'react'

const STORAGE_KEY = 'dealdesk.pageTipsHidden'

function readHidden() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(hidden) {
  try {
    if (hidden) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode): the choice simply isn't remembered.
  }
}

/** Remembers whether the user hid the page tips (per browser). */
export function useGuideVisibility() {
  const [isHidden, setIsHidden] = useState(readHidden)
  return {
    isHidden,
    hide: () => {
      writeHidden(true)
      setIsHidden(true)
    },
    show: () => {
      writeHidden(false)
      setIsHidden(false)
    },
  }
}
