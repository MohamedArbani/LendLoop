import * as React from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { CaretLeftIcon, CaretRightIcon, DotsThreeIcon } from "@phosphor-icons/react";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"ul"> & { variant?: "default" | "toolbar" | "steps" }) {
  return (
    <ul
      data-slot="pagination-content"
      data-variant={variant}
      className={cn(
        "flex items-center gap-1",
        variant === "toolbar" &&
          "w-full flex-wrap justify-between gap-2 rounded-2xl border border-border bg-card p-2 sm:px-3",
        variant === "steps" && "rounded-xl bg-muted/60 p-1",
        className,
      )}
      {...props}
    />
  );
}

function PaginationStep({
  direction,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "asChild" | "size" | "variant"> & {
  direction: "previous" | "next";
}) {
  const previous = direction === "previous";

  return (
    <Button
      type="button"
      variant="ghost"
      size="action"
      aria-label={previous ? "Previous page" : "Next page"}
      className={cn("rounded-lg max-sm:size-9 max-sm:px-0", className)}
      {...props}
    >
      {previous && <CaretLeftIcon data-icon="inline-start" aria-hidden />}
      <span className="hidden sm:block">{previous ? "Previous" : "Next"}</span>
      {!previous && <CaretRightIcon data-icon="inline-end" aria-hidden />}
    </Button>
  );
}

function PaginationCurrent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pagination-current"
      aria-current="page"
      aria-live="polite"
      className={cn(
        "grid min-h-9 place-items-center rounded-lg border border-border bg-card px-2.5 text-sm font-semibold whitespace-nowrap text-card-foreground tabular-nums shadow-xs sm:px-3",
        className,
      )}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">;

function PaginationLink({
  className,
  isActive,
  children,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button asChild variant={isActive ? "outline" : "ghost"} size={size} className={cn(className)}>
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      >
        {children}
      </a>
    </Button>
  );
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("pl-2!", className)}
      {...props}
    >
      <CaretLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("pr-2!", className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <CaretRightIcon data-icon="inline-end" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-7 items-center justify-center [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <DotsThreeIcon />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationCurrent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationStep,
};
