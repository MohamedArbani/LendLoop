"use client";

import { ClerkProvider, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import { Dashboard } from "./dashboard";
import { Header, PublicBoard } from "./public-board";

function Guest() {
  const tools = useQuery(api.marketplace.publicTools);
  return (
    <PublicBoard
      tools={tools}
      signIn={
        <SignInButton mode="modal">
          <button className="button heroButton">
            Sign in to lend or borrow <ArrowUpRight size={17} aria-hidden />
          </button>
        </SignInButton>
      }
    />
  );
}

function Member() {
  const viewer = useQuery(api.members.viewer);
  const register = useMutation(api.members.register);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (viewer !== null) return;
    let active = true;
    void register().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [register, viewer, attempt]);

  return (
    <>
      <Header actions={<UserButton />} />
      {viewer ? (
        <Dashboard admin={viewer.role === "admin"} />
      ) : (
        <main className="wrap">
          <p role="status">
            {error ? "We couldn’t set up your account." : "Opening your tool board…"}
          </p>
          {error && (
            <button
              className="button"
              onClick={() => {
                setError(false);
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          )}
        </main>
      )}
    </>
  );
}

export function ConfiguredApp() {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <AuthLoading>
          <PublicBoard />
        </AuthLoading>
        <Unauthenticated>
          <Guest />
        </Unauthenticated>
        <Authenticated>
          <Member />
        </Authenticated>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
