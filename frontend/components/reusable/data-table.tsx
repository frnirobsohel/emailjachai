import React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/common/table";
import { cn } from "@/lib/utils";

interface Column<T> {
    header: string;
    accessorKey: keyof T | string;
    cell?: (row: T) => React.ReactNode;
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    isLoading?: boolean;
    emptyMessage?: string;
    className?: string;
}

export function DataTable<T>({
    columns,
    data,
    isLoading,
    emptyMessage = "No results found.",
    className
}: DataTableProps<T>) {
    return (
        <div className={cn("w-full overflow-auto", className)}>
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col, idx) => (
                            <TableHead key={idx} className={col.className}>
                                {col.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                {columns.map((_, j) => (
                                    <TableCell key={j}>
                                        <div className="h-4 bg-slate-100 animate-pulse rounded" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    ) : (
                        data.map((row, i) => (
                            <TableRow key={i}>
                                {columns.map((col, j) => (
                                    <TableCell key={j} className={col.className}>
                                        {col.cell ? col.cell(row) : (row[col.accessorKey as keyof T] as unknown as React.ReactNode)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
