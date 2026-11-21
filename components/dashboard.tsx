"use client";

import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarBlankIcon,
  CompassIcon,
  PlusIcon,
  ShieldCheckIcon,
  ToolboxIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categories, conditions, utcDay } from "@/lib/catalog";
import type { Category, Condition } from "@/lib/catalog";
import { BoardEmpty } from "./board-states";
import { DatePickerField } from "./date-picker-field";
import { ActivitySheet } from "./activity-sheet";
import { LoanCard } from "./loan-card";
import { ToolCard } from "./tool-card";

type Tool = FunctionReturnType<typeof api.marketplace.board>[number];
type Loan = FunctionReturnType<typeof api.marketplace.myLoans>["incoming"][number];
type Modal = { type: "listing"; tool?: Tool } | { type: "request" | "remove"; tool: Tool };

const views = [
  { label: "Explore", icon: CompassIcon },
  { label: "My listings", icon: ToolboxIcon },
  { label: "My requests", icon: ArrowUpRightIcon },
  { label: "Incoming requests", icon: ArrowDownLeftIcon },
  { label: "All loans", icon: ShieldCheckIcon },
] as const;
type Tab = (typeof views)[number]["label"];

type CatalogSelectProps = React.ComponentProps<typeof Select> & {
  id: string;
  options: readonly string[];
};

function CatalogSelect({ id, options, ...props }: CatalogSelectProps) {
  return (
    <Select {...props}>
      <SelectTrigger id={id} size="touch">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function Dashboard({
  admin,
  tools,
  loans,
  inbox,
}: {
  admin: boolean;
  tools: FunctionReturnType<typeof api.marketplace.board>;
  loans: FunctionReturnType<typeof api.marketplace.myLoans>;
  inbox: FunctionReturnType<typeof api.marketplace.inbox>;
}) {
  const save = useMutation(api.marketplace.save);
  const remove = useMutation(api.marketplace.remove);
  const request = useMutation(api.marketplace.request);
  const transition = useMutation(api.marketplace.transition);
  const trust = useMutation(api.marketplace.trust);
  const [tab, setTab] = useState<Tab>("Explore");
  const [category, setCategory] = useState<Category | "All categories">("All categories");
  const [modal, setModal] = useState<Modal>();
  const [modalOpen, setModalOpen] = useState(false);
  const dialogTrigger = useRef<HTMLElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const today = modal?.type === "request" ? utcDay() : "";
  const requestDatesReady = startDay >= today && endDay >= startDay;

  const visibleTools = tools.filter((tool) =>
    tab === "My listings" ? tool.mine : category === "All categories" || tool.category === category,
  );
  const visibleLoans =
    tab === "My requests"
      ? loans.outgoing
      : tab === "Incoming requests"
        ? loans.incoming
        : loans.all;

  function open(next: Modal, trigger: HTMLElement) {
    dialogTrigger.current = trigger;
    setStartDay("");
    setEndDay("");
    setModal(next);
    setModalOpen(true);
  }

  async function execute(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await operation();
      setModalOpen(false);
      toast.success(message);
    } catch (caught) {
      toast.error(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setModalOpen(false);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    if (dialogTrigger.current?.isConnected) {
      dialogTrigger.current.focus();
    } else {
      listButton.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    if (modal?.type === "listing") {
      void execute(
        () =>
          save({
            id: modal.tool?.id,
            name: text("name"),
            category: data.get("category") as Category,
            condition: data.get("condition") as Condition,
            description: text("description"),
          }),
        modal.tool ? "Listing updated." : "Tool listed.",
      );
    } else if (modal?.type === "request") {
      if (startDay < utcDay() || endDay < startDay) {
        toast.error("Choose a valid date range.");
        return;
      }
      void execute(
        () =>
          request({
            tool: modal.tool.id,
            start: startDay,
            end: endDay,
          }),
        "Request submitted.",
      );
    }
  }

  function trustAction(lender: Id<"members">, trusted: boolean) {
    return (
      <Button
        variant="outline"
        size="action"
        disabled={busy}
        onClick={() =>
          void execute(() => trust({ lender, trusted: !trusted }), "Lender badge updated.")
        }
      >
        {trusted ? "Remove trusted badge" : "Mark trusted lender"}
      </Button>
    );
  }

  function loanActions(loan: Loan) {
    const canReview = loan.isLender && loan.status === "pending";
    const canReturn = loan.isLender && loan.status === "approved" && loan.start <= utcDay();
    const canCancel = loan.isBorrower && loan.status === "pending";
    const lender = tab === "All loans" ? loan.lender : null;
    if (!(canReview || canReturn || canCancel || lender)) return null;

    const change = (status: "approved" | "declined" | "cancelled" | "returned") =>
      void execute(() => transition({ id: loan.id, status }), "Request " + status + ".");

    return (
      <div data-layout="actions">
        {canReview && (
          <>
            <Button
              size="action"
              disabled={busy || loan.end < utcDay()}
              onClick={() => change("approved")}
            >
              Approve
            </Button>
            <Button
              size="action"
              variant="outline"
              disabled={busy}
              onClick={() => change("declined")}
            >
              Decline
            </Button>
          </>
        )}
        {canReturn && (
          <Button size="action" disabled={busy} onClick={() => change("returned")}>
            Mark returned
          </Button>
        )}
        {canCancel && (
          <Button
            size="action"
            variant="outline"
            disabled={busy}
            onClick={() => change("cancelled")}
          >
            Cancel request
          </Button>
        )}
        {lender && trustAction(lender, loan.trusted)}
      </div>
    );
  }

  const availableViews = admin ? views : views.slice(0, -1);
  const stats = [
    {
      label: "Available tools",
      icon: ToolboxIcon,
      count: tools.filter((tool) => tool.available).length,
    },
    { label: "Your listings", icon: CompassIcon, count: tools.filter((tool) => tool.mine).length },
    {
      label: "Incoming requests",
      icon: CalendarBlankIcon,
      count: loans.incoming.filter((loan) => loan.status === "pending").length,
    },
  ];

  return (
    <main data-layout="page">
      <section data-layout="workspace-heading" aria-labelledby="board-title" data-enter>
        <div data-layout="heading">
          <h1 id="board-title">Neighborhood board</h1>
          <p>Find a tool, manage a listing, or keep track of what you’ve borrowed.</p>
        </div>
        <div data-layout="actions">
          <ActivitySheet inbox={inbox} loans={loans} />
          <Button
            ref={listButton}
            size="touch"
            disabled={busy}
            onClick={(event) => open({ type: "listing" }, event.currentTarget)}
          >
            <PlusIcon data-icon="inline-start" aria-hidden /> List a tool
          </Button>
        </div>
      </section>

      <ul aria-label="Board overview" data-layout="stats-grid" data-enter>
        {stats.map(({ label, count, icon: Icon }) => (
          <li key={label}>
            <Card variant="metric">
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardAction>
                  <Badge variant="toolIcon">
                    <Icon aria-hidden />
                  </Badge>
                </CardAction>
                <CardTitle>{count}</CardTitle>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList aria-label="Tool board views" variant="line">
          {availableViews.map(({ label, icon: Icon }) => (
            <TabsTrigger key={label} value={label}>
              <Icon aria-hidden /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {availableViews.map(({ label }) => (
          <TabsContent key={label} value={label} data-layout="section" data-enter>
            {tab === label &&
              (tab === "Explore" || tab === "My listings" ? (
                <>
                  <div data-layout="section-heading">
                    <div data-layout="heading">
                      <div data-layout="section-title">
                        <h2>{tab === "Explore" ? "Tool library" : "Your listings"}</h2>
                        <Badge variant="outline">
                          {visibleTools.length} {visibleTools.length === 1 ? "listing" : "listings"}
                        </Badge>
                      </div>
                      <p>
                        {tab === "Explore"
                          ? "Browse tools shared by your neighbors."
                          : "Manage the tools you share with the neighborhood."}
                      </p>
                    </div>
                    {tab === "Explore" && (
                      <div data-layout="filter">
                        <Field orientation="horizontal">
                          <FieldLabel htmlFor="category">Category</FieldLabel>
                          <CatalogSelect
                            id="category"
                            value={category}
                            onValueChange={(value) => setCategory(value as typeof category)}
                            options={["All categories", ...categories]}
                          />
                        </Field>
                      </div>
                    )}
                  </div>

                  {visibleTools.length === 0 ? (
                    <BoardEmpty
                      title="No listings in this view"
                      description={
                        tab === "Explore"
                          ? "Try another category or add a tool to the library."
                          : "List a tool to share it with your neighbors."
                      }
                    />
                  ) : (
                    <ul data-layout="catalog-grid">
                      {visibleTools.map((tool) => (
                        <li key={tool.id}>
                          <ToolCard
                            tool={tool}
                            actions={
                              <>
                                <Button
                                  size="action"
                                  variant={tool.mine ? "outline" : "default"}
                                  disabled={busy}
                                  onClick={(event) =>
                                    open(
                                      { type: tool.mine ? "listing" : "request", tool },
                                      event.currentTarget,
                                    )
                                  }
                                >
                                  {tool.mine ? "Edit listing" : "Request dates"}
                                </Button>
                                {tool.lender && trustAction(tool.lender, tool.trusted)}
                                {(tool.mine || admin) && (
                                  <Button
                                    size="action"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={(event) =>
                                      open({ type: "remove", tool }, event.currentTarget)
                                    }
                                  >
                                    Remove
                                  </Button>
                                )}
                              </>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <div data-layout="heading">
                    <div data-layout="section-title">
                      <h2>{tab}</h2>
                      <Badge variant="outline">
                        {visibleLoans.length} {visibleLoans.length === 1 ? "request" : "requests"}
                      </Badge>
                    </div>
                    <p>
                      {tab === "My requests"
                        ? "Track the tools you’ve asked to borrow."
                        : tab === "Incoming requests"
                          ? "Review requests to borrow your tools."
                          : "Review loan history across the neighborhood."}
                    </p>
                  </div>
                  {visibleLoans.length === 0 ? (
                    <BoardEmpty
                      icon={tab === "My requests" ? ArrowUpRightIcon : ArrowDownLeftIcon}
                      title="No requests yet"
                      description={
                        tab === "My requests"
                          ? "Requests you send from the tool library will appear here."
                          : "New borrowing requests will appear here."
                      }
                    />
                  ) : (
                    <ul data-layout="request-grid">
                      {visibleLoans.map((loan) => (
                        <li key={loan.id}>
                          <LoanCard loan={loan} actions={loanActions(loan)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ))}
          </TabsContent>
        ))}
      </Tabs>

      {modal?.type === "remove" ? (
        <AlertDialog
          open={modalOpen}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={restoreFocus}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Remove listing</AlertDialogTitle>
              <AlertDialogDescription>
                Remove {modal.tool.name} from the board? Pending requests will be cancelled. Active
                loans can still be returned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="touch" disabled={busy}>
                Keep listing
              </AlertDialogCancel>
              <Button
                size="touch"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void execute(() => remove({ id: modal.tool.id }), "Listing removed.")
                }
              >
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? "Removing…" : "Remove listing"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        modal && (
          <Dialog
            open={modalOpen}
            onOpenChange={(open) => {
              if (!open) close();
            }}
          >
            <DialogContent
              showCloseButton={false}
              onCloseAutoFocus={restoreFocus}
              onInteractOutside={(event) => {
                if (busy) event.preventDefault();
              }}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {modal.type === "request"
                    ? "Request " + modal.tool.name
                    : modal.tool
                      ? "Edit listing"
                      : "List a tool"}
                </DialogTitle>
                <DialogDescription>
                  {modal.type === "request"
                    ? "The lender will review your request. Dates are inclusive and use UTC."
                    : "Describe the tool so your neighbors know what they’re borrowing."}
                </DialogDescription>
              </DialogHeader>
              <form key={modal.type} data-layout="dialog-form" onSubmit={submit}>
                <FieldGroup>
                  {modal.type === "listing" ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="listing-name">Tool name</FieldLabel>
                        <Input
                          id="listing-name"
                          name="name"
                          required
                          minLength={2}
                          maxLength={80}
                          defaultValue={modal.tool?.name}
                        />
                      </Field>
                      <div data-layout="form-row">
                        <Field>
                          <FieldLabel htmlFor="listing-category">Category</FieldLabel>
                          <CatalogSelect
                            id="listing-category"
                            name="category"
                            defaultValue={modal.tool?.category ?? categories[0]}
                            required
                            options={categories}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="listing-condition">Condition</FieldLabel>
                          <CatalogSelect
                            id="listing-condition"
                            name="condition"
                            defaultValue={modal.tool?.condition ?? conditions[0]}
                            required
                            options={conditions}
                          />
                        </Field>
                      </div>
                      <Field>
                        <FieldLabel htmlFor="listing-description">Description</FieldLabel>
                        <Textarea
                          id="listing-description"
                          name="description"
                          required
                          minLength={2}
                          maxLength={280}
                          rows={4}
                          defaultValue={modal.tool?.description}
                        />
                      </Field>
                    </>
                  ) : (
                    <div data-layout="form-row">
                      <DatePickerField
                        label="First day"
                        value={startDay}
                        min={today}
                        disabled={busy}
                        onChange={(day) => {
                          setStartDay(day);
                          if (endDay < day) setEndDay("");
                        }}
                      />
                      <DatePickerField
                        label="Return by"
                        value={endDay}
                        min={startDay >= today ? startDay : today}
                        disabled={busy}
                        onChange={setEndDay}
                      />
                    </div>
                  )}
                </FieldGroup>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={busy}
                    onClick={close}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="touch"
                    disabled={busy || (modal.type === "request" && !requestDatesReady)}
                  >
                    {busy && <Spinner data-icon="inline-start" />}
                    {busy ? "Saving…" : modal.type === "listing" ? "Save listing" : "Send request"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )
      )}
    </main>
  );
}
