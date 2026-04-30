import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonLoaderProps {
    type?: 'text' | 'circle' | 'rect';
    className?: string;
    count?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
    type = 'text', 
    className, 
    count = 1 
}) => {
    const items = Array.from({ length: count });

    return (
        <>
            {items.map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "animate-pulse bg-slate-200",
                        type === 'text' && "h-4 w-full rounded",
                        type === 'circle' && "h-12 w-12 rounded-full",
                        type === 'rect' && "h-24 w-full rounded-lg",
                        className
                    )}
                />
            ))}
        </>
    );
};
