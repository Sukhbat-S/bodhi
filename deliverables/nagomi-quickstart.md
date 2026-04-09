# Nagomi Reservation Backend — 10-Minute Quickstart

~10 min total. At the end you'll have a live reservation webhook that appends rows to a Google Sheet every time a guest submits the form.

---

## Step 1: Create the Google Sheet (2 min)

1. Open a new tab and go to **https://sheets.new** — a blank spreadsheet opens.
2. Click the title "Untitled spreadsheet" at the top-left and rename it **`Nagomi Reservations`**.
3. Click cell **A1** and type the following headers across row 1, one per column:

   ```
   Timestamp | Name | Phone | People | Date | Time | Branch
   ```

   Columns A–G in that exact order. (The script also creates this row automatically, but having it pre-set avoids confusion.)

---

## Step 2: Open Apps Script and paste the code (2 min)

Exact click sequence:

1. **Extensions** (menu bar) → **Apps Script** — a new tab opens with the editor.
2. In the editor you'll see a file `Code.gs` with a stub `function myFunction() {}`.
3. Select all the default content and **delete it**.
4. Open `deliverables/nagomi-apps-script.md` and **paste the entire code block** (Section 1) into `Code.gs`.
5. Press **Ctrl+S** (Windows/Linux) or **Cmd+S** (Mac) to save. When prompted for a project name, enter **`Nagomi Reservation Handler`** and click OK.

---

## Step 3: Deploy as Web App (3 min)

Exact click sequence:

1. Click the blue **Deploy** button (top-right) → **New deployment**.
2. Click the **gear icon ⚙** next to "Select type" → **Web app**.
3. Fill in the form:
   - **Description:** `Nagomi reservation v1`
   - **Execute as:** **Me** (your Google account)
   - **Who has access:** **Anyone** ⚠️ Must be **`Anyone`**, not "Anyone with Google account" — the stricter option blocks unauthenticated POSTs and breaks CORS.
4. Click **Deploy**.
5. An authorization flow starts:
   - Click **Authorize access**.
   - Pick your Google account.
   - Click **Advanced** (bottom-left of the warning screen).
   - Click **Go to Nagomi Reservation Handler (unsafe)**.
   - Click **Allow**.
6. A success dialog appears with the Web app URL. Click **Done**.

---

## Step 4: Copy the webhook URL and paste it into index.html (1 min)

The URL from Step 3 has this exact format:

```
https://script.google.com/macros/s/AKfycb.../exec
```

Copy it. Then open:

```
/Users/macbookpro/Documents/agency/nagomi/index.html
```

Find **line 429**. Replace the `REPLACE_ME` placeholder:

**Before:**
```javascript
    const WEBHOOK_URL = 'https://script.google.com/macros/s/REPLACE_ME/exec';
```

**After:**
```javascript
    const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

(Use your actual deployment ID in place of `AKfycb...`.)

Save the file.

---

## Step 5: Test it works (2 min)

**Terminal test — confirm the webhook accepts POSTs:**

Replace `YOUR_WEB_APP_URL` with your URL and run:

```bash
curl -L -X POST 'YOUR_WEB_APP_URL' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"people":2,"date":"2026-04-15","time":"19:00","name":"Test","phone":"99112233","branch":"Sukhbaatar","timestamp":"2026-04-09T12:00:00Z"}'
```

Expected response:
```json
{"success":true,"message":"Reservation saved"}
```

The `-L` flag is required — Apps Script redirects to `script.googleusercontent.com` and without `-L` curl returns empty output.

**Browser test — confirm the form works end to end:**

1. Open `index.html` in a browser (or the deployed Vercel URL).
2. Fill in the reservation form with any test data and submit.
3. Switch to the `Nagomi Reservations` spreadsheet, click the **`Reservations`** sheet tab at the bottom.
4. A new row should appear: `[timestamp] | [name] | [phone] | [people] | [date] | [time] | [branch]`.

If the row is there, the integration is live.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `CORS error` in browser console (or form silently fails) | Deployed with "Anyone with Google account" instead of "Anyone" | Go to Apps Script → Deploy → Manage deployments → edit → change "Who has access" to **Anyone** → redeploy |
| Authorization prompt appears every time you test | You haven't clicked through the "Go to project (unsafe) → Allow" flow yet | Re-run Step 3 authorization — you only need to do this once |
| Row lands in the sheet but column order is wrong | `appendRow` arguments were reordered | Restore: `sheet.appendRow([timestamp, name, phone, people, date, time, branch])` — that exact order matches `HEADERS` |
