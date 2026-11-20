import { ConfiguredApp } from "../components/configured-app";
import { PublicBoard } from "../components/public-board";

export const dynamic = "force-dynamic";

export default function Home() {
  if (
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CONVEX_URL
  ) {
    return (
      <PublicBoard notice="Connect Clerk and Convex to load the board. See the project README for setup." />
    );
  }
  return <ConfiguredApp />;
}
