"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";

export const SiteHeader = () => {
  const router = useRouter();
  const { data: session, isPending, refetch } = useSession();

  const handleSignOut = async () => {
    const { error } = await authClient.signOut();
    if (error?.code) {
      toast.error(error.code);
    } else {
      localStorage.removeItem("bearer_token");
      refetch();
      router.push("/");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">FinPal</span>
          <span className="sr-only">FinPal</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/chat" className="text-foreground/80 hover:text-foreground">Chat</Link>
          <Link href="/dashboard" className="text-foreground/80 hover:text-foreground">Dashboard</Link>
          <Link href="/settings" className="text-foreground/80 hover:text-foreground">Settings</Link>
          {isPending ? null : session?.user ? (
            <>
              <button
                onClick={handleSignOut}
                className="rounded-md border px-3 py-1 text-xs hover:bg-accent"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-foreground/80 hover:text-foreground">Login</Link>
              <Link href="/register" className="rounded-md border px-3 py-1 text-xs hover:bg-accent">Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;