import { describe, expect, it } from 'bun:test';

import { chooseStartTrigger, scheduleOf, startTriggerOf, startTriggerProblems } from './startTrigger';

const daily = { every: 'day', at: '09:00', time_zone: 'UTC' };

describe('what starts a process', () => {
  it('goes by what the engine reads', () => {
    expect(startTriggerOf({})).toBe('manual');
    expect(startTriggerOf({ messageName: 'order-placed' })).toBe('message');
    expect(startTriggerOf({ signalName: 'day-closed' })).toBe('signal');
    expect(startTriggerOf({ start_schedule: daily })).toBe('schedule');
  });

  it("is not what an older panel saved, where that started nothing", () => {
    // "On a schedule" used to be a note the engine never read.
    expect(startTriggerOf({ startedBy: 'timer' })).toBe('manual');
    // The engine's settings win over a stale note.
    expect(startTriggerOf({ startedBy: 'manual', messageName: 'order-placed' })).toBe('message');
  });

  it('remembers a choice whose name is not typed yet', () => {
    expect(startTriggerOf({ startedBy: 'message', messageName: '' })).toBe('message');
    expect(startTriggerOf({ startedBy: 'signal' })).toBe('signal');
  });
});

describe('choosing a way to start', () => {
  it('clears the other ways, so one start step starts one way', () => {
    const before = { messageName: 'order-placed', signalName: '', start_schedule: undefined };
    expect(chooseStartTrigger('schedule', before, 'Asia/Jakarta')).toEqual({
      startedBy: 'schedule',
      messageName: '',
      signalName: '',
      start_schedule: { every: 'weekday', at: '09:00', time_zone: 'Asia/Jakarta' },
    });
    expect(chooseStartTrigger('manual', { start_schedule: daily })).toEqual({
      startedBy: 'manual',
      messageName: '',
      signalName: '',
      start_schedule: undefined,
    });
  });

  it('keeps the name or schedule already there for the way chosen', () => {
    expect(chooseStartTrigger('message', { messageName: 'order-placed' }).messageName).toBe('order-placed');
    expect(chooseStartTrigger('schedule', { start_schedule: daily }).start_schedule).toEqual(daily);
  });
});

describe('a start step that would start nothing', () => {
  it('is a message or signal with no name', () => {
    expect(startTriggerProblems({ startedBy: 'message' })[0]).toContain('Give the message a name');
    expect(startTriggerProblems({ startedBy: 'signal', signalName: '  ' })[0]).toContain('Give the signal a name');
  });

  it('is a schedule that cannot run or cannot be read', () => {
    expect(startTriggerProblems({ start_schedule: { every: 'week', at: '09:00', time_zone: 'UTC' } })[0]).toContain('at least one day');
    expect(startTriggerProblems({ start_schedule: '0 9 * * *' })[0]).toContain('cannot be read');
    expect(scheduleOf({ start_schedule: '0 9 * * *' })).toBeUndefined();
  });

  it('is none of the ways that work', () => {
    expect(startTriggerProblems({})).toEqual([]);
    expect(startTriggerProblems({ messageName: 'order-placed' })).toEqual([]);
    expect(startTriggerProblems({ start_schedule: daily })).toEqual([]);
  });
});
