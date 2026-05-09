const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || apiBaseUrl.replace(/^http/, 'ws')

export const config = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
  wsBaseUrl: wsBaseUrl.replace(/\/$/, ''),
}
