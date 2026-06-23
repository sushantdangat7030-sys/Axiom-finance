import Link from "next/link";
import { logIn } from "@/lib/auth-actions";

type LoginPageProps = {
  searchParams: { error?: string };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h2 className="text-xl font-semibold">Log in</h2>
      {searchParams.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400">
          {searchParams.error}
        </p>
      ) : null}
      <form action={logIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-black/60 dark:text-white/60">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-black/60 dark:text-white/60">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Log in
        </button>
      </form>
      <p className="text-sm text-black/60 dark:text-white/60">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
