import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./switch.tsx', import.meta.url), 'utf8');

describe('shared switch geometry contract', () => {
  it('fixes track and thumb sizes without allowing flex shrink or button padding', () => {
    expect(source).toContain('relative inline-flex h-5 w-9 shrink-0');
    expect(source).toContain('border-2 border-transparent p-0');
    expect(source).toContain('h-4 w-4 shrink-0');
  });

  it('anchors at logical start and moves inward in LTR and RTL', () => {
    expect(source).toContain('absolute start-0 top-0');
    expect(source).toContain('data-[state=checked]:translate-x-4');
    expect(source).toContain('rtl:data-[state=checked]:-translate-x-4');
    expect(source).toContain('data-[state=unchecked]:translate-x-0');
  });

  it('keeps focus visible and disabled controls distinguishable', () => {
    expect(source).toContain('disabled:cursor-not-allowed disabled:opacity-50');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).not.toContain('overflow-hidden');
    expect(source).toContain('data-[state=checked]:bg-primary');
    expect(source).toContain('data-[state=unchecked]:bg-input');
  });
});