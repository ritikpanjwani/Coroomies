import React from "react";
import Button from "./Button";
import { AlertIcon } from "../Icons";
import { isBrowserExtensionError } from "../../utils/extensionErrors";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isExtension: false };
  }

  static getDerivedStateFromError(error) {
    const isExtension = isBrowserExtensionError(error);
    return { hasError: true, error, isExtension };
  }

  componentDidCatch(error, errorInfo) {
    if (this.state.isExtension) {
      console.warn("ErrorBoundary caught a browser extension interference:", error, errorInfo);
    } else {
      console.error("ErrorBoundary caught an application error:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, isExtension: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl mb-3.5 ${
              this.state.isExtension
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            }`}
          >
            <AlertIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            {this.state.isExtension
              ? "Browser Extension Interference"
              : "Something went wrong loading this section"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">
            {this.state.isExtension
              ? "A third-party browser extension (such as an adblocker, password manager, or translation tool) interfered with this view. Try disabling extensions or reloading."
              : this.state.error?.message || "An unexpected error occurred while rendering this view."}
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
