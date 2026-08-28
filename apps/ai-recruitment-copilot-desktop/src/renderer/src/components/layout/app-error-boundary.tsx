import { Component } from "react";
import type { ReactNode } from "react";
import { AppErrorFallback } from "./app-error-fallback";
import { hardReloadToHome } from "@/lib/client/hard-reload-home";
import { captureDesktopRendererException } from "@/lib/sentry";

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort renderer boundary for errors outside a route error component.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  // oxlint-disable-next-line class-methods-use-this -- React requires this lifecycle hook to be an instance method.
  componentDidCatch(error: Error): void {
    captureDesktopRendererException(error, "desktop.renderer-boundary");
    console.error("[desktop] uncaught renderer error", {
      errorMessage: error.message,
      errorName: error.name,
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return <AppErrorFallback error={this.state.error} onReload={hardReloadToHome} />;
    }
    return this.props.children;
  }
}
