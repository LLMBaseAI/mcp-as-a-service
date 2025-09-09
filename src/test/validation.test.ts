import { describe, test, expect } from 'bun:test';
import { validatePackageName, validateProtocol, sanitizeEnvKey, sanitizeEnvValue, ValidationError } from '../validation.js';

describe('Package Name Validation', () => {
  test('validates correct package names', () => {
    expect(validatePackageName('firecrawl-mcp')).toBe('firecrawl-mcp');
    expect(validatePackageName('@supabase/mcp-server')).toBe('@supabase/mcp-server');
    expect(validatePackageName('package-name_123')).toBe('package-name_123');
  });

  test('rejects invalid package names', () => {
    expect(() => validatePackageName('')).toThrow('INVALID_PACKAGE_NAME:empty_or_invalid_type');
    expect(() => validatePackageName(null)).toThrow('INVALID_PACKAGE_NAME:empty_or_invalid_type');
    expect(() => validatePackageName('package;name')).toThrow('INVALID_PACKAGE_NAME:invalid_format');
    expect(() => validatePackageName('package/../traverse')).toThrow('INVALID_PACKAGE_NAME:path_traversal');
    expect(() => validatePackageName('A'.repeat(201))).toThrow('INVALID_PACKAGE_NAME:too_long');
  });
});

describe('Protocol Validation', () => {
  test('validates correct protocols', () => {
    expect(validateProtocol('stdio')).toBe('stdio');
    expect(validateProtocol('sse')).toBe('sse');
    expect(validateProtocol('websocket')).toBe('websocket');
    expect(validateProtocol('STDIO')).toBe('stdio');
  });

  test('rejects invalid protocols', () => {
    expect(() => validateProtocol('invalid')).toThrow('INVALID_PROTOCOL:not_allowed');
    expect(() => validateProtocol('')).toThrow('INVALID_PROTOCOL:empty_or_invalid_type');
    expect(() => validateProtocol(null)).toThrow('INVALID_PROTOCOL:empty_or_invalid_type');
  });
});

describe('Environment Variable Sanitization', () => {
  test('sanitizes environment keys', () => {
    expect(sanitizeEnvKey('apiKey')).toBe('APIKEY');
    expect(sanitizeEnvKey('firebase-config')).toBe('FIREBASE_CONFIG');
    expect(sanitizeEnvKey('test_var_123')).toBe('TEST_VAR_123');
    expect(sanitizeEnvKey('')).toBe(null);
    expect(sanitizeEnvKey('123invalid')).toBe(null);
    expect(sanitizeEnvKey('A'.repeat(101))).toBe(null);
  });

  test('sanitizes environment values', () => {
    expect(sanitizeEnvValue('safe_value')).toBe('safe_value');
    expect(sanitizeEnvValue('value;with|dangerous&chars')).toBe('valuewithdangerouschars');
    expect(sanitizeEnvValue('')).toBe('');
    expect(sanitizeEnvValue(null)).toBe('');
    expect(sanitizeEnvValue('A'.repeat(1001))).toHaveLength(1000);
  });
});