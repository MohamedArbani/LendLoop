"use client";

import { Header } from "@/components/public-board";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <>
      <Header href="/dashboard" />
      <main data-layout="page">
        <Alert variant="destructive">
          <AlertTitle>Couldn’t open your tool board</AlertTitle>
          <AlertDescription>
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    </>
  );
}
