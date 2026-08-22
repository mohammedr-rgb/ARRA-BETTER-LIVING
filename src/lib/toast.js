// Toast dispatch wiring shared between the imperative toast() helper
// (used anywhere) and the ToastProvider component (rendered in the tree).
// Keeping this in a non-component module avoids the react/only-export-components
// fast-refresh warning in ui.jsx.

let _toastDispatch = null

export function toast(message, type = 'info', duration = 2800) {
  if (_toastDispatch) _toastDispatch({ message, type, duration })
  else if (typeof console !== 'undefined') console.log(`[toast:${type}] ${message}`)
}

export function setToastDispatch(fn) {
  _toastDispatch = fn
}

export function clearToastDispatch() {
  _toastDispatch = null
}
