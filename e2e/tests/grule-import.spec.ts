import { expect, test } from '../support/test';

// A Grule rule set, as somebody would bring it from a Go service: two rules
// that translate, and one that calls a method FEEL has no equal for.
const rules = `
rule Gold "Gold customers get twenty off" salience 30 {
    when Customer.Tier == "gold" && Order.Discount == 0
    then Order.Discount = Order.Total * 0.2;
}
rule Silver salience 20 {
    when Customer.Tier == "silver" && Order.Discount == 0
    then Order.Discount = 10;
}
rule Audit { when Order.Total > 1000 then Order.Audit = Customer.Name.Trim(); Retract("Audit"); }
`;

test.describe('importing Grule rules', () => {
  test('shows what each rule becomes, then makes the tables and opens the process', async ({ page }) => {
    const key = `grule-${Date.now().toString(36)}`;
    await page.goto('/models?tab=processes');
    await page.getByRole('button', { name: 'Import Grule rules' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Grule rules' });

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'discounts.grl',
      mimeType: 'text/plain',
      buffer: Buffer.from(rules),
    });
    // Suggested from the file's name; replaced so a second run does not collide.
    await expect(dialog.getByRole('textbox', { name: 'Key' })).toHaveValue('discounts');
    await dialog.getByRole('textbox', { name: 'Key' }).fill(key);

    await dialog.getByRole('button', { name: 'Check rules' }).click();
    await expect(dialog.getByText('2 of 3 rules in 1 decision table; 1 left out')).toBeVisible();
    await expect(dialog.getByRole('row', { name: /Gold/ })).toContainText(key);
    await expect(dialog.getByRole('row', { name: /Audit/ })).toContainText('Left out');

    // Nothing is stored by the check.
    await dialog.getByRole('button', { name: 'Import and deploy' }).click();
    await expect(page).toHaveURL(/\/designer\?definitionId=/);

    await page.goto('/models?tab=decisions');
    await page.getByRole('textbox', { name: 'Search decisions' }).fill(key);
    await expect(page.getByRole('row', { name: new RegExp(key) })).toBeVisible();
  });

  test('a broken file is refused, naming the file and the line', async ({ page }) => {
    await page.goto('/models?tab=processes');
    await page.getByRole('button', { name: 'Import Grule rules' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import Grule rules' });

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'broken.grl',
      mimeType: 'text/plain',
      buffer: Buffer.from('rule A {\n  when\n  then X.Y = 1;\n}'),
    });
    await dialog.getByRole('button', { name: 'Check rules' }).click();
    await expect(dialog.getByText(/broken\.grl: rule A: line 3/)).toBeVisible();
  });
});
