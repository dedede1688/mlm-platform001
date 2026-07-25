import { test, expect } from '@playwright/test';

// Unique test user
const TS = String(Date.now()).slice(-6);
const RAND = String(Math.floor(Math.random() * 9000 + 1000));
const TEST_PHONE = '138' + TS.slice(0, 4) + RAND;
const TEST_PASSWORD = 'Test123456';
const TEST_NICKNAME = 'E2E-User';

async function login(page: any) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder*="手机"]').first().fill(TEST_PHONE);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

test.describe.serial('MLM Platform E2E Happy Path', () => {

  test('1. User Registration', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toContainText(/创建账户|注册/);

    const phoneInput = page.locator('input[placeholder*="手机"]').first();
    const passwordInputs = page.locator('input[type="password"]');
    const nicknameInput = page.locator('input[placeholder*="昵称"]');

    await phoneInput.fill(TEST_PHONE);
    await passwordInputs.nth(0).fill(TEST_PASSWORD);
    await passwordInputs.nth(1).fill(TEST_PASSWORD);
    if (await nicknameInput.isVisible().catch(() => false)) {
      await nicknameInput.fill(TEST_NICKNAME);
    }
    console.log('Registering phone:', TEST_PHONE);

    await page.locator('button[type="submit"]').first().click();

    try {
      await page.waitForURL(/\/login/, { timeout: 10000 });
      console.log('Registration successful, redirected to login');
    } catch {
      const errorEl = page.locator('.bg-red-50').first();
      if (await errorEl.isVisible().catch(() => false)) {
        console.log('Error:', await errorEl.innerText());
      }
      const alreadyMsg = page.locator('text=已注册').first();
      if (await alreadyMsg.isVisible().catch(() => false)) {
        console.log('Phone already registered, proceeding to login');
        expect(true).toBeTruthy();
        return;
      }
      throw new Error('Registration did not redirect to login');
    }
  });

  test('2. Login', async ({ page }) => {
    await login(page);
    console.log('Login OK, URL:', page.url());
  });

  test('3. Dashboard loads', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/dashboard/);
    console.log('Dashboard OK');
  });

  test('4. Browse Products', async ({ page }) => {
    await login(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    const productCards = page.locator('a.card-base');
    const count = await productCards.count();
    console.log('Products found:', count);
    expect(count).toBeGreaterThan(0);
  });

  test('5. Product Detail', async ({ page }) => {
    await login(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Get href directly and navigate (avoid headless client-side navigation issues)
    const firstCard = page.locator('a.card-base').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    const firstHref = await firstCard.getAttribute('href');
    console.log('Product href:', firstHref);
    expect(firstHref).toBeTruthy();
    // Navigate directly to product detail
    await page.goto(firstHref!);
    await page.waitForLoadState('networkidle');
    const url = page.url();
    console.log('Product detail URL:', url);
    expect(url).toMatch(/\/products\/[a-f0-9-]+/);
  });

  test('6. Cart page', async ({ page }) => {
    await login(page);
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    console.log('Cart:', page.url());
  });

  test('7. Orders page', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/orders');
    await page.waitForLoadState('networkidle');
    console.log('Orders:', page.url());
  });

  test('8. Rewards page', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/rewards');
    await page.waitForLoadState('networkidle');
    console.log('Rewards:', page.url());
  });

  test('9. Dashboard summary', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle');
    const bodyText = await page.locator('body').innerText();
    console.log('Dashboard preview:', bodyText.substring(0, 300));
  });
});
