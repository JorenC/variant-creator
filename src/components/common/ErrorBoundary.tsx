import { Component, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort catch for render crashes. Without it, any uncaught error inside
 * a wizard unmounts the whole tree to a blank page, losing all session state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Something went wrong</h1>
        </div>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          The app hit an unexpected error. If this happened right after uploading a
          file, the file may contain data the app can't handle — please report it.
        </p>
        <pre className="max-w-xl overflow-auto rounded-md border bg-muted/40 px-4 py-3 text-xs">
          {this.state.error.message}
        </pre>
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    );
  }
}
