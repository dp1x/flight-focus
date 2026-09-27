import { useRef, useState } from "react";
import {
  exportFocusData,
  importFocusData,
  type ImportResult,
} from "../focus/api";

export default function DataControls({
  onImported,
}: {
  onImported: (result: ImportResult) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const bundle = await exportFocusData();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `flight-focus-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Export downloaded.");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const result = await importFocusData(text, true);
      onImported(result);
      setStatus(
        `Imported ${result.sessionsAdded} sessions and ${result.achievementsAdded} achievements.`,
      );
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <section className="dataControls" aria-label="Data backup">
      <div className="dataControlsHeader">
        <h2>Your data</h2>
        <p>Export or import sessions, journey, and achievements. Everything stays local.</p>
      </div>
      <div className="btnRow">
        <button
          type="button"
          className="btn ghost"
          onClick={handleExport}
          disabled={busy}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      {status && <p className="dataStatus">{status}</p>}
    </section>
  );
}
