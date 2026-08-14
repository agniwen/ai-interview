import { Component } from "react";
import type { ReactNode } from "react";
import { AppErrorFallback } from "./app-error-fallback";
import { hardReloadToHome } from "@/lib/client/hard-reload-home";

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort renderer boundary for errors outside a route error component.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    console.error("[desktop] uncaught renderer error", {
      errorMessage: error.message,
      errorName: error.name,
    });
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      return <AppErrorFallback error={this.state.error} onReload={hardReloadToHome} />;
    }
    return this.props.children;
  }
}
