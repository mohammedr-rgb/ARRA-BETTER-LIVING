import { useState, useEffect, useCallback } from 'react'

export function Toast({ message, type = 'success', duration = 3000, onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (message) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(() => onClose?.(), 300)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [message, duration, onClose])

  if (!message) return null

  return (
    <div className={`toast ${type} ${visible ? 'show' : ''}`}>
      <span>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>{message}</span>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState({ message: '', type: 'success' })

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
  }, [])

  const hideToast = useCallback(() => {
    setToast({ message: '', type: 'success' })
  }, [])

  return { toast, showToast, hideToast }
}
