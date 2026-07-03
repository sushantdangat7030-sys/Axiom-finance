"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Result = { inserted: number; duplicatesSkipped: number; flagged: number; rowsParsed: number };
type Item = { name: string; status: string; result?: Result; error?: string };

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // group items into lines by their y coordinate
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      (lines.get(y) ?? lines.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    for (const y of ys)
      out += lines.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ") + "\n";
  }
  return out;
}

async function imageToText(file: File, onProgress: (p: number) => void): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "eng", {
    logger: (m) => { if (m.status === "recognizing text") onProgress(m.progress); },
  });
  return data.text;
}

export default function ImportPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dayFirst, setDayFirst] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(name: string, patch: Partial<Item>) {
    setItems((xs) => xs.map((x) => (x.name === name ? { ...x, ...patch } : x)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      setItems((xs) => [...xs.filter((x) => x.name !== file.name), { name: file.name, status: "processing…" }]);
      try {
        let res: Response;
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".csv") || lower.match(/\.xlsx?$/)) {
          const form = new FormData();
          form.set("file", file);
          form.set("dayFirst", String(dayFirst));
          res = await fetch("/api/import", { method: "POST", body: form });
        } else if (lower.endsWith(".pdf")) {
          update(file.name, { status: "extracting text…" });
          const text = await pdfToText(file);
          res = await fetch("/api/import", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "pdf_text", text, fileName: file.name, dayFirst }),
          });
        } else if (file.type.startsWith("image/")) {
          update(file.name, { status: "reading receipt (OCR)… 0%" });
          const text = await imageToText(file, (p) =>
            update(file.name, { status: `reading receipt (OCR)… ${Math.round(p * 100)}%` }));
          res = await fetch("/api/import", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "receipt_text", text, fileName: file.name, dayFirst }),
          });
        } else {
          update(file.name, { status: "unsupported type", error: "Use CSV, XLSX, PDF, or an image" });
          continue;
        }
        const d = await res.json();
        if (!res.ok) update(file.name, { status: "failed", error: d.error });
        else update(file.name, { status: "done", result: d });
      } catch (e) {
        update(file.name, { status: "failed", error: (e as Error).message });
      }
    }
    // refresh subscriptions in the background after new data lands
    fetch("/api/subscriptions", { method: "POST" }).catch(() => {});
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Import</h1>
      <Card
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}>
        <CardHeader>
          <CardTitle className="text-base">Drop files anywhere in this box</CardTitle>
          <CardDescription>
            Bank CSV / Excel exports · PDF statements · receipt photos (OCR runs on your device —
            files are parsed into transactions, categorized and de-duplicated automatically).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input ref={inputRef} type="file" multiple hidden
            accept=".csv,.xls,.xlsx,.pdf,image/*"
            onChange={(e) => handleFiles(e.target.files)} />
          <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={dayFirst} onChange={(e) => setDayFirst(e.target.checked)} />
            Dates are day-first (DD/MM/YYYY — common outside the US)
          </label>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Results</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {items.map((it) => (
              <div key={it.name} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{it.name}</span>
                  <span className="text-muted-foreground">{it.status}</span>
                </div>
                {it.result && (
                  <div className="text-xs text-muted-foreground">
                    {it.result.inserted} added · {it.result.duplicatesSkipped} duplicates skipped
                    {it.result.flagged ? ` · ${it.result.flagged} flagged for review` : ""}
                    {" · "}{it.result.rowsParsed} rows parsed
                  </div>
                )}
                {it.error && <div className="text-xs text-red-600">{it.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
