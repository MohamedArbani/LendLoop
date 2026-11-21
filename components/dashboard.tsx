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
import { useMutation, useQueries, useQuery } from "convex/react";
import type { RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo, useRef, useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { categories, conditions, overlapsBooking, utcDay } from "@/lib/catalog";
import type { Category, Condition } from "@/lib/catalog";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { BoardEmpty, BoardLoading } from "./board-states";
import { DatePickerField } from "./date-picker-field";
import { ActivitySheet } from "./activity-sheet";
import { ListPagination, useListPage } from "./list-pagination";
import { LoanCard } from "./loan-card";
import { ToolCard } from "./tool-card";

type Tool = FunctionReturnType<typeof api.marketplace.board>["page"][number];
type Loan = FunctionReturnType<typeof api.marketplace.myLoans>["page"][number];
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
  initialTools,
  stats: overview,
  authenticated,
}: {
  admin: boolean;
  initialTools: FunctionReturnType<typeof api.marketplace.board>;
  stats: FunctionReturnType<typeof api.marketplace.boardStats>;
  authenticated: boolean;
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
  const inFlight = useRef(false);
  const requestKey = useRef<{ tool: Id<"tools">; start: string; end: string; key: string }>(null);
  const [requestError, setRequestError] = useState("");
  const [approving, setApproving] = useState<Id<"loans">>();
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const requestTool = modalOpen && modal?.type === "request" ? modal.tool.id : null;
  const scheduleQuery = useMemo((): RequestForQueries => {
    if (!requestTool) return {};
    return {
      availability: { query: api.marketplace.bookingAvailability, args: { tool: requestTool } },
    };
  }, [requestTool]);
  const { availability } = useQueries(scheduleQuery) as {
    availability:
      | FunctionReturnType<typeof api.marketplace.bookingAvailability>
      | Error
      | undefined;
  };
  const schedule = availability instanceof Error ? null : availability;
  const today = schedule?.today ?? "";
  const blocked = (start: string, end = start) =>
    schedule ? overlapsBooking(schedule.ranges, start, end) : true;
  const startBlocked = Boolean(startDay && blocked(startDay));
  const rangeBlocked = startBlocked || Boolean(startDay && endDay && blocked(startDay, endDay));
  const requestDatesReady = Boolean(
    schedule && startDay && endDay && startDay >= today && endDay >= startDay && !rangeBlocked,
  );

  const navigation = useListPage(tab === "Explore" ? tab + ":" + category : tab);
  const { pageSize, cursor } = navigation;
  const showingTools = tab === "Explore" || tab === "My listings";
  const filteredCategory =
    tab === "Explore" && category !== "All categories" ? category : undefined;
  const tools =
    useQuery(
      api.marketplace.board,
      authenticated && showingTools
        ? { pageSize, cursor, own: tab === "My listings", category: filteredCategory }
        : "skip",
    ) ??
    (tab === "Explore" && !filteredCategory && cursor === null && pageSize === DEFAULT_PAGE_SIZE
      ? initialTools
      : undefined);
  const loans = useQuery(
    api.marketplace.myLoans,
    authenticated && !showingTools
      ? {
          pageSize,
          cursor,
          view:
            tab === "My requests" ? "outgoing" : tab === "Incoming requests" ? "incoming" : "all",
        }
      : "skip",
  );
  const visibleTools = tools?.page;
  const visibleLoans = loans?.page;

  function open(next: Modal, trigger: HTMLElement) {
    dialogTrigger.current = trigger;
    setRequestError("");
    setStartDay("");
    setEndDay("");
    setModal(next);
    setModalOpen(true);
  }

  async function execute(
    operation: () => Promise<unknown>,
    message: string,
    reportError: (error: string) => void = toast.error,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await operation();
      setModalOpen(false);
      toast.success(message);
    } catch (caught) {
      reportError(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Something went wrong. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      setApproving(undefined);
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
      if (!requestDatesReady || inFlight.current) return;
      const previous = requestKey.current;
      const tool = modal.tool.id;
      const key =
        previous?.tool === tool && previous.start === startDay && previous.end === endDay
          ? previous.key
          : crypto.randomUUID();
      requestKey.current = { tool, start: startDay, end: endDay, key };
      setRequestError("");
      void execute(
        async () => {
          await request({ tool, start: startDay, end: endDay, idempotencyKey: key });
          requestKey.current = null;
        },
        "Request submitted.",
        setRequestError,
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

    function change(status: "approved" | "declined" | "cancelled" | "returned") {
      if (inFlight.current) return;
      if (status === "approved") setApproving(loan.id);
      void execute(() => transition({ id: loan.id, status }), "Request " + status + ".");
    }

    return (
      <div data-layout="actions">
        {canReview && (
          <>
            <Button
              size="action"
              disabled={busy || loan.end < utcDay()}
              onClick={() => change("approved")}
            >
              {approving === loan.id ? "Approving…" : "Approve"}
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
      label: "Available now",
      icon: ToolboxIcon,
      count: overview?.available ?? "—",
    },
    { label: "Your listings", icon: CompassIcon, count: overview?.listings ?? "—" },
    {
      label: "Incoming requests",
      icon: CalendarBlankIcon,
      count: overview?.incoming ?? "—",
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
          <ActivitySheet authenticated={authenticated} />
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
                        {visibleTools && (
                          <Badge variant="outline">{visibleTools.length} on this page</Badge>
                        )}
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

                  {!visibleTools ? (
                    <BoardLoading label="Loading tools…" />
                  ) : visibleTools.length === 0 ? (
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
                                  {tool.mine
                                    ? "Edit listing"
                                    : tool.available
                                      ? "Request dates"
                                      : "Request future dates"}
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
                      {visibleLoans && (
                        <Badge variant="outline">{visibleLoans.length} on this page</Badge>
                      )}
                    </div>
                    <p>
                      {tab === "My requests"
                        ? "Track the tools you’ve asked to borrow."
                        : tab === "Incoming requests"
                          ? "Review requests to borrow your tools."
                          : "Review loan history across the neighborhood."}
                    </p>
                  </div>
                  {!visibleLoans ? (
                    <BoardLoading label="Loading requests…" />
                  ) : visibleLoans.length === 0 ? (
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
            {tab === label && (
              <ListPagination
                label={tab + " pagination"}
                navigation={navigation}
                result={showingTools ? tools : loans}
              />
            )}
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
                  ) : availability === undefined ? (
                    <BoardLoading label="Checking availability…" compact />
                  ) : !schedule ? (
                    <Alert variant={availability instanceof Error ? "destructive" : "warning"}>
                      <AlertDescription>
                        {availability instanceof Error
                          ? "Couldn’t check availability. Close the request and try again."
                          : "This tool is no longer available to request."}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      {schedule.overdue && (
                        <Alert variant="warning">
                          <AlertDescription>
                            The return date is uncertain. Future requests can be approved after the
                            tool is returned.
                          </AlertDescription>
                        </Alert>
                      )}
                      <div data-layout="form-row">
                        <DatePickerField
                          label="First day"
                          value={startDay}
                          min={today}
                          today={today}
                          disabled={busy}
                          isBlocked={(day) => blocked(day)}
                          onChange={(day) => {
                            setRequestError("");
                            setStartDay(day);
                            if (endDay < day || blocked(day, endDay)) setEndDay("");
                          }}
                        />
                        <DatePickerField
                          label="Return by"
                          value={endDay}
                          min={startDay >= today ? startDay : today}
                          today={today}
                          disabled={busy || !startDay || startBlocked}
                          isBlocked={(day) => blocked(startDay, day)}
                          onChange={(day) => {
                            setRequestError("");
                            setEndDay(day);
                          }}
                        />
                      </div>
                      {(requestError || rangeBlocked || (startDay && startDay < today)) && (
                        <Alert variant="destructive">
                          <AlertDescription>
                            {requestError ||
                              (rangeBlocked
                                ? "These dates are no longer available. Choose a different range."
                                : "Choose a first day starting today or later.")}
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
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
                    {modal.type === "listing"
                      ? busy
                        ? "Saving…"
                        : "Save listing"
                      : busy
                        ? "Sending…"
                        : "Send request"}
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
