import { deployReviewProcess, sampleProjectId } from '../support/api';
import { Designer } from '../support/designer';
import { expect, test, uniqueName } from '../support/test';

/**
 * The start step: what its panel says starts the process is what starts it.
 *
 * The panel used to save the choice as a note the engine never read, so
 * "On a schedule" and "Another system sends a message" started nothing.
 * Each test here chooses a way to start in the designer and then waits for
 * the engine to start a run that way, with nobody pressing Run.
 */
test.describe('how a process starts', () => {
  test('a message name typed on the start step starts a run when that message arrives', async ({ page, api }) => {
    const name = uniqueName('E2E message start');
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const projectId = await sampleProjectId(api);
    await deployReviewProcess(api, projectId, key, name, 'Look at the order', []);

    const designer = new Designer(page);
    await designer.openFromProcesses(name);
    const setup = await designer.openTab('Request received', 'Setup');
    await setup.getByRole('combobox', { name: 'How this process starts' }).click();
    await page.getByRole('option', { name: 'A message arrives' }).click();
    // Chosen and not yet named: the panel says nothing would start it.
    await expect(setup.getByText('Give the message a name, or nothing will start this process.')).toBeVisible();
    const message = `${key}_placed`;
    await setup.getByRole('textbox', { name: 'Message name' }).fill(message);
    await expect(setup.getByText('Give the message a name, or nothing will start this process.')).toHaveCount(0);
    await designer.deploy('v2');

    const sent = await api.post('/api/v1/processes/message', {
      data: { project_id: projectId, message_name: message, variables: {} },
    });
    expect(sent.ok(), `sending ${message}: ${await sent.text()}`).toBe(true);

    await page.goto('/instances');
    await expect(page.getByRole('row', { name: new RegExp(name) }).first()).toContainText('Running');

    // And the designer shows the choice again when the process is reopened.
    await designer.openFromProcesses(name);
    const reopened = await designer.openTab('Request received', 'Setup');
    await expect(reopened.getByRole('combobox', { name: 'How this process starts' })).toHaveValue('A message arrives');
    await expect(reopened.getByRole('textbox', { name: 'Message name' })).toHaveValue(message);
  });

  test('a schedule chosen on the start step starts a run by itself', async ({ page, api }) => {
    // The shortest schedule is every minute, and the engine starts the run
    // within its poll of the minute turning.
    test.setTimeout(150_000);
    const name = uniqueName('E2E scheduled start');
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    await deployReviewProcess(api, await sampleProjectId(api), key, name, 'Read the report', []);

    const designer = new Designer(page);
    await designer.openFromProcesses(name);
    const setup = await designer.openTab('Request received', 'Setup');
    await setup.getByRole('combobox', { name: 'How this process starts' }).click();
    await page.getByRole('option', { name: 'On a schedule' }).click();
    // It starts as a schedule that can run, with its next times written out.
    await expect(setup.getByText(/^Every weekday at 09:00 \(/)).toBeVisible();
    await expect(setup.getByRole('list', { name: 'Next runs' }).getByRole('listitem')).toHaveCount(3);

    await setup.getByRole('combobox', { name: 'Runs' }).click();
    await page.getByRole('option', { name: 'Every few minutes, hours or days' }).click();
    await setup.getByRole('combobox', { name: 'Unit of time' }).click();
    await page.getByRole('option', { name: 'minutes' }).click();
    await setup.getByRole('textbox', { name: 'Every' }).fill('1');
    await expect(setup.getByText(/^Every minute \(/)).toBeVisible();
    await designer.deploy('v2');

    await expect(async () => {
      await page.goto('/instances');
      await expect(page.getByRole('row', { name: new RegExp(name) }).first()).toContainText('Running', { timeout: 3_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    // Reopened, the schedule is still the one that is running.
    await designer.openFromProcesses(name);
    const reopened = await designer.openTab('Request received', 'Setup');
    await expect(reopened.getByRole('combobox', { name: 'How this process starts' })).toHaveValue('On a schedule');
    await expect(reopened.getByText(/^Every minute \(/)).toBeVisible();
  });

  test('a schedule can be paused and resumed from the version history', async ({ page, api }) => {
    const name = uniqueName('E2E paused schedule');
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    await deployReviewProcess(api, await sampleProjectId(api), key, name, 'Read the report', []);

    const designer = new Designer(page);
    await designer.openFromProcesses(name);
    const setup = await designer.openTab('Request received', 'Setup');
    await setup.getByRole('combobox', { name: 'How this process starts' }).click();
    await page.getByRole('option', { name: 'On a schedule' }).click();
    await expect(setup.getByText(/^Every weekday at 09:00 \(/)).toBeVisible();
    await designer.deploy('v2');

    await page.goto('/models?tab=processes');
    await page.getByRole('button', { name: `More for ${name}` }).click();
    await page.getByRole('menuitem', { name: `Version history of ${name}` }).click();
    const history = page.getByRole('dialog', { name: `Version history: ${key}` });
    // The live version has a schedule, so the dialog says when it next runs.
    await expect(history.getByText('Starts on a schedule')).toBeVisible();
    await expect(history.getByText(/^Next run on .+, 09:00 \(in .+\)\.$/)).toBeVisible();

    await history.getByRole('button', { name: 'Pause schedule' }).click();
    await expect(history.getByText('The schedule is paused', { exact: true })).toBeVisible();
    await expect(history.getByText(/^Paused on .+\. Nothing starts by itself until you resume it\./)).toBeVisible();
    await expect(history.getByText(/^Next run on/)).toHaveCount(0);

    // The pause is the process's, so it is still there when the page is loaded again.
    await page.reload();
    await page.getByRole('button', { name: `More for ${name}` }).click();
    await page.getByRole('menuitem', { name: `Version history of ${name}` }).click();
    await expect(history.getByText('The schedule is paused', { exact: true })).toBeVisible();

    await history.getByRole('button', { name: 'Resume schedule' }).click();
    await expect(history.getByText('Starts on a schedule')).toBeVisible();
    await expect(history.getByText(/^Next run on .+, 09:00 \(in .+\)\.$/)).toBeVisible();
  });
});
