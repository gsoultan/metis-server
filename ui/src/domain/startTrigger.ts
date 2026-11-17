/**
 * What starts a process, as its start step says it.
 *
 * The engine goes by three settings on the start step and nothing else: a
 * `message_name`, a `signal_name` or a `start_schedule`. A start step with
 * none of them starts when somebody asks. The panel used to save its choice
 * as `startedBy`, which the engine never read, so "On a schedule" and
 * "Another system sends a message" started nothing.
 *
 * `startedBy` is still kept, as the designer's note of a choice whose name
 * has not been typed yet. Whenever the engine's own settings say something,
 * they are what is shown.
 */

import { asText } from '../types/bpmn';
import { defaultSchedule, readSchedule, scheduleProblems, type StartSchedule } from './startSchedule';

export type StartTrigger = 'manual' | 'message' | 'signal' | 'schedule';

/** The fields of a start step that say what starts it. */
export interface StartStepData {
  [key: string]: unknown;
  startedBy?: unknown;
  messageName?: unknown;
  signalName?: unknown;
  start_schedule?: unknown;
}

export const START_TRIGGERS: readonly { value: StartTrigger; label: string; blurb: string }[] = [
  {
    value: 'manual',
    label: 'Someone starts it',
    blurb: 'A person presses Run, or another system asks for a run through the API or the SDK.',
  },
  {
    value: 'message',
    label: 'A message arrives',
    blurb: 'A run starts each time a message with this name arrives from a webhook, a broker or the API.',
  },
  {
    value: 'signal',
    label: 'A signal is sent',
    blurb: 'A run starts each time this signal is broadcast, along with everything else listening for it.',
  },
  {
    value: 'schedule',
    label: 'On a schedule',
    blurb: 'A run starts by itself at each time below, once this version is deployed and live.',
  },
];

/** What starts the process, from what the engine will read. */
export function startTriggerOf(data: StartStepData): StartTrigger {
  if (hasSchedule(data)) return 'schedule';
  if (asText(data.messageName).trim() !== '') return 'message';
  if (asText(data.signalName).trim() !== '') return 'signal';
  // Chosen, and the name not typed yet. An older "timer" with no schedule
  // never started anything, so it reads as what it did: someone starts it.
  const noted = asText(data.startedBy);
  return noted === 'message' || noted === 'signal' ? noted : 'manual';
}

function hasSchedule(data: StartStepData): boolean {
  const raw = data.start_schedule;
  return raw !== undefined && raw !== null && raw !== '';
}

/**
 * The step's settings after choosing a way to start. One start step starts
 * the process one way, so the others are cleared: the engine refuses a
 * schedule beside a message or signal name.
 */
export function chooseStartTrigger(
  trigger: StartTrigger,
  data: StartStepData,
  timeZone?: string,
): StartStepData {
  const cleared: StartStepData = { startedBy: trigger, messageName: '', signalName: '', start_schedule: undefined };
  switch (trigger) {
    case 'message':
      return { ...cleared, messageName: asText(data.messageName) };
    case 'signal':
      return { ...cleared, signalName: asText(data.signalName) };
    case 'schedule':
      return { ...cleared, start_schedule: readSchedule(data.start_schedule) ?? defaultSchedule(timeZone) };
    default:
      return cleared;
  }
}

/** The step's schedule, when it starts on one and the schedule can be read. */
export function scheduleOf(data: StartStepData): StartSchedule | undefined {
  return hasSchedule(data) ? readSchedule(data.start_schedule) : undefined;
}

/**
 * What would stop this start step starting anything, or an empty list.
 * A deploy check and the panel both read it.
 */
export function startTriggerProblems(data: StartStepData): string[] {
  switch (startTriggerOf(data)) {
    case 'message':
      return asText(data.messageName).trim() === '' ? ['Give the message a name, or nothing will start this process.'] : [];
    case 'signal':
      return asText(data.signalName).trim() === '' ? ['Give the signal a name, or nothing will start this process.'] : [];
    case 'schedule': {
      const schedule = scheduleOf(data);
      return schedule ? scheduleProblems(schedule) : ['The schedule cannot be read. Choose when it runs again.'];
    }
    default:
      return [];
  }
}
