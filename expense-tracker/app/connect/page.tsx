import { ConnectBankButton } from "@/components/connect-bank-button";

export default function ConnectPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Connect a bank</h1>
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        Link a checking, savings, or credit card account to start tracking
        transactions and subscriptions.
      </p>
      <ConnectBankButton />
    </main>
  );
}
