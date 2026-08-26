import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './calendar-layout.css'
import './history-record-actions.css'
import './timeline-summary.css'
import './ui-polish.css'
import './ingredient-model.css'
import './disposal.css'
import './inventory-history.css'

createRoot(document.getElementById('root')!).render(<App />)
