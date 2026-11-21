import type { FunctionReturnType } from "convex/server";
import type { ReactElement, ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BoardLoading } from "./board-states";
import { LoanCard } from "./loan-card";

type Loan = FunctionReturnType<typeof api.marketplace.myLoans>["page"][number];

export function RequestDetailsDialog({
  loan,
  loading,
  trigger,
  description = "Loan dates are shown in UTC.",
  open,
  onOpenChange,
}: {
  loan?: Loan | null;
  loading?: boolean;
  trigger: ReactElement;
  description?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Request details</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <BoardLoading label="Loading request details…" compact />
        ) : loan ? (
          <LoanCard loan={loan} />
        ) : (
          <p>Request details are unavailable.</p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="touch">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
