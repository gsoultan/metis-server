import { Alert, Badge, Group, Select, Stack, Text } from '@mantine/core';
import { Info } from 'lucide-react';

import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  mappingIsComplete,
  type FieldMapping,
  type ImportField,
} from '../../domain/peopleImportCheck';
import classes from './PeopleImport.module.css';

interface MatchStepProps {
  /** The fields the source returned. */
  fields: readonly string[];
  /** The first row's values, by source field. */
  sample: Record<string, string> | undefined;
  mapping: FieldMapping;
  onChange: (mapping: FieldMapping) => void;
}

/**
 * Step two: which of the source's fields is which of Metis's.
 *
 * Every Metis field is one row with the source field it reads and what that
 * field holds in the first row, so a wrong guess shows as a wrong value before
 * anything is checked. A source field feeds one Metis field at most.
 */
export function MatchStep({ fields, sample, mapping, onChange }: MatchStepProps) {
  const usedElsewhere = (target: ImportField) =>
    new Set(IMPORT_FIELDS.filter((other) => other !== target).map((other) => mapping[other]).filter(Boolean));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        We guessed from the field names. Check each one against the sample from the first row. Fields you leave
        unmatched are not imported, and nothing else from the source is stored.
      </Text>

      <div role="table" aria-label="Field matching">
        <div className={classes.mapRow} role="row">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" role="columnheader">Metis field</Text>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" role="columnheader">Your field</Text>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" role="columnheader">First row</Text>
        </div>
        {IMPORT_FIELDS.map((target) => {
          const meta = IMPORT_FIELD_LABELS[target];
          const taken = usedElsewhere(target);
          const source = mapping[target] ?? null;
          return (
            <div className={classes.mapRow} role="row" key={target}>
              <div role="cell">
                <Group gap={6}>
                  <Text size="sm" fw={600}>{meta.label}</Text>
                  {meta.required && <Badge size="xs" variant="light" color="gray">Required</Badge>}
                </Group>
                <Text size="xs" c="dimmed">{meta.hint}</Text>
              </div>
              <div role="cell">
                <Select
                  aria-label={`Your field for ${meta.label}`}
                  placeholder="Not imported"
                  data={fields.map((field) => ({ value: field, label: field, disabled: taken.has(field) }))}
                  value={source}
                  onChange={(value) => onChange({ ...mapping, [target]: value ?? undefined })}
                  clearable={!meta.required}
                  searchable
                  nothingFoundMessage="No such field"
                  error={meta.required && !source ? 'Choose the field that holds the username' : undefined}
                />
              </div>
              <div role="cell" className={classes.sample} title={source ? sample?.[source] : undefined}>
                {source ? sample?.[source] || '(empty)' : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {!mapping.external_id && mappingIsComplete(mapping) && (
        <Alert color="blue" variant="light" radius="md" icon={<Info size={16} />}>
          <Text size="sm">
            Without an external ID, people are matched on username only. If somebody's login changes in your
            application, Metis sees a new person and the old one keeps their open tasks.
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
