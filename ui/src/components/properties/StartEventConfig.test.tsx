/**
 * The start step's panel: what starts the process, as the engine reads it.
 *
 * The panel used to save its choice as a note the engine never read, so
 * choosing "On a schedule" or "Another system sends a message" started
 * nothing. It now shows and writes the engine's own settings.
 */
import { describe, expect, it } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { labelledControl, visibleText } from '../../testing/markup';
import { renderMarkup } from '../../testing/renderMarkup';
import type { BPMNNodeData } from '../../types/bpmn';
import { StartEventConfig } from './StartEventConfig';
import { StartScheduleEditor } from './StartScheduleEditor';

const start = (settings: Record<string, unknown>) =>
  ({ label: 'Start', nodeType: 'startEvent', ...settings }) as BPMNNodeData;

const panel = (settings: Record<string, unknown>) =>
  renderMarkup(<StartEventConfig data={start(settings)} onUpdate={() => undefined} />, new QueryClient());

describe('how a process starts', () => {
  it('is by hand when the step says nothing else', () => {
    const html = panel({});
    expect(labelledControl(html, 'Message name')).toBeUndefined();
    expect(labelledControl(html, 'Signal name')).toBeUndefined();
    expect(visibleText(html)).toContain('A person presses Run');
  });

  it('shows the message name the engine listens for', () => {
    const html = panel({ messageName: 'order-placed' });
    expect(labelledControl(html, 'Message name')?.value).toBe('order-placed');
    expect(visibleText(html)).not.toContain('nothing will start this process');
  });

  it('says a message with no name starts nothing', () => {
    const html = panel({ startedBy: 'message' });
    expect(labelledControl(html, 'Message name')?.value).toBe('');
    expect(visibleText(html)).toContain('Give the message a name, or nothing will start this process.');
  });

  it('shows the signal name the engine listens for', () => {
    expect(labelledControl(panel({ signalName: 'day-closed' }), 'Signal name')?.value).toBe('day-closed');
  });

  it("does not show a schedule for an older step's note that started nothing", () => {
    const html = panel({ startedBy: 'timer' });
    expect(labelledControl(html, 'Time zone')).toBeUndefined();
    expect(visibleText(html)).toContain('A person presses Run');
  });

  it('shows the schedule the engine runs', () => {
    const html = panel({ start_schedule: { every: 'weekday', at: '09:00', time_zone: 'Asia/Jakarta' } });
    expect(labelledControl(html, 'At')?.value).toBe('09:00');
    expect(labelledControl(html, 'Time zone')?.value).toBe('Asia/Jakarta');
    expect(visibleText(html)).toContain('Every weekday at 09:00 (Asia/Jakarta)');
    expect(visibleText(html)).toContain('Only the live version runs on its schedule.');
  });

  it('offers a way out of a schedule it cannot read', () => {
    const html = panel({ start_schedule: '0 9 * * *' });
    expect(visibleText(html)).toContain('The schedule cannot be read');
    expect(visibleText(html)).toContain('Choose when it runs again');
  });
});

describe('the schedule editor', () => {
  const editor = (schedule: Parameters<typeof StartScheduleEditor>[0]['schedule']) =>
    visibleText(
      renderMarkup(
        <StartScheduleEditor schedule={schedule} onChange={() => undefined} now={new Date('2026-11-13T10:00:00+07:00')} />,
        new QueryClient(),
      ),
    );

  it("names the next runs on the schedule's own clock", () => {
    const text = editor({ every: 'weekday', at: '09:00', time_zone: 'Asia/Jakarta' });
    expect(text).toContain('Next runs, on the Asia/Jakarta clock:');
    // Friday 13th at 10:00 is past nine, and the weekend is skipped.
    expect(text).toContain('Mon, 16 Nov 2026, 09:00');
    expect(text).toContain('Tue, 17 Nov 2026, 09:00');
    expect(text).toContain('Wed, 18 Nov 2026, 09:00');
  });

  it('says what is wrong in place of run times', () => {
    const text = editor({ every: 'week', days: [], at: '09:00', time_zone: 'Asia/Jakarta' });
    expect(text).toContain('This schedule cannot run yet');
    expect(text).toContain('Choose at least one day of the week.');
    expect(text).not.toContain('Next runs');
  });

  it('says a schedule past its last date will not run again', () => {
    const text = editor({ every: 'day', at: '09:00', time_zone: 'UTC', until: '2026-01-31' });
    expect(text).toContain('Its last date has passed, so it will not run again.');
  });
});

describe('what a process starts with', () => {
  const amount = { id: 'amount', label: 'Amount', type: 'number', required: true };
  const schedule = { every: 'day', at: '09:00', time_zone: 'UTC' };

  it('says a start with no inputs takes whatever it is given', () => {
    expect(visibleText(panel({}))).toContain('With no inputs, a run starts with whatever it is given, or with nothing.');
  });

  it('shows the inputs the engine holds a start to', () => {
    const html = panel({ start_form: [amount] });
    expect(labelledControl(html, 'Field ID (Variable Key)')?.value).toBe('amount');
    expect(visibleText(html)).toContain('A start that leaves out a required one is refused, however it arrives.');
  });

  it('says a scheduled run has nobody to fill in a required input with no default', () => {
    const text = visibleText(panel({ start_schedule: schedule, start_form: [amount] }));
    expect(text).toContain('A scheduled run has nobody to fill these in');
    expect(text).toContain('Give amount a default value, or make it optional.');
  });

  it('says nothing of the kind once the input has a default', () => {
    const text = visibleText(panel({ start_schedule: schedule, start_form: [{ ...amount, defaultValue: 0 }] }));
    expect(text).not.toContain('A scheduled run has nobody to fill these in');
  });

  it('says two inputs with one name cannot be deployed', () => {
    const text = visibleText(panel({ start_form: [amount, { ...amount, label: 'Total' }] }));
    expect(text).toContain('Two inputs are named amount.');
  });

  it('says so when the saved inputs cannot be read', () => {
    expect(visibleText(panel({ start_form: '{not json' }))).toContain('The inputs cannot be read');
  });
});

