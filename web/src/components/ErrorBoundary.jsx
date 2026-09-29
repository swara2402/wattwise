import { Component } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

/**
 * Last line of defence: a render crash shows a recovery card instead of
 * a white screen, and the user can retry without a full page reload.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('WattWise render error:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="card card-pad max-w-lg text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
            <AlertOctagon className="size-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <h1 className="text-lg font-bold">This view hit an unexpected error</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            The rest of the dashboard still works. Reloading the view usually fixes it — your saved data is
            untouched.
          </p>
          <pre className="scrollbar-slim mt-3 max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-[0.72rem] text-fg-subtle">
            {error.message}
          </pre>
          <button type="button" className="btn btn-primary mt-4" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-4" strokeWidth={2.2} aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    )
  }
}
