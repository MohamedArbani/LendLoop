import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const alertVariants = cva(
  "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 rounded-2xl border border-(--alert-border) bg-(--alert-surface) px-4 py-3.5 text-left text-sm/relaxed text-card-foreground sm:has-data-[slot=alert-action]:grid-cols-[auto_minmax(0,1fr)_auto]",
  {
    variants: {
      variant: {
        default: "[--alert-accent:var(--muted-foreground)]",
        destructive: "[--alert-accent:var(--alert-error)]",
        info: "[--alert-accent:var(--alert-info)]",
        warning: "[--alert-accent:var(--status-pending-foreground)]",
        success: "[--alert-accent:var(--status-success-foreground)]",
      },
    },
  },
);

const alertIcons = {
  default: InfoIcon,
  destructive: WarningCircleIcon,
  info: InfoIcon,
  warning: WarningIcon,
  success: CheckCircleIcon,
};

function Alert({
  className,
  variant = "default",
  children,
  ...props
}: ComponentProps<"div"> & {
  variant?: keyof typeof alertIcons;
}) {
  const Icon = alertIcons[variant];

  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={variant === "destructive" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <span
        data-slot="alert-icon"
        className="col-start-1 row-span-2 row-start-1 grid size-9 shrink-0 place-items-center rounded-lg bg-(--alert-icon-surface) text-(--alert-accent) [&>svg]:size-5"
        aria-hidden
      >
        <Icon weight="bold" />
      </span>
      {children}
    </div>
  );
}

function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 font-heading text-base/relaxed font-semibold [&_a]:underline [&_a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 self-center text-sm/relaxed text-muted-foreground wrap-anywhere [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-3",
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        "col-start-2 mt-2 justify-self-start sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:ml-2 sm:self-center",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
