import React from "react";
import Button from "./Button";
import { AlertIcon } from "../Icons";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mb-3.5">
            <AlertIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            Something went wrong loading this section
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">
            {this.state.error?.message || "An unexpected error occurred while rendering this view."}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={this.handleRetry}>
              Try Again
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
