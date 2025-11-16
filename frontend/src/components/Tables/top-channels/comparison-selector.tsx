'use client';

import { useState } from 'react';

export type ComparisonType = 'pickup' | 'actual-vs-snapshot' | 'stly';

interface ComparisonSelectorProps {
  value: ComparisonType;
  onChange: (type: ComparisonType) => void;
}

export function ComparisonSelector({ value, onChange }: ComparisonSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ComparisonType)}
      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-dark shadow-sm transition-colors hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:border-gray-600"
    >
      <option value="pickup">Pickup</option>
      <option value="actual-vs-snapshot">Actual vs Snapshot</option>
      <option value="stly">STLY</option>
    </select>
  );
}

