const { test, expect } = require('@playwright/test');

test('Profile page should load and display Profile text', async ({page}) => {
  await page.goto('http://localhost:3000');

  // Set localStorage as if logged in
  await page.evaluate(() => {
    localStorage.setItem('userEmail', 'test@gmail.com');
    localStorage.setItem('userName', 'test');
  });

  // Now go directly to profile page
  await page.goto('http://localhost:3000/profile.html');

  // Verify the profile page
  await expect(page.locator('h1')).toHaveText('Your Profile');
  await expect(page.locator('#profileName')).toHaveText('test');
  await expect(page.locator('#profileEmail')).toHaveText('test@gmail.com');

});

