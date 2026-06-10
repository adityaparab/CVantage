import { MongoClient } from 'mongodb';
import { expect, test } from '@playwright/test';

import { register, uniqueUser } from '../helpers';

const MONGO = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/cvantage-e2e';

async function promoteToAdmin(email: string): Promise<void> {
  const client = await MongoClient.connect(MONGO);
  try {
    await client.db().collection('users').updateOne({ email }, { $set: { role: 'admin' } });
  } finally {
    await client.close();
  }
}

test('admin: search a user, deactivate them, add + disable a model', async ({ page }) => {
  // victim account
  const victim = uniqueUser();
  await page.goto('/register');
  await page.getByLabel(/Full name/).fill(victim.fullName);
  await page.getByLabel(/Email/).fill(victim.email);
  await page.getByLabel(/^Password/).fill(victim.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('button', { name: 'Sign out' }).click();

  // admin account (promoted directly - registration only makes candidates)
  const admin = await register(page);
  await promoteToAdmin(admin.email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel(/Email/).fill(admin.email);
  await page.getByLabel(/Password/).fill(admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin/);

  // users: search + deactivate
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Search users').fill(victim.email);
  await expect(page.getByText(victim.fullName)).toBeVisible();
  await page.getByRole('button', { name: `Deactivate ${victim.fullName}` }).click();
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('deactivated')).toBeVisible();

  // settings: add a model (fake validator accepts), disable it
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Model name').fill('gpt-4o');
  await page.getByLabel('API key').fill('sk-e2e-key-3kF9');
  await page.getByRole('button', { name: /Validate & add/ }).click();
  await expect(page.getByText('••••3kF9')).toBeVisible();
  await page.getByRole('button', { name: 'Disable' }).click();
  await expect(page.getByText('disabled')).toBeVisible();
});
