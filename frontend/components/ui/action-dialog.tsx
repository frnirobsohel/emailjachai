import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ActionDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
    variant?: 'danger' | 'info' | 'warning';
}

export const ActionDialog: React.FC<ActionDialogProps> = ({
    isOpen,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
    isLoading,
    variant = 'info'
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-lg",
                        variant === 'danger' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
                    )}>
                        <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-base">{title}</h3>
                        <p className="text-xs text-slate-500">{variant.toUpperCase()}</p>
                    </div>
                </div>

                <div className="text-sm text-slate-600">
                    {description}
                </div>

                <div className="flex gap-2 pt-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                        className="flex-1"
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={cn(
                            "flex-1",
                            variant === 'danger' ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-900 text-white"
                        )}
                    >
                        {isLoading ? "Processing..." : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};

// Add cn helper import if missing
import { cn } from '@/lib/utils';
