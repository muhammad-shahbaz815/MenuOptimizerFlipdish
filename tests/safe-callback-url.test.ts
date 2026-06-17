import { describe, expect, it } from 'vitest';
import { getSafeCallbackUrl } from '@/lib/safe-callback-url';

describe('getSafeCallbackUrl', () => {
  it('returns / when callbackUrl is null or undefined', () => {
    expect(getSafeCallbackUrl(null)).toBe('/');
    expect(getSafeCallbackUrl(undefined)).toBe('/');
  });

  it('returns / when callbackUrl is empty or whitespace', () => {
    expect(getSafeCallbackUrl('')).toBe('/');
    expect(getSafeCallbackUrl('   ')).toBe('/');
  });

  it('returns / for protocol-relative URLs', () => {
    expect(getSafeCallbackUrl('//evil.com/path')).toBe('/');
  });

  it('returns relative path as-is', () => {
    expect(getSafeCallbackUrl('/')).toBe('/');
    expect(getSafeCallbackUrl('/dashboard')).toBe('/dashboard');
    expect(getSafeCallbackUrl('/auth/signin?foo=1')).toBe('/auth/signin?foo=1');
    expect(getSafeCallbackUrl('/path#hash')).toBe('/path#hash');
  });

  it('returns / for absolute URL with different origin when origin provided', () => {
    expect(getSafeCallbackUrl('https://other.com/path', 'https://app.example.com')).toBe('/');
  });

  it('returns pathname+search+hash for same-origin absolute URL', () => {
    const origin = 'https://app.example.com';
    expect(getSafeCallbackUrl('https://app.example.com/done', origin)).toBe('/done');
    expect(getSafeCallbackUrl('https://app.example.com/done?x=1', origin)).toBe('/done?x=1');
    expect(getSafeCallbackUrl('https://app.example.com/done#section', origin)).toBe('/done#section');
  });

  it('returns / when origin not provided for absolute URL', () => {
    expect(getSafeCallbackUrl('https://app.example.com/done')).toBe('/');
  });

  it('trims whitespace before checking', () => {
    expect(getSafeCallbackUrl('  /dashboard  ')).toBe('/dashboard');
  });
});
