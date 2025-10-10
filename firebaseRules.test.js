const fs = require('fs');

describe('firestore.rules', () => {
  let rules;

  beforeAll(() => {
    rules = fs.readFileSync('./firestore.rules', 'utf8');
  });

  test('should specify rules_version 2', () => {
    expect(rules).toMatch(/rules_version\s*=\s*'2'/);
  });

  test('should contain match for users collection', () => {
    expect(rules).toMatch(/match \/users\/\{userId\}/);
  });

  test('should contain match for content collection', () => {
    expect(rules).toMatch(/match \/content\/\{contentId\}/);
  });

  test('should allow read for authenticated users on content', () => {
    expect(rules).toMatch(/allow read:\s*if request\.auth != null/);
  });
});