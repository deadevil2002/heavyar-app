import { Category } from '@/types';

export const mockCategories: Category[] = [
  { id: 'excavators', nameAr: 'حفارات', nameEn: 'Excavators', icon: 'Shovel', count: 24 },
  { id: 'cranes', nameAr: 'رافعات', nameEn: 'Cranes', icon: 'ArrowUpFromLine', count: 18 },
  { id: 'loaders', nameAr: 'لوادر', nameEn: 'Loaders', icon: 'Truck', count: 15 },
  { id: 'bulldozers', nameAr: 'بلدوزرات', nameEn: 'Bulldozers', icon: 'Tractor', count: 12 },
  { id: 'trucks', nameAr: 'شاحنات', nameEn: 'Trucks', icon: 'Container', count: 30 },
  { id: 'generators', nameAr: 'مولدات', nameEn: 'Generators', icon: 'Zap', count: 22 },
  { id: 'compressors', nameAr: 'ضواغط', nameEn: 'Compressors', icon: 'Wind', count: 9 },
  { id: 'concrete', nameAr: 'معدات خرسانة', nameEn: 'Concrete', icon: 'Building2', count: 14 },
  { id: 'other', nameAr: 'أخرى', nameEn: 'Other', icon: 'Shovel', count: 0 },
];

export const mockCities = [
  { id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh' },
  { id: 'jeddah', nameAr: 'جدة', nameEn: 'Jeddah' },
  { id: 'dammam', nameAr: 'الدمام', nameEn: 'Dammam' },
  { id: 'mecca', nameAr: 'مكة المكرمة', nameEn: 'Mecca' },
  { id: 'medina', nameAr: 'المدينة المنورة', nameEn: 'Medina' },
  { id: 'khobar', nameAr: 'الخبر', nameEn: 'Khobar' },
  { id: 'tabuk', nameAr: 'تبوك', nameEn: 'Tabuk' },
  { id: 'abha', nameAr: 'أبها', nameEn: 'Abha' },
];
