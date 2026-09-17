import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppState } from '@/lib/app-state';

export type OperationsColumn<T> = {
  key: string;
  label: string;
  className?: string;
  sortable?: boolean;
  render: (item: T) => ReactNode;
};

type Props<T extends { id: string }> = {
  columns: OperationsColumn<T>[];
  items?: T[];
  loading?: boolean;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  onDetails?: (item: T) => void;
  emptyLabel?: string;
  nextCursor?: string;
  hasPrevious?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  sort?: string;
  onSort?: (key: string) => void;
  toolbar?: ReactNode;
  actionLabel?: string;
};

export function OperationsTable<T extends { id: string }>({
  columns,
  items = [],
  loading,
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  onDetails,
  emptyLabel = 'No results found',
  nextCursor,
  hasPrevious,
  onNext,
  onPrevious,
  sort,
  onSort,
  toolbar,
  actionLabel = 'View details',
}: Props<T>) {
  const { language } = useAppState();
  const rtl = language === 'ar';
  return (
    <div className="space-y-3">
      {(onSearch || toolbar) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {onSearch && (
            <Input
              value={search || ''}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full sm:max-w-sm bg-card"
              aria-label={searchPlaceholder}
            />
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={`font-semibold text-foreground whitespace-nowrap ${column.className || ''}`}>
                  {column.sortable && onSort ? (
                    <button type="button" onClick={() => onSort(column.key)} className="inline-flex items-center gap-1 hover:text-primary">
                      {column.label}<ArrowUpDown className={`h-3.5 w-3.5 ${sort === column.key ? 'text-primary' : 'text-muted-foreground'}`} />
                    </button>
                  ) : column.label}
                </TableHead>
              ))}
              {onDetails && <TableHead className="text-end">{actionLabel}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length + (onDetails ? 1 : 0)} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + (onDetails ? 1 : 0)} className="py-10 text-center text-muted-foreground">{emptyLabel}</TableCell></TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                {columns.map((column) => <TableCell key={column.key} className={column.className}>{column.render(item)}</TableCell>)}
                {onDetails && <TableCell className="text-end"><Button type="button" variant="ghost" size="sm" onClick={() => onDetails(item)}><Eye className="me-2 h-4 w-4" />{rtl ? 'التفاصيل' : actionLabel}</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(onNext || onPrevious) && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious} className="gap-2"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{rtl ? 'السابق' : 'Previous'}</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!nextCursor} className="gap-2">{rtl ? 'التالي' : 'Next'}<ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
        </div>
      )}
    </div>
  );
}