'use client';

import { useState } from 'react';

type ViewType = 'monthly' | 'daily';

interface ViewToggleProps {
  value: ViewType;
  onChange: (view: ViewType) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => onChange('monthly')}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          value === 'monthly'
            ? 'bg-white text-dark shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-600 hover:text-dark dark:text-gray-400 dark:hover:text-white'
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange('daily')}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          value === 'daily'
            ? 'bg-white text-dark shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-600 hover:text-dark dark:text-gray-400 dark:hover:text-white'
        }`}
      >
        Daily
      </button>
    </div>
  );
}

