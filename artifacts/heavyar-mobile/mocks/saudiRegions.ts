export interface SaudiCity {
  id: string;
  nameAr: string;
  nameEn: string;
}

export interface SaudiRegion {
  id: string;
  nameAr: string;
  nameEn: string;
  cities: SaudiCity[];
}

export const saudiRegions: SaudiRegion[] = [
  {
    id: 'eastern',
    nameAr: 'المنطقة الشرقية',
    nameEn: 'Eastern Region',
    cities: [
      { id: 'dammam', nameAr: 'الدمام', nameEn: 'Dammam' },
      { id: 'khobar', nameAr: 'الخبر', nameEn: 'Khobar' },
      { id: 'dhahran', nameAr: 'الظهران', nameEn: 'Dhahran' },
      { id: 'jubail', nameAr: 'الجبيل', nameEn: 'Jubail' },
      { id: 'ahsa', nameAr: 'الأحساء', nameEn: 'Al Ahsa' },
      { id: 'hofuf', nameAr: 'الهفوف', nameEn: 'Hofuf' },
      { id: 'mubarraz', nameAr: 'المبرز', nameEn: 'Mubarraz' },
      { id: 'hafar_al_batin', nameAr: 'حفر الباطن', nameEn: 'Hafar Al Batin' },
      { id: 'ras_tanura', nameAr: 'رأس تنورة', nameEn: 'Ras Tanura' },
      { id: 'saihat', nameAr: 'سيهات', nameEn: 'Saihat' },
      { id: 'qatif', nameAr: 'القطيف', nameEn: 'Qatif' },
      { id: 'nairyah', nameAr: 'النعيرية', nameEn: 'Nairyah' },
      { id: 'khafji', nameAr: 'الخفجي', nameEn: 'Khafji' },
      { id: 'abqaiq', nameAr: 'بقيق', nameEn: 'Abqaiq' },
      { id: 'tarout', nameAr: 'تاروت', nameEn: 'Tarout' },
      { id: 'safwa', nameAr: 'صفوى', nameEn: 'Safwa' },
    ],
  },
  {
    id: 'riyadh_region',
    nameAr: 'منطقة الرياض',
    nameEn: 'Riyadh Region',
    cities: [
      { id: 'riyadh', nameAr: 'الرياض', nameEn: 'Riyadh' },
      { id: 'kharj', nameAr: 'الخرج', nameEn: 'Al Kharj' },
      { id: 'dawadmi', nameAr: 'الدوادمي', nameEn: 'Dawadmi' },
      { id: 'majmaah', nameAr: 'المجمعة', nameEn: 'Majmaah' },
      { id: 'zulfi', nameAr: 'الزلفي', nameEn: 'Zulfi' },
      { id: 'wadi_aldawasir', nameAr: 'وادي الدواسر', nameEn: 'Wadi Al Dawasir' },
      { id: 'aflaj', nameAr: 'الأفلاج', nameEn: 'Al Aflaj' },
      { id: 'diriyah', nameAr: 'الدرعية', nameEn: 'Diriyah' },
      { id: 'shaqra', nameAr: 'شقراء', nameEn: 'Shaqra' },
    ],
  },
  {
    id: 'makkah_region',
    nameAr: 'منطقة مكة المكرمة',
    nameEn: 'Makkah Region',
    cities: [
      { id: 'mecca', nameAr: 'مكة المكرمة', nameEn: 'Mecca' },
      { id: 'jeddah', nameAr: 'جدة', nameEn: 'Jeddah' },
      { id: 'taif', nameAr: 'الطائف', nameEn: 'Taif' },
      { id: 'rabigh', nameAr: 'رابغ', nameEn: 'Rabigh' },
      { id: 'al_qunfudhah', nameAr: 'القنفذة', nameEn: 'Al Qunfudhah' },
      { id: 'al_lith', nameAr: 'الليث', nameEn: 'Al Lith' },
      { id: 'khulais', nameAr: 'خليص', nameEn: 'Khulais' },
    ],
  },
  {
    id: 'madinah_region',
    nameAr: 'منطقة المدينة المنورة',
    nameEn: 'Madinah Region',
    cities: [
      { id: 'medina', nameAr: 'المدينة المنورة', nameEn: 'Medina' },
      { id: 'yanbu', nameAr: 'ينبع', nameEn: 'Yanbu' },
      { id: 'al_ula', nameAr: 'العلا', nameEn: 'Al Ula' },
      { id: 'badr', nameAr: 'بدر', nameEn: 'Badr' },
      { id: 'khaybar', nameAr: 'خيبر', nameEn: 'Khaybar' },
    ],
  },
  {
    id: 'qassim',
    nameAr: 'منطقة القصيم',
    nameEn: 'Qassim Region',
    cities: [
      { id: 'buraydah', nameAr: 'بريدة', nameEn: 'Buraydah' },
      { id: 'unaizah', nameAr: 'عنيزة', nameEn: 'Unaizah' },
      { id: 'ar_rass', nameAr: 'الرس', nameEn: 'Ar Rass' },
      { id: 'al_mithnab', nameAr: 'المذنب', nameEn: 'Al Mithnab' },
      { id: 'al_bukayriyah', nameAr: 'البكيرية', nameEn: 'Al Bukayriyah' },
    ],
  },
  {
    id: 'asir',
    nameAr: 'منطقة عسير',
    nameEn: 'Asir Region',
    cities: [
      { id: 'abha', nameAr: 'أبها', nameEn: 'Abha' },
      { id: 'khamis_mushait', nameAr: 'خميس مشيط', nameEn: 'Khamis Mushait' },
      { id: 'bisha', nameAr: 'بيشة', nameEn: 'Bisha' },
      { id: 'al_namas', nameAr: 'النماص', nameEn: 'Al Namas' },
      { id: 'muhayil', nameAr: 'محايل', nameEn: 'Muhayil' },
      { id: 'sarat_abidah', nameAr: 'سراة عبيدة', nameEn: 'Sarat Abidah' },
    ],
  },
  {
    id: 'tabuk_region',
    nameAr: 'منطقة تبوك',
    nameEn: 'Tabuk Region',
    cities: [
      { id: 'tabuk', nameAr: 'تبوك', nameEn: 'Tabuk' },
      { id: 'umluj', nameAr: 'أملج', nameEn: 'Umluj' },
      { id: 'al_wajh', nameAr: 'الوجه', nameEn: 'Al Wajh' },
      { id: 'duba', nameAr: 'ضباء', nameEn: 'Duba' },
      { id: 'haql', nameAr: 'حقل', nameEn: 'Haql' },
      { id: 'neom', nameAr: 'نيوم', nameEn: 'NEOM' },
    ],
  },
  {
    id: 'hail_region',
    nameAr: 'منطقة حائل',
    nameEn: 'Hail Region',
    cities: [
      { id: 'hail', nameAr: 'حائل', nameEn: 'Hail' },
      { id: 'al_ghazalah', nameAr: 'الغزالة', nameEn: 'Al Ghazalah' },
      { id: 'baqaa', nameAr: 'بقعاء', nameEn: 'Baqaa' },
    ],
  },
  {
    id: 'northern_borders',
    nameAr: 'منطقة الحدود الشمالية',
    nameEn: 'Northern Borders Region',
    cities: [
      { id: 'arar', nameAr: 'عرعر', nameEn: 'Arar' },
      { id: 'rafha', nameAr: 'رفحاء', nameEn: 'Rafha' },
      { id: 'turaif', nameAr: 'طريف', nameEn: 'Turaif' },
    ],
  },
  {
    id: 'jazan_region',
    nameAr: 'منطقة جازان',
    nameEn: 'Jazan Region',
    cities: [
      { id: 'jazan', nameAr: 'جازان', nameEn: 'Jazan' },
      { id: 'sabya', nameAr: 'صبيا', nameEn: 'Sabya' },
      { id: 'abu_arish', nameAr: 'أبو عريش', nameEn: 'Abu Arish' },
      { id: 'samtah', nameAr: 'صامطة', nameEn: 'Samtah' },
    ],
  },
  {
    id: 'najran_region',
    nameAr: 'منطقة نجران',
    nameEn: 'Najran Region',
    cities: [
      { id: 'najran', nameAr: 'نجران', nameEn: 'Najran' },
      { id: 'sharurah', nameAr: 'شرورة', nameEn: 'Sharurah' },
    ],
  },
  {
    id: 'al_baha_region',
    nameAr: 'منطقة الباحة',
    nameEn: 'Al Baha Region',
    cities: [
      { id: 'al_baha', nameAr: 'الباحة', nameEn: 'Al Baha' },
      { id: 'baljurashi', nameAr: 'بلجرشي', nameEn: 'Baljurashi' },
      { id: 'al_makhwah', nameAr: 'المخواة', nameEn: 'Al Makhwah' },
    ],
  },
  {
    id: 'al_jawf',
    nameAr: 'منطقة الجوف',
    nameEn: 'Al Jawf Region',
    cities: [
      { id: 'sakaka', nameAr: 'سكاكا', nameEn: 'Sakaka' },
      { id: 'dumat_al_jandal', nameAr: 'دومة الجندل', nameEn: 'Dumat Al Jandal' },
      { id: 'qurayyat', nameAr: 'القريات', nameEn: 'Qurayyat' },
    ],
  },
];

export function getAllCities(): SaudiCity[] {
  return saudiRegions.flatMap(r => r.cities);
}

export function getCitiesByRegion(regionId: string): SaudiCity[] {
  const region = saudiRegions.find(r => r.id === regionId);
  return region ? region.cities : [];
}

export function findCityById(cityId: string): SaudiCity | undefined {
  for (const region of saudiRegions) {
    const city = region.cities.find(c => c.id === cityId);
    if (city) return city;
  }
  return undefined;
}

export function findRegionByCityId(cityId: string): SaudiRegion | undefined {
  return saudiRegions.find(r => r.cities.some(c => c.id === cityId));
}

export function findRegionById(regionId: string): SaudiRegion | undefined {
  return saudiRegions.find(r => r.id === regionId);
}
