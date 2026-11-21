import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BoardLoading } from "@/components/board-states";
import { MemberBoard } from "@/components/member-board";
import { Header } from "@/components/public-board";
import { api } from "@/convex/_generated/api";
import { FIRST_PAGE } from "@/lib/constants";
import { servicesConfigured } from "@/lib/services";

async function MemberContent() {
  if (!servicesConfigured()) redirect("/");
  const { userId, sessionClaims, getToken } = await auth();
  if (!userId) redirect("/");

  const token = await getToken(
    sessionClaims?.aud === "convex" ? undefined : { template: "convex" },
  );
  if (!token) throw new Error("Clerk did not provide a Convex token for the member session.");

  const options = { token };
  const [viewer, tools, stats] = await Promise.all([
    fetchQuery(api.members.viewer, {}, options),
    fetchQuery(api.marketplace.board, { ...FIRST_PAGE, own: false }, options),
    fetchQuery(api.marketplace.boardStats, {}, options),
  ]);

  return (
    <ClerkProvider dynamic afterSignOutUrl="/">
      <MemberBoard
        key={userId}
        userId={userId}
        account={<UserButton />}
        initial={{ viewer, tools, stats }}
      />
    </ClerkProvider>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <>
          <Header href="/dashboard" />
          <main data-layout="page">
            <BoardLoading label="Opening your tool board…" />
          </main>
        </>
      }
    >
      <MemberContent />
    </Suspense>
  );
}
