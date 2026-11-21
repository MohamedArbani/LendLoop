import {
  ArrowDownLeftIcon,
  ArrowUUpLeftIcon,
  BellIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ProhibitIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { api } from "@/convex/_generated/api";
import { utcDay } from "@/lib/catalog";
import { BoardEmpty } from "./board-states";
import { RequestDetailsDialog } from "./request-details-dialog";

type Notification = FunctionReturnType<typeof api.marketplace.inbox>[number];
type MemberLoans = Pick<
  FunctionReturnType<typeof api.marketplace.myLoans>,
  "incoming" | "outgoing"
>;

const events = {
  requested: { label: "New borrow request", icon: ArrowDownLeftIcon, tone: "pending" },
  approved: { label: "Request approved", icon: CheckCircleIcon, tone: "success" },
  declined: { label: "Request declined", icon: XCircleIcon, tone: "destructive" },
  returned: { label: "Return recorded", icon: ArrowUUpLeftIcon, tone: "success" },
  cancelled: { label: "Request cancelled", icon: ProhibitIcon, tone: "secondary" },
  overdue: { label: "Return reminder", icon: ClockIcon, tone: "pending" },
} as const;

const dateHeading = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const eventTime = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });
const eventDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function ActivitySheet({ inbox, loans }: { inbox: Notification[]; loans: MemberLoans }) {
  const [selectedEntry, setSelectedEntry] = useState<Notification["id"] | null>(null);
  const requests = new Map([...loans.incoming, ...loans.outgoing].map((loan) => [loan.id, loan]));
  const days = new Map<string, Notification[]>();
  for (const item of inbox) {
    const day = utcDay(item.at);
    const entries = days.get(day);
    if (entries) entries.push(item);
    else days.set(day, [item]);
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setSelectedEntry(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="touch">
          <BellIcon data-icon="inline-start" aria-hidden /> Activity
        </Button>
      </SheetTrigger>
      <SheetContent
        variant="activity"
        onEscapeKeyDown={(event) => {
          if (selectedEntry === null) return;
          event.preventDefault();
          setSelectedEntry(null);
        }}
      >
        <SheetHeader>
          <Badge variant="toolIcon">
            <BellIcon aria-hidden />
          </Badge>
          <SheetTitle>Activity</SheetTitle>
          <SheetDescription>Updates on your listings and loans. Times are in UTC.</SheetDescription>
        </SheetHeader>
        <div data-layout="activity-body">
          {inbox.length === 0 ? (
            <BoardEmpty
              icon={BellIcon}
              title="You’re all caught up"
              description="New requests and loan updates will appear here."
            />
          ) : (
            Array.from(days, ([day, entries]) => (
              <section key={day} data-layout="activity-day">
                <h3>
                  <time dateTime={day}>{dateHeading.format(Date.parse(day))}</time>
                </h3>
                <ItemGroup>
                  {entries.map((entry) => {
                    const { label, icon: Icon, tone } = events[entry.kind];
                    return (
                      <Item key={entry.id} asChild variant="outline" size="sm">
                        <li>
                          <ItemMedia>
                            <Badge variant={tone} size="event">
                              <Icon aria-hidden />
                            </Badge>
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{entry.tool}</ItemTitle>
                            <ItemDescription>
                              {label} ·{" "}
                              <time dateTime={new Date(entry.at).toISOString()}>
                                {eventTime.format(entry.at)}
                              </time>
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <RequestDetailsDialog
                              loan={requests.get(entry.loanId)}
                              open={selectedEntry === entry.id}
                              onOpenChange={(open) => setSelectedEntry(open ? entry.id : null)}
                              description={
                                <>
                                  {label} ·{" "}
                                  <time dateTime={new Date(entry.at).toISOString()}>
                                    {eventDateTime.format(entry.at)} UTC
                                  </time>
                                </>
                              }
                              trigger={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  data-activity-trigger
                                  aria-label={`View request details for ${entry.tool}, ${label.toLowerCase()}`}
                                >
                                  <CaretRightIcon aria-hidden />
                                </Button>
                              }
                            />
                          </ItemActions>
                        </li>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
