import {
  CampfireIcon,
  CheckCircleIcon,
  CookingPotIcon,
  HammerIcon,
  LeafIcon,
  PlugsIcon,
  ShieldCheckIcon,
  ToolboxIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardMedia,
  CardTitle,
} from "@/components/ui/card";
import type { Category, Condition } from "@/lib/catalog";

const categoryIcons = {
  "Power tools": PlugsIcon,
  Garden: LeafIcon,
  Kitchen: CookingPotIcon,
  Camping: CampfireIcon,
  "Hand tools": HammerIcon,
  Other: ToolboxIcon,
};

export function ToolCard({
  tool,
  actions,
}: {
  tool: {
    name: string;
    category: Category;
    condition?: Condition;
    description?: string;
    available?: boolean;
    trusted?: boolean;
  };
  actions?: ReactNode;
}) {
  const Icon = categoryIcons[tool.category];

  return (
    <Card variant="catalog">
      <CardMedia variant="tool" data-category={tool.category}>
        <Icon weight="duotone" aria-hidden />
        {tool.available !== undefined && (
          <Badge variant={tool.available ? "success" : "secondary"}>
            {tool.available && <CheckCircleIcon data-icon="inline-start" aria-hidden />}
            {tool.available ? "Available" : "On loan"}
          </Badge>
        )}
      </CardMedia>
      <CardContent>
        <div data-layout="tool-meta">
          <Badge variant="outline">{tool.category}</Badge>
          {tool.condition && <span>{tool.condition}</span>}
        </div>
        <CardTitle as="h3">{tool.name}</CardTitle>
        {tool.description && <CardDescription>{tool.description}</CardDescription>}
        {tool.trusted && (
          <Badge variant="success">
            <ShieldCheckIcon data-icon="inline-start" aria-hidden /> Trusted lender
          </Badge>
        )}
      </CardContent>
      {actions && <CardFooter>{actions}</CardFooter>}
    </Card>
  );
}
