import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToolboxIcon } from "@phosphor-icons/react/dist/ssr";

export function BoardEmpty({
  title,
  description,
  icon: Icon = ToolboxIcon,
}: {
  title: string;
  description: string;
  icon?: typeof ToolboxIcon;
}) {
  return (
    <Empty variant="board">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function BoardLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  if (compact) {
    return (
      <output data-layout="loading-inline">
        <Spinner aria-hidden /> {label}
      </output>
    );
  }

  return (
    <div>
      <output data-layout="visually-hidden">{label}</output>
      <div aria-hidden data-layout="catalog-grid">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    </div>
  );
}
