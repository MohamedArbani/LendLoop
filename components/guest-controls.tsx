"use client";

import { ClerkProvider, SignInButton } from "@clerk/nextjs";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { ListPagination, useListPage } from "./list-pagination";
import { PublicCatalog } from "./public-board";

export function GuestSignIn() {
  return (
    <ClerkProvider>
      <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
        <Button size="touch">
          Sign in to lend or borrow <ArrowUpRightIcon data-icon="inline-end" aria-hidden />
        </Button>
      </SignInButton>
    </ClerkProvider>
  );
}

type CatalogSnapshot = FunctionReturnType<typeof api.marketplace.publicTools>;

function CatalogSubscription({ initial }: { initial: CatalogSnapshot }) {
  const navigation = useListPage("public-catalog");
  const { cursor, pageSize } = navigation;
  const page =
    useQuery(api.marketplace.publicTools, { cursor, pageSize }) ??
    (cursor === null && pageSize === DEFAULT_PAGE_SIZE ? initial : undefined);
  return (
    <PublicCatalog
      tools={page?.page}
      pagination={
        <ListPagination label="Tool library pagination" navigation={navigation} result={page} />
      }
    />
  );
}

export function LivePublicCatalog({ initial }: { initial: CatalogSnapshot }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return (
    <ConvexProvider client={client}>
      <CatalogSubscription initial={initial} />
    </ConvexProvider>
  );
}
