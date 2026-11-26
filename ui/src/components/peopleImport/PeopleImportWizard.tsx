import { Alert, Button, Group, Modal, Stack, Stepper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronLeft, ChevronRight, Info, Upload } from 'lucide-react';
import { useState } from 'react';

import type { ImportSummary } from '../../domain/participantImport';
import {
  guessMapping,
  mappingIsComplete,
  renamesHoldingTasks,
  usesMetisNames,
  writableCount,
  type FieldMapping,
  type ImportCheck,
} from '../../domain/peopleImportCheck';
import {
  CSV_HEAD_BYTES,
  canKeepInSync,
  directoryConfig,
  emptySource,
  readCsvHead,
  sourceRequest,
  suggestedDirectoryName,
  type SourceDraft,
} from '../../domain/peopleImportSource';
import { useCheckParticipantImport, useImportParticipants } from '../../hooks/useParticipants';
import { useSaveSource } from '../../hooks/useParticipantSources';
import { errorMessage } from '../../services/shared/errors';
import { RequestError } from '../../services/shared/rest';
import { CheckStep } from './CheckStep';
import { DoneStep } from './DoneStep';
import { MatchStep } from './MatchStep';
import { SourceStep } from './SourceStep';

interface PeopleImportWizardProps {
  opened: boolean;
  onClose: () => void;
  /** May read a database: an administrator or a query author. */
  allowDatabase: boolean;
  /** May save a directory that keeps syncing: an administrator. */
  allowKeepInSync: boolean;
}

const STEP = { source: 0, match: 1, check: 2, done: 3 } as const;

/**
 * Importing people in four steps: choose a source, match its fields, check
 * every row, import.
 *
 * Nothing is written before the last step. The check and the import send the
 * same body, so what lands is what was checked unless the source itself
 * changed in between, and the import's own summary is what the last step shows.
 */
export function PeopleImportWizard({ opened, onClose, allowDatabase, allowKeepInSync }: PeopleImportWizardProps) {
  const [step, setStep] = useState<number>(STEP.source);
  const [draft, setDraft] = useState<SourceDraft>(emptySource);
  const [tested, setTested] = useState<ImportCheck | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [check, setCheck] = useState<ImportCheck | null>(null);
  // The engine has no check endpoint: it is older than this page.
  const [uncheckable, setUncheckable] = useState(false);
  const [moveOpenTasks, setMoveOpenTasks] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [saved, setSaved] = useState(false);

  const checkImport = useCheckParticipantImport();
  const runImport = useImportParticipants();
  const saveSource = useSaveSource();

  const reset = () => {
    setStep(STEP.source);
    setDraft(emptySource());
    setTested(null);
    setTestError(null);
    setMapping({});
    setCheck(null);
    setUncheckable(false);
    setMoveOpenTasks(false);
    setResult(null);
    setSaved(false);
  };

  const close = () => {
    onClose();
    reset();
  };

  // A changed source makes the last test and guess stale.
  const changeSource = (next: SourceDraft) => {
    setDraft(next);
    setTested(null);
    setTestError(null);
    setCheck(null);
  };

  const test = async () => {
    setTestError(null);
    try {
      if (draft.kind === 'csv' && draft.file) {
        const head = readCsvHead(await draft.file.slice(0, CSV_HEAD_BYTES).text());
        if (head.fields.length === 0) throw new Error('The file has no header row naming its columns.');
        const read = draft.file.size <= CSV_HEAD_BYTES ? head.rows : -1;
        setTested({ read, counts: {}, fields: head.fields, sample: head.sample, rows: [] });
        setMapping(guessMapping(head.fields));
        return;
      }
      const found = await checkImport.mutateAsync(sourceRequest(draft, {}, false));
      setTested(found);
      setMapping(guessMapping(found.fields));
    } catch (error) {
      setTested(null);
      setTestError(errorMessage(error, 'The source could not be read.'));
    }
  };

  const runCheck = async () => {
    try {
      setCheck(await checkImport.mutateAsync(sourceRequest(draft, mapping, moveOpenTasks)));
      setUncheckable(false);
      setStep(STEP.check);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        setCheck(null);
        setUncheckable(true);
        setStep(STEP.check);
        return;
      }
      notifications.show({ color: 'red', title: 'The rows could not be checked', message: errorMessage(error, 'Nothing was imported.') });
    }
  };

  const importNow = async () => {
    try {
      setResult(await runImport.mutateAsync(sourceRequest(draft, mapping, moveOpenTasks)));
      setStep(STEP.done);
    } catch {
      // The hook reports it; the checked rows stay on screen to try again.
    }
  };

  const keepInSync = async (directory: { name: string; schedule: string; on_missing: string }) => {
    if (!canKeepInSync(draft.kind)) return;
    try {
      await saveSource.mutateAsync({
        ...directory,
        kind: draft.kind,
        enabled: true,
        config: directoryConfig(draft, mapping, moveOpenTasks),
      });
      setSaved(true);
    } catch (error) {
      notifications.show({ color: 'red', title: 'The directory was not saved', message: errorMessage(error, 'Try again.') });
    }
  };

  // Renames whose old username still has open tasks are refused unless the
  // tasks move with them, so they are not counted until that is chosen.
  const skippedRenames = check && !moveOpenTasks ? renamesHoldingTasks(check) : 0;
  const toImport = check ? writableCount(check) - skippedRenames : 0;
  const needsMoveChoice = skippedRenames > 0;

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={<Group gap="xs"><Upload size={20} aria-hidden="true" /><Text fw={800}>Import people</Text></Group>}
      size={step === STEP.check ? 960 : 'xl'}
      radius="lg"
    >
      <Stack gap="lg">
        <Stepper active={step} size="sm" allowNextStepsSelect={false} onStepClick={(next) => next < step && step !== STEP.done && setStep(next)}>
          <Stepper.Step label="Source" description="Where they come from" />
          <Stepper.Step label="Match" description="Fields to Metis" />
          <Stepper.Step label="Check" description="Every row" />
          <Stepper.Step label="Import" description="Write them" />
        </Stepper>

        {step === STEP.source && (
          <SourceStep
            draft={draft}
            onChange={changeSource}
            allowDatabase={allowDatabase}
            onTest={test}
            testing={checkImport.isPending}
            tested={tested}
            testError={testError}
          />
        )}
        {step === STEP.match && tested && (
          <MatchStep fields={tested.fields} sample={tested.sample} mapping={mapping} onChange={(next) => { setMapping(next); setCheck(null); }} />
        )}
        {step === STEP.check && uncheckable && (
          <Alert color="blue" variant="light" radius="md" icon={<Info size={16} />} title="This Metis engine cannot check rows first">
            <Text size="sm">
              {usesMetisNames(mapping)
                ? 'It is older than this page. The import writes the rows directly, and lists the ones it refused afterwards.'
                : "It is older than this page and reads columns by Metis's own field names only. Rename your columns to match, or update the engine, to import with this matching."}
            </Text>
          </Alert>
        )}
        {step === STEP.check && check && (
          <CheckStep check={check} moveOpenTasks={moveOpenTasks} onMoveOpenTasks={setMoveOpenTasks} />
        )}
        {step === STEP.done && result && (
          <DoneStep
            result={result}
            canKeepInSync={allowKeepInSync && canKeepInSync(draft.kind)}
            suggestedName={suggestedDirectoryName(draft)}
            onKeepInSync={keepInSync}
            saving={saveSource.isPending}
            saved={saved}
          />
        )}

        <Group justify="space-between">
          {step > STEP.source && step < STEP.done ? (
            <Button variant="default" leftSection={<ChevronLeft size={16} />} onClick={() => setStep(step - 1)}>Back</Button>
          ) : (
            <span />
          )}
          <Group gap="sm">
            {step < STEP.done && <Button variant="subtle" color="gray" onClick={close}>Cancel</Button>}
            {step === STEP.source && (
              <Button rightSection={<ChevronRight size={16} />} disabled={!tested} onClick={() => setStep(STEP.match)}>
                Match fields
              </Button>
            )}
            {step === STEP.match && (
              <Button rightSection={<ChevronRight size={16} />} disabled={!mappingIsComplete(mapping)} loading={checkImport.isPending} onClick={runCheck}>
                Check rows
              </Button>
            )}
            {step === STEP.check && uncheckable && (
              <Button loading={runImport.isPending} disabled={!usesMetisNames(mapping)} onClick={importNow}>
                Import without checking
              </Button>
            )}
            {step === STEP.check && !uncheckable && (
              <Button
                loading={runImport.isPending}
                disabled={toImport === 0}
                onClick={importNow}
                title={needsMoveChoice ? 'Renames with open tasks are skipped unless you move the tasks' : undefined}
              >
                {toImport === 0 ? 'Nothing to import' : `Import ${toImport.toLocaleString()} ${toImport === 1 ? 'person' : 'people'}`}
              </Button>
            )}
            {step === STEP.done && <Button onClick={close}>Done</Button>}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
