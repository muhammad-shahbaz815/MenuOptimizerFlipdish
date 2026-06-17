'use client';
import React, { useState } from 'react';
import { AlertCircle, Upload } from 'lucide-react';
import { parseMenuFile } from '@/lib/utils/parseMenuFile';
import type { NormalizedMenu, RawMenuV3 } from '@/types';

interface Props {
  label: string;
  helper?: string;
  onLoaded: (menu: NormalizedMenu, rawV3?: RawMenuV3) => void;
}

export const SlotUpload: React.FC<Props> = ({ label, helper, onLoaded }) => {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = async (file: File) => {
    setError(null);
    setBusy(true);
    const result = await parseMenuFile(file);
    setBusy(false);
    if (result.kind === 'error') {
      setError(result.message);
      return;
    }
    onLoaded(result.menu, result.rawV3);
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-neutral-50 p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handle(file);
        }}
        className={`relative flex w-full max-w-sm cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? 'border-flipdish bg-flipdish-muted'
            : 'border-neutral-300 bg-white hover:border-flipdish/40'
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-flipdish-muted text-flipdish">
          <Upload size={22} strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">{label}</p>
          {helper ? <p className="mt-1 text-xs text-neutral-500">{helper}</p> : null}
          <p className="mt-1 text-[11px] text-neutral-400">JSON or TXT</p>
        </div>
        {busy ? <p className="text-xs text-neutral-500">Parsing…</p> : null}
        <input
          type="file"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handle(file);
            e.target.value = '';
          }}
          accept=".json,.txt"
        />
      </div>
      {error ? (
        <div className="mt-4 flex max-w-sm items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
};
