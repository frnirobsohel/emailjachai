import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
    status: string;
    className?: string;
}

const statusMap: Record<string, { label: string, color: string }> = {
    deliverable: { label: 'Deliverable', color: 'bg-green-100 text-green-700 ring-green-600/20' },
    undeliverable: { label: 'Undeliverable', color: 'bg-red-100 text-red-700 ring-red-600/20' },
    risky: { label: 'Risky', color: 'bg-amber-100 text-amber-700 ring-amber-600/20' },
    'catch-all': { label: 'Catch-All', color: 'bg-indigo-100 text-indigo-700 ring-indigo-600/20' },
    disposable: { label: 'Disposable', color: 'bg-pink-100 text-pink-700 ring-pink-600/20' },
    pending: { label: 'Pending', color: 'bg-slate-100 text-slate-700 ring-slate-600/20' },
    preparing: { label: 'Preparing', color: 'bg-violet-100 text-violet-700 ring-violet-600/20' },
    processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700 ring-blue-600/20' },
    paused: { label: 'Paused', color: 'bg-amber-100 text-amber-800 ring-amber-600/20' },
    completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20' },
    failed: { label: 'Failed', color: 'bg-rose-100 text-rose-700 ring-rose-600/20' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
    const s = status.toLowerCase();
    const config = statusMap[s] || { label: status, color: 'bg-slate-100 text-slate-700' };

    return (
        <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            config.color,
            className
        )}>
            {config.label}
        </span>
    );
};
