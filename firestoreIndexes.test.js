const fs = require('fs');

describe('firestore.indexes.json', () => {
  let indexes;

  beforeAll(() => {
    indexes = JSON.parse(fs.readFileSync('./firestore.indexes.json', 'utf8'));
  });

  test('should contain indexes and fieldOverrides arrays', () => {
    expect(Array.isArray(indexes.indexes)).toBe(true);
    expect(Array.isArray(indexes.fieldOverrides)).toBe(true);
  });

  test('indexes array should be empty or contain valid objects', () => {
    indexes.indexes.forEach(idx => {
      expect(idx).toHaveProperty('collectionGroup');
    });
  });
});
