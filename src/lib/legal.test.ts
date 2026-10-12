import { describe, expect, test } from 'vitest';

import { AI_CONSENT_VERSION, hasAiConsent, readAiConsent } from '@/lib/legal';

describe('consentimiento del chat', () => {
  const record = { version: AI_CONSENT_VERSION, accepted_at: '2026-10-12T10:00:00.000Z' };

  test('se lee de user_metadata; lo retirado o mal formado es null', () => {
    expect(readAiConsent({ username: 'ana', ai_consent: record })).toEqual(record);
    expect(readAiConsent({ ai_consent: null })).toBeNull();
    expect(readAiConsent({ ai_consent: { version: 1 } })).toBeNull();
    expect(readAiConsent(undefined)).toBeNull();
  });

  test('vale la cookie o la cuenta, solo de la versión en vigor', () => {
    expect(hasAiConsent(AI_CONSENT_VERSION, null)).toBe(true);
    expect(hasAiConsent(undefined, record)).toBe(true);
    expect(hasAiConsent('2026-10-11', { ...record, version: '2026-10-11' })).toBe(false);
    expect(hasAiConsent(undefined, null)).toBe(false);
  });
});
