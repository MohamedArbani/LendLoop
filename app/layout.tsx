import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "LendLoop · Neighborhood tool library",
  description: "Borrow what you need. Lend what you don’t.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
