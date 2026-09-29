import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/michroma/400.css'
import '@fontsource/share-tech-mono/400.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import './styles/theme.css'
import { App } from './App'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
