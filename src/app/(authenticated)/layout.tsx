"use client";

import { Layout } from "@/components/layout";
import { usePathname } from "next/navigation";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const getTitle = () => {
    switch (pathname) {
      case "/menu":
        return "Home";
      case "/friends":
        return "Friends";
      case "/leaderboard":
        return "Leaderboard";
      default:
        return "Poker Game";
    }
  };

  return <Layout title={getTitle()}>{children}</Layout>;
}