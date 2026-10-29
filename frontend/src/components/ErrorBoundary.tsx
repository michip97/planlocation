import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 text-slate-700 p-8">
          <h2 className="text-xl font-bold mb-4">Ein Fehler ist aufgetreten</h2>
          <div className="bg-white border border-red-200 text-red-600 p-4 rounded shadow-sm w-full max-w-2xl overflow-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {this.state.error?.toString()}
            </pre>
          </div>
          <button
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
