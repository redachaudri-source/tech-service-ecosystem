import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error: error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo: errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-red-100 max-w-md w-full">
                        <h2 className="text-xl font-bold text-red-600 mb-2">¡Ups! Algo salió mal.</h2>
                        <p className="text-slate-600 mb-4">La aplicación ha tenido un problema inesperado.</p>

                        <div className="bg-slate-100 p-3 rounded-lg text-xs font-mono text-slate-700 overflow-auto max-h-48 mb-4">
                            <strong>{this.state.error && this.state.error.toString()}</strong>
                            {/* <br />
               {this.state.errorInfo && this.state.errorInfo.componentStack} */}
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
                        >
                            Recargar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
