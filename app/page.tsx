import { preloadQuery } from "convex/nextjs";
import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { GuestSignIn, LivePublicCatalog } from "@/components/guest-controls";
import { PublicBoard, PublicCatalog } from "@/components/public-board";
import { api } from "@/convex/_generated/api";
import { servicesConfigured } from "@/lib/services";

async function loadPublicCatalog() {
  "use cache";
  cacheLife("seconds");
  return preloadQuery(api.marketplace.publicTools);
}

async function Catalog() {
  const initial = await loadPublicCatalog().catch((error: unknown) => {
    unstable_rethrow(error);
    return null;
  });
  return initial ? (
    <LivePublicCatalog initial={initial} />
  ) : (
    <PublicCatalog notice="The catalog is temporarily unavailable. Refresh to try again." />
  );
}

export default function Home() {
  if (!servicesConfigured()) {
    return (
      <PublicBoard
        catalog={
          <PublicCatalog notice="Connect Clerk and Convex to load the board. See the project README for setup." />
        }
      />
    );
  }
  return (
    <PublicBoard
      signIn={
        <Suspense>
          <GuestSignIn />
        </Suspense>
      }
      catalog={
        <Suspense fallback={<PublicCatalog />}>
          <Catalog />
        </Suspense>
      }
    />
  );
}
