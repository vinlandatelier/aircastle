import { Component, type ReactNode } from 'react'
import { RecoveryPage } from './recovery-page'

function applyRecoveryTheme() {
  const root = document.documentElement
  let theme: 'light' | 'dark'
  if (root.classList.contains('dark')) {
    theme = 'dark'
  } else if (root.classList.contains('light')) {
    theme = 'light'
  } else {
    let stored: string | null
    try {
      stored = localStorage.getItem('aircastle-theme')
    } catch {
      stored = null
    }
    if (stored === 'light' || stored === 'dark') {
      theme = stored
    } else {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    root.classList.add(theme)
  }
  root.style.colorScheme = theme
  document.querySelector('link[rel="icon"]')?.setAttribute('href', `/brand/favicon-${theme}.svg`)
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  private handleError = (event: ErrorEvent) => {
    if (event instanceof ErrorEvent) this.setState({ failed: true })
  }

  private handleRejection = () => {
    this.setState({ failed: true })
  }

  componentDidMount() {
    window.addEventListener('error', this.handleError)
    window.addEventListener('unhandledrejection', this.handleRejection)
    if (this.state.failed) applyRecoveryTheme()
  }

  componentDidUpdate() {
    if (this.state.failed) applyRecoveryTheme()
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleError)
    window.removeEventListener('unhandledrejection', this.handleRejection)
  }

  render() {
    return this.state.failed ? <RecoveryPage /> : this.props.children
  }
}
