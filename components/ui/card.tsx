import * as React from "react";
import { cn } from "cn";

function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  variant?: "default" | "catalog" | "metric" | "loan";
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg bg-card py-(--card-spacing) text-xs/relaxed text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
        variant === "catalog" &&
          "h-full gap-4 rounded-2xl pt-0 [--card-spacing:--spacing(5)] motion-safe:transition-[translate,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-within:shadow-md [&_[data-slot=card-content]]:grid [&_[data-slot=card-content]]:justify-items-start [&_[data-slot=card-content]]:gap-2 [&_[data-slot=card-footer]]:mt-auto [&_[data-slot=card-footer]]:flex-wrap [&_[data-slot=card-footer]]:gap-2 [&_[data-slot=card-footer]]:border-t [&_[data-slot=card-footer]]:pt-4",
        variant === "metric" &&
          "h-full rounded-xl [--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(5)] [&_[data-slot=card-title]]:text-2xl sm:[&_[data-slot=card-title]]:text-3xl [&_[data-slot=card-title]]:tabular-nums max-sm:[&_[data-slot=card-header]]:grid-cols-1 max-sm:[&_[data-slot=card-action]]:hidden max-sm:[&_[data-slot=card-description]]:text-xs",
        variant === "loan" &&
          "h-full gap-4 rounded-2xl [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)] [&_[data-slot=card-header]]:items-center [&_[data-slot=card-action]]:self-center [&_[data-slot=card-footer]]:mt-auto [&_[data-slot=card-footer]]:flex-wrap [&_[data-slot=card-footer]]:justify-between [&_[data-slot=card-footer]]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function CardMedia({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & { variant: "tool" }) {
  return (
    <div
      data-slot="card-media"
      data-variant={variant}
      className={cn("relative isolate grid min-h-27 place-items-center overflow-hidden", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  as: Title = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "h3" }) {
  return (
    <Title
      data-slot="card-title"
      className={cn("font-heading text-lg font-semibold wrap-anywhere", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm/relaxed wrap-anywhere text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-lg px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardMedia,
};
