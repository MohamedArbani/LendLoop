import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BoardLoading } from "@/components/board-states";
import { MemberBoard } from "@/components/member-board";
import { Header } from "@/components/public-board";
import { api } from "@/convex/_generated/api";
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
  const [viewer, tools, loans, inbox] = await Promise.all([
    fetchQuery(api.members.viewer, {}, options),
    fetchQuery(api.marketplace.board, {}, options),
    fetchQuery(api.marketplace.myLoans, {}, options),
    fetchQuery(api.marketplace.inbox, {}, options),
  ]);

  return (
    <ClerkProvider dynamic afterSignOutUrl="/">
      <MemberBoard
        key={userId}
        userId={userId}
        account={<UserButton />}
        initial={{ viewer, tools, loans, inbox }}
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
