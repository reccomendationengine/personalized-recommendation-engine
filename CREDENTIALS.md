# Login Credentials

## Test User Accounts

### Primary Test Account
- **Email**: `testuser@demo.com`
- **Password**: `Test123`
- **Username**: TestUser

### Additional Test Accounts
- **Email**: `test@example.com`
- **Password**: `Test123` (may need to be reset)
- **Username**: testuser

- **Email**: `test1@gmail.com`
- **Password**: `Test123` (may need to be reset)
- **Username**: test1

- **Email**: `demo@test.com`
- **Password**: `Test123` (may need to be reset)
- **Username**: Demo User

## Where to Find Credentials in Cursor Files

### 1. **Database File**
   - **Location**: `data/user-demo.db`
   - **How to view**: Use SQLite browser or command line:
     ```bash
     sqlite3 data/user-demo.db "SELECT email, username FROM users;"
     ```

### 2. **This File (CREDENTIALS.md)**
   - **Location**: `CREDENTIALS.md` (in project root)
   - Contains all test account credentials

### 3. **Code Files**
   - **Location**: `index.js` (lines 182-250)
   - Contains signup endpoint where users are created
   - Password hashes are stored in the database

### 4. **Database Schema**
   - **Location**: `schema.sql`
   - Shows the users table structure
   - Users table has: `id`, `username`, `email`, `password_hash`, `created_at`

## How to Create New Test Users

### Option 1: Use Signup Page
1. Go to: `http://localhost:3000/signup.html`
2. Fill in the form:
   - Username: (any name)
   - Email: (any email)
   - Password: Must be at least 6 characters with uppercase, lowercase, and number
3. Click "Sign up"

### Option 2: Direct Database Insert (Advanced)
```bash
# Generate password hash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword', 10).then(hash => console.log(hash));"

# Insert into database
sqlite3 data/user-demo.db "INSERT INTO users (username, email, password_hash) VALUES ('NewUser', 'newuser@test.com', 'HASH_HERE');"
```

## Server Information

- **URL**: http://localhost:3000 (or http://localhost:3001 if 3000 is in use)
- **Login Page**: http://localhost:3000/login.html
- **Dashboard**: http://localhost:3000/dashboard.html
- **Music Recommendations**: http://localhost:3000/music-recommendations.html

## Notes

- All passwords are hashed using bcrypt (10 rounds)
- Passwords must be at least 6 characters
- Passwords must contain: uppercase letter, lowercase letter, and number
- Session cookies last 24 hours
- If you forget a password, you can reset it in the database or create a new account

