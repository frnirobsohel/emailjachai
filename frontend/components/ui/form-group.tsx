import React from 'react';
import { cn } from '@/lib/utils';

interface FormGroupProps {
    title?: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export const FormGroup: React.FC<FormGroupProps> = ({ 
    title, 
    description, 
    children, 
    className 
}) => {
    return (
        <div className={cn("space-y-4 py-4 first:pt-0 last:pb-0", className)}>
            {(title || description) && (
                <div className="space-y-1">
                    {title && <h4 className="text-sm font-bold text-slate-900">{title}</h4>}
                    {description && <p className="text-xs text-slate-500">{description}</p>}
                </div>
            )}
            <div className="grid gap-4">
                {children}
            </div>
        </div>
    );
};
