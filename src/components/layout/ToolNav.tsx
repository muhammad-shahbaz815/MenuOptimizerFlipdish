'use client';
import React from 'react';

interface ToolNavProps {
  currentTool: 'optimizer' | 'reviewer';
}

export const ToolNav: React.FC<ToolNavProps> = ({ currentTool }) => {
  return (
    <nav className="border-b border-neutral-200 bg-neutral-50/50">
      <div className="mx-auto max-w-7xl px-3 py-2 sm:px-6 lg:px-8">
        <div className="flex justify-center gap-2.5 rounded-full border border-neutral-200 bg-white p-2 shadow-sm">
          <a
            href="/"
            className={`flex-1 max-w-[160px] rounded-full px-6 py-2.5 text-center text-sm font-semibold transition-all ${
              currentTool === 'optimizer'
                ? 'bg-gradient-to-r from-[#0B75D7] to-[#095BAA] text-white shadow-md shadow-[#0B75D7]/25'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Optimizer
          </a>
          <a
            href="/reviewer/"
            className={`flex-1 max-w-[160px] rounded-full px-6 py-2.5 text-center text-sm font-semibold transition-all ${
              currentTool === 'reviewer'
                ? 'bg-gradient-to-r from-[#0B75D7] to-[#095BAA] text-white shadow-md shadow-[#0B75D7]/25'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            Preview Menu
          </a>
        </div>
      </div>
    </nav>
  );
};
