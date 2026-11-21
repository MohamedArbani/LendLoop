import { cn } from "cn";

function Skeleton({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "card" | "metric" }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-muted motion-safe:animate-pulse",
        variant === "card" && "h-40 rounded-xl border border-border",
        variant === "metric" && "mt-1 h-7 w-12",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
