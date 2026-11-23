import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type SchemaProperty = { type?: string; properties?: Record<string, SchemaProperty>; items?: SchemaProperty };
type LayoutItem = string | { key?: string; items?: LayoutItem[]; condition?: { functionBody?: string } };

const schema = JSON.parse(readFileSync(join(process.cwd(), 'config.schema.json'), 'utf8')) as {
  schema: Record<string, SchemaProperty>;
  layout: LayoutItem[];
};

function conditionBodies(items: LayoutItem[] = []): string[] {
  return items.flatMap(item => typeof item === 'string'
    ? []
    : [...(item.condition?.functionBody ? [item.condition.functionBody] : []), ...conditionBodies(item.items)]);
}

describe('config.schema.json', () => {
  const deviceProperties = schema.schema.devices.items?.properties ?? {};
  const deviceConditions = conditionBodies(schema.layout).filter(body => body.includes('model.devices[arrayIndices]'));

  test('declares every device field that the layout conditions read', () => {
    // The Homebridge UI drops device fields that the schema does not declare, so a
    // condition on an undeclared field never matches and its settings never show.
    const usedFields = new Set(deviceConditions.flatMap(body =>
      [...body.matchAll(/model\.devices\[arrayIndices\]\.(\w+)/g)].map(match => match[1])));

    expect(usedFields.size).toBeGreaterThan(0);
    for (const field of usedFields) {
      expect(deviceProperties).toHaveProperty(field);
    }
  });

  test('shows device settings by the device type', () => {
    expect(deviceProperties.type).toEqual({ title: 'Device Type', type: 'string' });
    expect(deviceConditions.length).toBeGreaterThanOrEqual(5);
    for (const body of deviceConditions) {
      expect(body).toContain('model.devices[arrayIndices].type');
    }
  });
});
