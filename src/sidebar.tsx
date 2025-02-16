import React from 'react'
import ReactDOM from 'react-dom/client'
import { Sidebar } from './components/Sidebar/Sidebar'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sidebar />
  </React.StrictMode>,
)
