import { expect, test } from '@playwright/test';

import { register, uniqueUser } from '../helpers';

test('register -> dashboard -> logout -> login round-trip', async ({ page }) => {
  const user = await register(page);
  await expect(page.getByText('Dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel(/Email/).fill(user.email);
  await page.getByLabel(/Password/).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('bad credentials show the generic error', async ({ page }) => {
  const user = uniqueUser();
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(user.email);
  await page.getByLabel(/Password/).fill('Wrong-Pass-99');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
});

test('theme toggle persists across reload', async ({ page }) => {
  await page.goto('/');
  const initial = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const flipped = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(flipped).not.toBe(initial);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(flipped);
});
