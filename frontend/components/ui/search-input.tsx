import React from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ 
    value, 
    onChange, 
    placeholder = "Search...", 
    className 
}) => {
    return (
        <div className={`relative ${className}`}>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
                type="search"
                placeholder={placeholder}
                className="pl-8 h-9 focus-visible:ring-indigo-500"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};
