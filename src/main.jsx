import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import LogCortex from './LogCortex'

function clearLogCortexSessionKeys() {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('logcortex_')) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {}
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#0F1117] text-white p-8">
          <div className="max-w-lg text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-white/50 mb-4">
              Cortex encountered an unexpected error. This is likely caused by an unusually formatted log file.
            </p>
            <pre className="text-xs font-mono text-red-400 bg-red-950/30 rounded-xl p-4 text-left mb-6 overflow-auto max-h-40">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); clearLogCortexSessionKeys() }}
              className="px-6 py-2 bg-[#00D4AA] text-black font-semibold rounded-lg hover:bg-[#00D4AA]/80 transition-colors"
            >
              Reload Cortex
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LogCortex />
    </ErrorBoundary>
  </React.StrictMode>,
)
