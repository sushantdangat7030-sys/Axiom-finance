import { ThemeToggle } from "@/components/theme-toggle";

export function Nav() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <h1 className="text-lg font-semibold">Expense Tracker</h1>
        <ThemeToggle />
      </div>
    </header>
  );
}
