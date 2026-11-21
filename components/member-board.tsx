"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { BoardLoading } from "./board-states";
import { Dashboard } from "./dashboard";
import { Header } from "./public-board";

type MemberSnapshot = {
  viewer: FunctionReturnType<typeof api.members.viewer>;
  tools: FunctionReturnType<typeof api.marketplace.board>;
  stats: FunctionReturnType<typeof api.marketplace.boardStats>;
};

function MemberContent({ initial }: { initial: MemberSnapshot }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const args = isAuthenticated ? {} : "skip";
  const liveViewer = useQuery(api.members.viewer, args);
  const viewer = liveViewer === undefined ? initial.viewer : liveViewer;
  const stats = useQuery(api.marketplace.boardStats, args) ?? initial.stats;
  const register = useMutation(api.members.register);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (liveViewer !== null || !isAuthenticated) return;
    let active = true;
    void register().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [register, liveViewer, isAuthenticated, attempt]);

  const connectionFailed = !isLoading && !isAuthenticated;
  if (viewer && !connectionFailed) {
    return (
      <Dashboard
        admin={viewer.role === "admin"}
        initialTools={initial.tools}
        stats={stats}
        authenticated={isAuthenticated}
      />
    );
  }

  return (
    <main data-layout="page">
      {error || connectionFailed ? (
        <Alert variant="destructive">
          <AlertTitle>
            {connectionFailed
              ? "Couldn’t connect to your tool board"
              : "We couldn’t set up your account"}
          </AlertTitle>
          <AlertDescription>
            {connectionFailed
              ? "Reload the page to reconnect."
              : "Try again to finish setting up your account."}
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="touch"
              onClick={() => {
                if (connectionFailed) {
                  window.location.reload();
                  return;
                }
                setError(false);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <BoardLoading label="Opening your tool board…" />
      )}
    </main>
  );
}

export function MemberBoard({
  userId,
  account,
  initial,
}: {
  userId: string;
  account: ReactNode;
  initial: MemberSnapshot;
}) {
  const auth = useAuth();
  const sessionChanged = auth.isLoaded && auth.userId !== userId;
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));

  useEffect(() => {
    if (sessionChanged && auth.userId) window.location.reload();
  }, [auth.userId, sessionChanged]);

  if (sessionChanged) return <Header />;

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <Header href="/dashboard" actions={account} />
      <MemberContent initial={initial} />
    </ConvexProviderWithClerk>
  );
}
