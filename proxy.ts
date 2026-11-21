import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { servicesConfigured } from "./lib/services";

const withClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (pathname !== "/" && pathname !== "/dashboard") return;

  const { isAuthenticated } = await auth();
  if (pathname === "/" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname === "/dashboard" && !isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return servicesConfigured() ? withClerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
