import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-lg border border-slate-200">
          <div className="bg-red-100 p-4 rounded-full mb-4">
            <AlertTriangle size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            Ein unerwarteter Fehler ist aufgetreten
          </h2>
          <p className="text-slate-600 max-w-md mb-6">
            Es gab ein Problem bei der Darstellung dieser Komponente. Bitte lade die Seite neu.
          </p>
          <div className="text-xs text-red-500 bg-red-50 p-2 rounded max-w-lg overflow-auto mb-6 text-left border border-red-100">
            {this.state.error?.message || 'Unbekannter Fehler'}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={18} />
            <span>Seite neu laden</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
