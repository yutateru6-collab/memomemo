import { test, expect } from '@playwright/test';

test.describe('school memo and calendar smoke', () => {
  test('can save a school lesson and see it on the calendar', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '学校' }).click();
    await expect(page.getByRole('heading', { name: '学校メモ' })).toBeVisible();

    await page.getByLabel('何の授業をするか').fill('時制② 現在完了');
    await page.getByLabel('どう進めるか').fill('前回復習 → 解説 → 演習');
    await page.getByLabel('何を配布するか').fill('時制②プリント');
    await page.getByLabel('最初の小テスト').fill('単語730〜750');
    await page.getByLabel('次回何をするか').fill('Workbook Exercise 3');
    await page.getByRole('button', { name: '授業メモを保存' }).click();
    await expect(page.getByText('授業メモを保存しました')).toBeVisible();

    await page.getByRole('button', { name: 'カレンダー' }).last().click();
    await expect(page.getByRole('heading', { name: 'カレンダー' })).toBeVisible();
    await expect(page.getByText('2-3 授業')).toBeVisible();
  });

  test('existing memo can be reopened and appended to', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'メモ' }).click();
    await page.getByRole('button', { name: /新規メモ/ }).first().click();

    const editor = page.locator('textarea').first();
    await editor.fill('最初の内容');
    await page.getByRole('button', { name: '保存' }).first().click();
    await page.getByRole('button', { name: /メモ一覧/ }).click();

    await page.getByText('最初の内容').first().click();
    await editor.fill('最初の内容\nあとから追加した内容');
    await page.getByRole('button', { name: '保存' }).first().click();
    await expect(editor).toHaveValue(/あとから追加した内容/);
  });
});
