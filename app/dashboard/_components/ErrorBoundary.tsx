'use client'

import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-800">
          <p className="font-semibold mb-1">Something went wrong</p>
          <p className="font-data text-xs text-red-600 break-all">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            className="mt-3 text-xs font-medium text-red-700 underline hover:text-red-900"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
