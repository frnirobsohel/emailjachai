import React from 'react';
import { Button } from '@/components/ui/button';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    description,
    actionLabel,
    onAction,
    icon = <Inbox className="h-10 w-10 text-slate-300" />
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-4 p-3 bg-slate-50 rounded-full">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">
                {description}
            </p>
            {actionLabel && onAction && (
                <Button 
                    onClick={onAction} 
                    className="mt-6 bg-[#0f172b] hover:bg-[#0f172b]/90"
                >
                    {actionLabel}
                </Button>
            )}
        </div>
    );
};
