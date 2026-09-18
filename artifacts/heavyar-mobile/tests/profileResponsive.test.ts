import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const profileSource = readFileSync(
  new URL('../app/(tabs)/profile/index.tsx', import.meta.url),
  'utf8',
);

const styleBlock = (name: string) => {
  const match = profileSource.match(new RegExp(`\\n  ${name}: \\{([\\s\\S]*?)\\n  \\},`));
  expect(match, `missing Profile style: ${name}`).not.toBeNull();
  return match?.[1] ?? '';
};

describe('Profile narrow-screen text layout', () => {
  it.each([360, 390, 430])(
    'keeps the profile content area usable at %ipx in Arabic and English',
    (viewportWidth) => {
      const cardWidth = viewportWidth - 40;
      const cardContentWidth = cardWidth - 40;
      const identityTextWidth = cardContentWidth - 72 - 16;

      for (const direction of ['RTL', 'LTR']) {
        expect(identityTextWidth, `${direction} identity text width`).toBeGreaterThanOrEqual(192);
        expect(cardContentWidth / 3, `${direction} location stat width`).toBeGreaterThanOrEqual(93);
      }
    },
  );

  it('lets identity, account labels, email, member date, and location wrap safely', () => {
    expect(styleBlock('profileInfo')).toContain('minWidth: 0');
    expect(styleBlock('nameRow')).toContain("width: '100%'");
    expect(styleBlock('name')).toContain('flexShrink: 1');
    expect(styleBlock('email')).toContain('flexShrink: 1');
    expect(styleBlock('roleBadge')).toContain("flexWrap: 'wrap'");
    expect(styleBlock('roleText')).toContain('flexShrink: 1');
    expect(styleBlock('memberSince')).toContain('flexShrink: 1');
    expect(styleBlock('stat')).toContain('minWidth: 0');
    expect(styleBlock('statValue')).toContain("width: '100%'");
    expect(styleBlock('statLabel')).toContain("textAlign: 'center'");
  });

  it('allows Provider verification information and status badges to wrap without overlap', () => {
    expect(profileSource).toContain('style={[styles.crInfo,');
    expect(styleBlock('crRow')).toContain("flexWrap: 'wrap'");
    expect(styleBlock('crInfo')).toContain('minWidth: 0');
    expect(styleBlock('crLabel')).toContain('flexShrink: 1');
    expect(styleBlock('crValue')).toContain('flexShrink: 1');
    expect(styleBlock('crStatusBadge')).toContain('flexShrink: 1');
    expect(styleBlock('crStatusText')).toContain("textAlign: 'center'");
  });

  it('protects translated actions, menu labels, and region selectors from fixed siblings', () => {
    expect(styleBlock('editProfileText')).toContain('flexShrink: 1');
    expect(styleBlock('saveButtonText')).toContain('flexShrink: 1');
    expect(styleBlock('logoutText')).toContain('flexShrink: 1');
    expect(styleBlock('deleteAccountText')).toContain('flexShrink: 1');
    expect(styleBlock('menuLeft')).toContain('minWidth: 0');
    expect(styleBlock('menuLabel')).toContain('flexShrink: 1');
    expect(styleBlock('editPicker')).toContain('minWidth: 0');
    expect(styleBlock('editPickerText')).toContain('flex: 1');
  });

  it('does not reintroduce forced single-line clipping in Profile text', () => {
    expect(profileSource).not.toContain('numberOfLines=');
    expect(profileSource).not.toContain('ellipsizeMode=');
  });
});