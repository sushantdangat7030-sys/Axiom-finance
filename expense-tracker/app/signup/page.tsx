import Link from "next/link";
import { signUp } from "@/lib/auth-actions";

type SignupPageProps = {
  searchParams: { error?: string };
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h2 className="text-xl font-semibold">Sign up</h2>
      {searchParams.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400">
          {searchParams.error}
        </p>
      ) : null}
      <form action={signUp} className="flex flex-col gap-3">
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
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/20"
          />
          <span className="text-xs font-normal text-black/40 dark:text-white/40">
            At least 8 characters
          </span>
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Sign up
        </button>
      </form>
      <p className="text-sm text-black/60 dark:text-white/60">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
