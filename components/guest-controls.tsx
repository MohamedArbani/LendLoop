"use client";

import { ClerkProvider, SignInButton } from "@clerk/nextjs";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { ConvexProvider, ConvexReactClient, usePreloadedQuery } from "convex/react";
import type { Preloaded } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { api } from "@/convex/_generated/api";
import { PublicCatalog } from "./public-board";

export function GuestSignIn() {
  return (
    <ClerkProvider>
      <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
        <Button size="touch">
          Sign in <ArrowUpRightIcon data-icon="inline-end" aria-hidden />
        </Button>
      </SignInButton>
    </ClerkProvider>
  );
}

type CatalogSnapshot = Preloaded<typeof api.marketplace.publicTools>;

function CatalogSubscription({ initial }: { initial: CatalogSnapshot }) {
  return <PublicCatalog tools={usePreloadedQuery(initial)} />;
}

export function LivePublicCatalog({ initial }: { initial: CatalogSnapshot }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return (
    <ConvexProvider client={client}>
      <CatalogSubscription initial={initial} />
    </ConvexProvider>
  );
}
