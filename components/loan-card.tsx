import {
  ArrowRightIcon,
  BellIcon,
  BellSlashIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  ClockIcon,
  ProhibitIcon,
  ToolboxIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { api } from "@/convex/_generated/api";

type Loan = FunctionReturnType<typeof api.marketplace.myLoans>["incoming"][number];

const statuses = {
  pending: { label: "Pending", variant: "pending", icon: ClockIcon },
  approved: { label: "Approved", variant: "success", icon: CheckCircleIcon },
  returned: { label: "Returned", variant: "outline", icon: CheckCircleIcon },
  cancelled: { label: "Cancelled", variant: "secondary", icon: ProhibitIcon },
  declined: { label: "Declined", variant: "destructive", icon: XCircleIcon },
} as const;

const delivery = {
  failed: { label: "Notification delivery failed", icon: BellSlashIcon },
  logged: { label: "Notification logged", icon: BellIcon },
  queued: { label: "Notification queued", icon: ClockIcon },
};

const formatDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function LoanCard({ loan, actions }: { loan: Loan; actions?: ReactNode }) {
  const { label, variant, icon: StatusIcon } = statuses[loan.status];
  const { label: deliveryLabel, icon: DeliveryIcon } = delivery[loan.delivery];

  return (
    <Card variant="loan">
      <CardHeader>
        <div data-layout="loan-title">
          <Badge variant="toolIcon">
            <ToolboxIcon aria-hidden />
          </Badge>
          <CardTitle as="h3">{loan.name}</CardTitle>
        </div>
        <CardAction>
          <Badge variant={variant}>
            <StatusIcon data-icon="inline-start" aria-hidden /> {label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl data-layout="loan-dates" aria-label="Loan dates in UTC">
          <div>
            <dt>
              <CalendarBlankIcon aria-hidden /> First day
            </dt>
            <dd>
              <time dateTime={loan.start}>{formatDay.format(Date.parse(loan.start))}</time>
            </dd>
          </div>
          <ArrowRightIcon aria-hidden />
          <div>
            <dt>Return by</dt>
            <dd>
              <time dateTime={loan.end}>{formatDay.format(Date.parse(loan.end))}</time>
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <div data-layout="loan-meta">
          <span>
            <DeliveryIcon aria-hidden /> {deliveryLabel}
          </span>
          {loan.lastReminderDay && (
            <span>
              Last reminder{" "}
              <time dateTime={loan.lastReminderDay}>
                {formatDay.format(Date.parse(loan.lastReminderDay))}
              </time>
            </span>
          )}
        </div>
        {actions}
      </CardFooter>
    </Card>
  );
}
