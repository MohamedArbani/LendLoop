import { HouseIcon, ToolboxIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { Header } from "@/components/public-board";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "Page not found · LendLoop" };

export default function NotFound() {
  return (
    <>
      <Header />
      <main data-layout="missing-page">
        <Empty variant="page" data-enter>
          <EmptyMedia variant="illustration" aria-hidden>
            <div data-layout="missing-art">
              <span data-layout="missing-number">404</span>
              <span data-layout="missing-icon">
                <ToolboxIcon weight="duotone" />
              </span>
            </div>
          </EmptyMedia>
          <div data-layout="missing-copy">
            <EmptyHeader>
              <EmptyTitle as="h1">We couldn’t find that page.</EmptyTitle>
              <EmptyDescription>
                The link may have changed. Go back or head home to keep browsing the neighborhood
                tool library.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild size="touch">
                <Link href="/">
                  <HouseIcon data-icon="inline-start" aria-hidden />
                  Back to home
                </Link>
              </Button>
              <BackButton />
            </EmptyContent>
          </div>
        </Empty>
      </main>
    </>
  );
}
