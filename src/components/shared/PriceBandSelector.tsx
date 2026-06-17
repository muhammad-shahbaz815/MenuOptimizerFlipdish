'use client';
import React from 'react';
import { useStore } from '@/hooks/useStore';

export const PriceBandSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { menu, activePriceBandId, setActivePriceBandId } = useStore();
  const bands = menu?.metadata.priceBands ?? [];
  if (bands.length < 2) return null;
  const active = activePriceBandId ?? bands[0];
  return (
    <select
      value={active}
      onChange={(e) => setActivePriceBandId(e.target.value)}
      className={`h-7 rounded-full border border-neutral-200 bg-white px-2 text-xs text-neutral-700 outline-none focus:border-flipdish ${className}`}
      title="Price band"
    >
      {bands.map((id, i) => (
        <option key={id} value={id}>Price Band {i + 1}</option>
      ))}
    </select>
  );
};
