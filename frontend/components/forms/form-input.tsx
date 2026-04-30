import React from 'react';
import { Input } from '@/components/common/input';
import { Label } from '@/components/common/label';
import { cn } from '@/lib/utils';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string;
    description?: string;
}

export const FormInput: React.FC<FormInputProps> = ({ 
    label, 
    error, 
    description, 
    className, 
    id,
    ...props 
}) => {
    return (
        <div className="space-y-1.5 w-full">
            <Label 
                htmlFor={id} 
                className={cn("text-sm font-semibold", error ? "text-red-500" : "text-slate-700")}
            >
                {label}
            </Label>
            <Input
                id={id}
                className={cn(
                    "focus-visible:ring-indigo-500",
                    error && "border-red-500 focus-visible:ring-red-500",
                    className
                )}
                {...props}
            />
            {description && !error && (
                <p className="text-xs text-slate-500">{description}</p>
            )}
            {error && (
                <p className="text-xs font-medium text-red-500">{error}</p>
            )}
        </div>
    );
};
