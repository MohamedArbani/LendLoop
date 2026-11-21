import { ArrowDownIcon, ArrowUpRightIcon, WrenchIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Category } from "@/lib/catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BoardEmpty, BoardLoading } from "./board-states";
import { ThemeToggle } from "./theme-toggle";
import { ToolCard } from "./tool-card";

export function Header({
  actions,
  catalog = false,
  href = "/",
}: {
  actions?: ReactNode;
  catalog?: boolean;
  href?: string;
}) {
  return (
    <header data-layout="site-header">
      <div data-layout="header-inner">
        <Button asChild variant="brand">
          <Link href={href}>
            <Badge variant="brandIcon">
              <WrenchIcon weight="bold" aria-hidden />
            </Badge>
            LendLoop
          </Link>
        </Button>
        <div data-layout="actions">
          {catalog && (
            <Button asChild variant="ghost">
              <a href="#tool-board">Tool library</a>
            </Button>
          )}
          <ThemeToggle />
          {actions}
        </div>
      </div>
    </header>
  );
}

export function PublicBoard({ signIn, catalog }: { signIn?: ReactNode; catalog: ReactNode }) {
  return (
    <>
      <Header catalog />
      <main data-layout="page">
        <section aria-labelledby="welcome-title" data-layout="hero" data-enter>
          <div data-layout="hero-copy">
            <Badge variant="secondary">
              <WrenchIcon data-icon="inline-start" aria-hidden /> Neighborhood tool library
            </Badge>
            <h1 id="welcome-title">
              Good tools.
              <br /> <em>Better neighbors.</em>
            </h1>
            <p>
              Borrow the tools you need for your next project and share the ones you already have.
            </p>
            <div data-layout="actions">
              {signIn}
              <Button asChild variant={signIn ? "outline" : "default"} size="touch">
                <a href="#tool-board">
                  Browse tools
                  <ArrowDownIcon data-icon="inline-end" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
          <div data-layout="hero-image">
            <Image
              src="/workshop.webp"
              alt=""
              fill
              sizes="(min-width: 80rem) 560px, (min-width: 48rem) 44vw, 100vw"
              preload
            />
          </div>
        </section>
        {catalog}
      </main>
      <footer data-layout="site-footer">
        <div data-layout="footer-inner">
          <span>LendLoop · Neighborhood tool library</span>
          <Button asChild variant="ghost">
            <a href="#welcome-title">
              Back to top <ArrowUpRightIcon data-icon="inline-end" aria-hidden />
            </a>
          </Button>
        </div>
      </footer>
    </>
  );
}

export function PublicCatalog({
  tools,
  notice,
}: {
  tools?: { name: string; category: Category }[];
  notice?: string;
}) {
  return (
    <section id="tool-board" aria-labelledby="public-heading" data-layout="section" data-enter>
      <div data-layout="section-heading">
        <div data-layout="heading">
          <h2 id="public-heading">Available to borrow</h2>
          <p>Find a tool for your next project.</p>
        </div>
        {tools && <Badge variant="outline">{tools.length} available</Badge>}
      </div>
      <Separator />
      {notice ? (
        <Alert role={undefined}>
          <AlertTitle>The tool board is offline</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : tools === undefined ? (
        <BoardLoading label="Loading tools…" />
      ) : tools.length === 0 ? (
        <BoardEmpty
          title="The shelves are empty"
          description="Sign in to add the first tool to the library."
        />
      ) : (
        <ul data-layout="catalog-grid">
          {tools.map((tool, index) => (
            <li key={`${tool.category}-${tool.name}-${index}`}>
              <ToolCard tool={tool} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
