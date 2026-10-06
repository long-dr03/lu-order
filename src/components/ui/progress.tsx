import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  indicatorClassName?: string;
  showBlocks?: boolean;
}

export function Progress({
  value,
  className,
  indicatorClassName,
  showBlocks = false,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max(value, 0), 100);

  // Convert to 8-block representation (like ████░░░░ in wireframe)
  const totalBlocks = 8;
  const filledBlocks = Math.round((percentage / 100) * totalBlocks);
  const blockString = "█".repeat(filledBlocks) + "░".repeat(totalBlocks - filledBlocks);

  return (
    <div className="flex flex-col gap-1 w-full" {...props}>
      <div
        className={cn(
          "relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100",
          className
        )}
      >
        <div
          className={cn(
            "h-full transition-all duration-300 rounded-full bg-zinc-700",
            indicatorClassName
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showBlocks && (
        <span className="font-sans text-[10px] tracking-tight text-zinc-500">
          {blockString} ({percentage}%)
        </span>
      )}
    </div>
  );
}
