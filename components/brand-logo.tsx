import { WrenchIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function BrandLogo({ href = "/" }: { href?: string }) {
  return (
    <Button asChild variant="brand">
      <Link href={href}>
        <Badge variant="brandIcon">
          <WrenchIcon weight="bold" aria-hidden />
        </Badge>
        LendLoop
      </Link>
    </Button>
  );
}
