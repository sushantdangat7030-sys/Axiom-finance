import { NextResponse } from "next/server";

export function handle<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse | Response>
) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status ?? 500;
      if (status === 500) console.error(err);
      return NextResponse.json(
        { error: status === 500 ? "Internal error" : err.message },
        { status }
      );
    }
  };
}
