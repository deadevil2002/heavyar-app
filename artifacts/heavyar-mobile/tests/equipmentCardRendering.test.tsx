import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import EquipmentCard from '../components/EquipmentCard';
import type { Equipment } from '../types';

vi.mock('react-native', () => ({
  View: ({ children, style }: any) => <div data-style={JSON.stringify(style)}>{children}</div>,
  Text: ({ children, numberOfLines }: any) => <span data-lines={numberOfLines}>{children}</span>,
  Pressable: ({ children, style, testID }: any) => <button data-testid={testID} data-style={JSON.stringify(style)}>{children}</button>,
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('expo-image', () => ({ Image: ({ source, cachePolicy }: any) => <img src={source.uri} data-cache={cachePolicy} /> }));
vi.mock('lucide-react-native', () => ({ MapPin: () => null, Package: () => <span>image unavailable</span> }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ isRTL: false, t: (key: string) => key, localizedText: (_ar: string, en: string) => en }) }));

const equipment = {
  id: 'card-test', titleEn: 'Test crane title', titleAr: '', city: 'custom', customCity: 'Test city', availability: true,
  images: ['https://res.cloudinary.com/demo/image/upload/v123/crane.jpg'],
  pricing: { currency: 'SAR', hourly: { enabled: true, amountMinor: 2500 }, daily: { enabled: true, amountMinor: 12000 } },
} as unknown as Equipment;

it.each([true, false])('renders real card in compact=%s without owner/rating lookup', compact => {
  const html = renderToStaticMarkup(<EquipmentCard equipment={equipment} compact={compact} />);
  expect(html).toContain('Test crane title');
  expect(html).toContain('Test city');
  expect(html).toContain('data-lines="2"');
  expect(html).toContain('memory-disk');
  expect(html).toContain(compact ? 'w_480' : 'w_320');
  expect(html).not.toContain('rating');
  expect(html).toContain(compact ? '&quot;aspectRatio&quot;:1.3333333333333333' : '&quot;width&quot;:112');
});

it('renders stable empty-image fallback', () => {
  const html = renderToStaticMarkup(<EquipmentCard equipment={{ ...equipment, images: [] }} />);
  expect(html).toContain('image unavailable');
  expect(html).not.toContain('<img');
});