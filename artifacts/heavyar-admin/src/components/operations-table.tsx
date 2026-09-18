import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppState } from '@/lib/app-state';
import { Checkbox } from '@/components/ui/checkbox';
import { candidatePageEmptyLabel } from '@/lib/operations-contract';

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
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectPage?: (checked: boolean) => void;
  cardAtTablet?: boolean;
};

export function OperationsTable<T extends { id: string }>({
  columns,
  items = [],
  loading,
  search,
  onSearch,
  searchPlaceholder = '',
  onDetails,
  emptyLabel = '',
  nextCursor,
  hasPrevious,
  onNext,
  onPrevious,
  sort,
  onSort,
  toolbar,
  actionLabel = '',
  selectable,
  selectedIds = new Set(),
  onSelect,
  onSelectPage,
  cardAtTablet = false,
}: Props<T>) {
  const { language } = useAppState();
  const rtl = language === 'ar';
  const t = (ar: string, en: string) => rtl ? ar : en;
  const resolvedSearchPlaceholder = searchPlaceholder || t('بحث…', 'Search…');
   const resolvedEmptyLabel = candidatePageEmptyLabel(Boolean(nextCursor), language) || emptyLabel || t('لم يتم العثور على نتائج', 'No results found');
  const resolvedActionLabel = actionLabel || t('عرض التفاصيل', 'View details');

  const pageIds = items.map(i => i.id);
  const isAllPageSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));
  const isSomePageSelected = items.some(i => selectedIds.has(i.id)) && !isAllPageSelected;

  return (
    <div className="space-y-3">
      {(onSearch || toolbar) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {onSearch && (
            <Input
              value={search || ''}
              onChange={(event) => onSearch(event.target.value)}
               placeholder={resolvedSearchPlaceholder}
              className="w-full sm:max-w-sm bg-card"
               aria-label={resolvedSearchPlaceholder}
            />
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}
      {cardAtTablet && (
        <div className="grid gap-3 lg:hidden">
          {loading ? (
            <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{t('جاري التحميل…', 'Loading…')}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">{resolvedEmptyLabel}</div>
          ) : items.map((item) => (
            <div key={item.id} className="min-w-0 space-y-3 overflow-hidden rounded-md border border-border bg-card p-4">
              <div className="flex min-w-0 items-start gap-3">
                {selectable && (
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={(checked) => onSelect?.(item.id, checked === true)}
                    aria-label={rtl ? `تحديد ${item.id}` : `Select ${item.id}`}
                    className="mt-1 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-3">
                  {columns.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <div className="mb-1 text-xs font-semibold text-muted-foreground">{column.label}</div>
                      <div className="min-w-0 break-words text-sm">{column.render(item)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {onDetails && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onDetails(item)}>
                  <Eye className="me-2 h-4 w-4" />{resolvedActionLabel}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className={`${cardAtTablet ? 'hidden lg:block' : ''} overflow-x-auto rounded-md border border-border bg-card`}>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-border hover:bg-transparent">
              {selectable && (
                <TableHead className="w-12 text-center">
                  <Checkbox
                    checked={isAllPageSelected ? true : (isSomePageSelected ? 'indeterminate' : false)}
                    onCheckedChange={(checked) => onSelectPage?.(checked === true)}
                    aria-label={rtl ? 'تحديد الصفحة' : 'Select page'}
                  />
                </TableHead>
              )}
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
               <TableRow><TableCell colSpan={columns.length + (onDetails ? 1 : 0) + (selectable ? 1 : 0)} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{t('جاري التحميل…', 'Loading…')}</TableCell></TableRow>
            ) : items.length === 0 ? (
               <TableRow><TableCell colSpan={columns.length + (onDetails ? 1 : 0) + (selectable ? 1 : 0)} className="py-10 text-center text-muted-foreground">{resolvedEmptyLabel}</TableCell></TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id} className="border-border border-b last:border-0 hover:bg-muted/20">
                {selectable && (
                  <TableCell className="w-12 text-center">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={(checked) => onSelect?.(item.id, checked === true)}
                      aria-label={rtl ? `تحديد ${item.id}` : `Select ${item.id}`}
                    />
                  </TableCell>
                )}
                {columns.map((column) => <TableCell key={column.key} className={column.className}>{column.render(item)}</TableCell>)}
               {onDetails && <TableCell className="text-end"><Button type="button" variant="ghost" size="sm" onClick={() => onDetails(item)}><Eye className="me-2 h-4 w-4" />{resolvedActionLabel}</Button></TableCell>}
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