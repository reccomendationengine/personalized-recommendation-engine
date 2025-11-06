const { test, expect } = require('@playwright/test');

test('Navigation through the web app works', async ({page}) => {

  // Simulate logged-in user
  await page.goto('http://localhost:3000');
  
  await page.evaluate(() => {
    localStorage.setItem('userEmail', 'test@gmail.com');
    localStorage.setItem('userName', 'test');
  });

  // Go to Profile page
  await page.goto('http://localhost:3000/profile.html');
  await expect(page.locator('h1')).toHaveText('Your Profile');
  
  // Navigate back to Dashboard
  await page.click('.back-btn');
  await expect(page).toHaveURL(/dashboard.html/);
  await expect(page.locator('h1')).toHaveText('Welcome to Your Dashboard');


});