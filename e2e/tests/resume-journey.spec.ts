import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createResume, register, startAnalysis } from '../helpers';

test('create resume via the form, then run a full analysis with bell behavior', async ({ page }) => {
  await register(page);
  await createResume(page, 'Browser Journey Resume');

  await startAnalysis(page, 'Journey @ Acme');
  // 3-step progress appears, then results render (fake LLM is fast)
  await expect(page.getByText(/Improvement suggestions/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('meter', { name: 'Overall match' })).toHaveText(/\d+/);

  // bell: completed entry exists, click-through stays here, clear empties it
  await page.goto('/dashboard');
  const bell = page.getByRole('button', { name: /Notifications/ });
  await expect(bell).toHaveAccessibleName(/active/, { timeout: 15_000 });
  await bell.click();
  await page.getByRole('button', { name: /Clear notification/ }).first().click();
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
});

test('upload fixture -> AI parse -> review screen -> save', async ({ page }) => {
  await register(page);
  await page.goto('/resumes/upload');
  await page
    .getByLabel('Choose resume file')
    .setInputFiles(join(__dirname, '..', 'fixtures', 'sample-resume.pdf'));
  await expect(page).toHaveURL(/\/review/, { timeout: 45_000 });
  await expect(page.getByText(/Original extracted text/).first()).toBeVisible();
  const title = page.getByLabel(/Professional title/).first();
  await title.fill('Staff Engineer');
  await page.getByRole('button', { name: 'Save corrections' }).first().click();
  await expect(page.getByText(/start an analysis now/i)).toBeVisible();
});

test('apply a suggestion and download the DOCX export', async ({ page }) => {
  await register(page);
  await createResume(page, 'Apply & Export Resume');
  await startAnalysis(page, 'Export @ Acme');
  await expect(page.getByText(/Improvement suggestions/i)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: /Apply suggestions/ }).click();
  await page.getByRole('button', { name: /Apply: Mirror the job title/ }).click();
  await expect(page.getByText('Suggestion applied to your resume')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download/ }).click();
  await page.getByRole('menuitem', { name: /Word/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
