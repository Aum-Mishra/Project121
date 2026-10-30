import React from "react"
import ReactDOM from "react-dom/client"
import { ErrorBoundary } from "./components/ErrorBoundary"
import App from "./App"
import "./index.css"

// Every API request carries the active demo role so the backend enforces
// role-based access at the data layer. Falls back to "admin" when nothing
// has been set yet (keeps legacy behavior intact).
const origFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (url.includes("/api/")) {
    let role = "admin"
    try {
      role = localStorage.getItem("sw_role") || role
    } catch {
      /* non-browser env */
    }
    init = init || {}
    const headers = new Headers(init.headers || {})
    headers.set("X-User-Role", role)
    init.headers = headers
  }
  return origFetch(input, init)
}

// The Figma Make shell may set its own browser-tab title after load; force the
// canonical brand name so it never shows anywhere near the URL bar.
try {
  document.title = "KNOVIA AI"
} catch {
  /* non-browser env */
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
