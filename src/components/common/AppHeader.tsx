import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AppHeaderStep {
  key: string;
  label: string;
}

interface AppHeaderProps {
  steps?: AppHeaderStep[];
  currentStep?: string;
  filename?: string | null;
  onClear?: () => void;
  actions?: React.ReactNode;
}

export function AppHeader({ steps, currentStep, filename, onClear, actions }: AppHeaderProps) {
  const navigate = useNavigate();

  const currentIdx = steps && currentStep
    ? steps.findIndex(s => s.key === currentStep)
    : -1;

  const hasFile = Boolean(filename);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-6">

        {/* Logo + title — always links home */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-70"
        >
          <img src="/diplicity-icon.png" alt="Diplicity" className="h-7 w-7 rounded" />
          <span className="font-semibold tracking-tight">Variant Creator</span>
        </button>

        {/* Stepper — centered, shown when steps are provided */}
        {steps && currentIdx >= 0 && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center">
              {steps.map((s, i) => {
                const isActive = i === currentIdx;
                const isCompleted = i < currentIdx;
                return (
                  <div key={s.key} className="flex items-center">
                    {i > 0 && (
                      <div
                        className={cn(
                          "h-px w-5 transition-colors",
                          isCompleted ? "bg-primary/50" : "bg-border"
                        )}
                      />
                    )}
                    <div
                      title={s.label}
                      className={cn(
                        "rounded-full transition-all duration-200",
                        isActive
                          ? "h-2.5 w-2.5 bg-primary ring-2 ring-primary/25 ring-offset-1"
                          : isCompleted
                          ? "h-2 w-2 bg-primary/50"
                          : "h-2 w-2 bg-muted-foreground/25"
                      )}
                    />
                  </div>
                );
              })}
            </div>
            <span className="ml-4 text-sm font-medium">
              {steps[currentIdx].label}
            </span>
          </div>
        )}

        {/* Right — filename + Clear, or custom actions */}
        <div className={cn("flex shrink-0 items-center gap-3", !steps && "ml-auto")}>
          {hasFile && (
            <span className="max-w-[200px] truncate text-sm text-muted-foreground">
              {filename}
            </span>
          )}
          {hasFile && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
          {actions}
        </div>

      </div>
    </header>
  );
}
