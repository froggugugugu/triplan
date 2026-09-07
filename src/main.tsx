import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { getDataAdapter } from '@/infrastructure/adapters'
import { useAuthStore } from '@/stores'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

// composition root: DataAdapterの初期化はここで1回だけ行う（ARCH §3.1）。
// infrastructure/adaptersはstoresに依存しない設計のため、postgresモードで必要な
// アクセストークン取得・401時再認証（useAuthStore）はここでDIとして渡す。
// localモードでは`postgresConfig`は使われない（getDataAdapter内部で分岐）
if ((import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres') {
  getDataAdapter({
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      await useAuthStore.getState().restoreSession()
      return useAuthStore.getState().status === 'authenticated'
    },
  })
}

// biome-ignore lint/style/noNonNullAssertion: root要素は必ず存在する
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
