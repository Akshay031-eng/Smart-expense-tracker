# Deploying Smart Expense Tracker

| Part | Where | Cost |
|---|---|---|
| Database | **MongoDB Atlas** M0 cluster | Free |
| App (Express + EJS) | **Render** web service | Free |
| Code + CI | **GitHub** + Actions | Free |

The whole app is one Node.js server (pages are rendered by EJS), so a single Render service is enough.

---

## 1. Database: MongoDB Atlas

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) → **Create** a cluster → choose **M0 (Free)** → provider AWS, region **Mumbai (ap-south-1)** or the one closest to you → **Create deployment**.
2. **Database user:** Atlas asks you to create one. Pick a username and click **Autogenerate Secure Password**, then **copy the password** somewhere safe.
3. **Network access:** Security → **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`) → Confirm.
   Render's free plan has no fixed IP, so this is needed. The database user's password still protects the data.
4. **Connection string:** Database → **Connect** → **Drivers** → copy the string. It looks like this:
   ```
   mongodb+srv://USER:<db_password>@cluster0.abcde. mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
   Replace `<db_password>` with the password and add a database name after `.net/`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/smart_expense_tracker?retryWrites=true&w=majority
   ```
   If the password contains `@ : / ? #`, URL-encode it (or generate one without those characters).

To use Atlas locally too, put the same string in `MONGODB_URI` in your `.env`.

---

## 2. Push to GitHub

Create an **empty** repository on GitHub (no README), then in the project folder:

```powershell
git init
git add .
git status            # .env must NOT be in the list (it is in .gitignore)
git commit -m "Smart Expense Tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/smart-expense-tracker.git
git push -u origin main
```

The **Actions** tab runs the CI workflow: tests against a real MongoDB 7, plus a start-up check. It should turn green.

---

## 3. App: Render

**Option A, Blueprint (fastest):** Render → **New → Blueprint** → choose the repo. Render reads `render.yaml`. Paste your `MONGODB_URI` when asked; `SESSION_SECRET` is generated automatically. Click **Apply**.

**Option B, by hand:** Render → **New → Web Service** → connect the repo:

| Field | Value |
|---|---|
| Language | **Node** |
| Branch | `main` |
| Region | Singapore (closest to India) |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Instance type | **Free** |
| Health check path (Advanced) | `/health` |

Environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas connection string |
| `SESSION_SECRET` | a random string of 32+ characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_TIMEZONE` | `Asia/Kolkata` (optional) |

Deploy. When it says **Live**, open `https://YOUR-APP.onrender.com/health`. You should see:

```json
{"status":"ok","database":"connected"}
```

Then open the site and click **Try the demo**. The demo account and its sample data are created on the first click.

> **Free instance:** sleeps after 15 minutes without traffic; the next visit takes up to a minute.
> Open the site a couple of minutes before showing it to someone.

---

## 4. After deploying

- Replace `YOUR_GITHUB_USERNAME` and `YOUR-APP` in `README.md` (CI badge and live link), then commit and push.
- Every push to `main` redeploys automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Render log: `SESSION_SECRET must be set` | Add `SESSION_SECRET` (32+ characters) in Render → Environment. |
| Render log: `Could not connect to MongoDB` | Check `MONGODB_URI` (password, database name) and Atlas Network Access `0.0.0.0/0`. |
| `bad auth : authentication failed` | Wrong database user or password; reset the password in Atlas → Database Access. |
| Login works but you're logged out immediately | `NODE_ENV=production` needs HTTPS (secure cookies). Use the `https://` Render URL. |
| "Your form expired or was sent from another site" | The page was open across a restart or the session ended; refresh and submit again. |
| Deploy fails on `npm ci` | Make sure `package-lock.json` is committed. |
