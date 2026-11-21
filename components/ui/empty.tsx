import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

function Empty({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "board" | "page" }) {
  return (
    <div
      data-slot="empty"
      data-variant={variant}
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance",
        variant === "board" && "min-h-45 border border-border bg-muted/40",
        variant === "page" && [
          "grid gap-0 overflow-hidden rounded-3xl border border-solid border-border bg-card p-0 text-start shadow-sm md:grid-cols-2 md:items-stretch",
          "[&_[data-slot=empty-header]]:max-w-none [&_[data-slot=empty-header]]:items-start [&_[data-slot=empty-header]]:gap-3",
          "[&_[data-slot=empty-title]]:max-w-[13ch] [&_[data-slot=empty-title]]:text-3xl [&_[data-slot=empty-title]]:leading-none sm:[&_[data-slot=empty-title]]:text-4xl md:[&_[data-slot=empty-title]]:text-5xl",
          "[&_[data-slot=empty-description]]:max-w-[36ch] [&_[data-slot=empty-description]]:text-base/relaxed",
          "[&_[data-slot=empty-content]]:max-w-none [&_[data-slot=empty-content]]:flex-row [&_[data-slot=empty-content]]:flex-wrap [&_[data-slot=empty-content]]:justify-start",
        ],
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-1", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        illustration:
          "relative isolate mb-0 min-h-52 items-stretch overflow-hidden md:order-last md:min-h-100",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function EmptyTitle({
  className,
  as: Title = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "h1" }) {
  return (
    <Title
      data-slot="empty-title"
      className={cn("font-heading text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-2 text-xs/relaxed text-balance",
        className,
      )}
      {...props}
    />
  );
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia };
