import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUserId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logOut } from "@/lib/auth-actions";

export async function Nav() {
  const userId = await getCurrentUserId();
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    : null;

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <h1 className="text-lg font-semibold">Expense Tracker</h1>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-black/60 dark:text-white/60">{user.email}</span>
              <form action={logOut}>
                <button type="submit" className="text-sm underline">
                  Log out
                </button>
              </form>
            </>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
