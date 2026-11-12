import { Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

function ErrorFallback({ error, reset }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This page hit an unexpected error. The rest of the app is still available.
        </p>
        {error && (
          <p className="mt-3 rounded-md bg-slate-100 dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400 break-words">
            {error.message}
          </p>
        )}
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Try again
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Back to Admin
          </button>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Route error boundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
