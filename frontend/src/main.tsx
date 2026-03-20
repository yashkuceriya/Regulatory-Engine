import React, { useState, useMemo, createContext, useContext } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { lightTheme, darkTheme } from './theme'
import App from './App'
import './index.css'

type ThemeMode = 'light' | 'dark'

export const ThemeModeContext = createContext<{
  mode: ThemeMode
  toggle: () => void
}>({ mode: 'light', toggle: () => {} })

export const useThemeMode = () => useContext(ThemeModeContext)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
})

function Root() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode')
    return saved === 'dark' ? 'dark' : 'light'
  })

  const toggle = useMemo(() => () => {
    setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme-mode', next)
      return next
    })
  }, [])

  const theme = mode === 'dark' ? darkTheme : lightTheme

  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ThemeModeContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
