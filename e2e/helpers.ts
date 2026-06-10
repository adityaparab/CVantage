import { expect, type Page } from '@playwright/test';

let counter = 0;

export const uniqueUser = () => {
  counter += 1;
  return {
    fullName: `E2E Tester ${Date.now()}-${counter}`,
    email: `e2e-${Date.now()}-${counter}@cvantage.test`,
    password: 'Engine-4242X',
  };
};

export async function register(page: Page): Promise<ReturnType<typeof uniqueUser>> {
  const user = uniqueUser();
  await page.goto('/register');
  await page.getByLabel(/Full name/).fill(user.fullName);
  await page.getByLabel(/Email/).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return user;
}

export async function createResume(page: Page, name: string): Promise<void> {
  await page.goto('/resumes/new');
  await page.getByLabel(/Resume name/).fill(name);
  await page.getByLabel(/Full name/).fill('Ada Lovelace');
  await page.getByLabel(/Professional title/).fill('Senior Software Engineer');
  await page.getByRole('button', { name: 'Save resume' }).click();
  await expect(page).toHaveURL(/\/resumes\/.+\/edit/);
}

export async function startAnalysis(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Analyze resume' }).click();
  await expect(page).toHaveURL(/\/analyze/);
  await page.getByLabel(/Analysis name/).fill(name);
  await page
    .getByLabel(/Job description/)
    .fill('We are hiring a Senior Platform Engineer for NestJS, MongoDB and CI/CD ownership.');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page).toHaveURL(/\/analyses\//);
}
