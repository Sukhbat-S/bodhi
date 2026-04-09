# Nagomi Reservation Form — Google Apps Script Integration

Production-ready webhook handler that receives reservation form POSTs from the Nagomi landing page and appends rows to a Google Sheet. Copy-paste runnable, no placeholders.

---

## 1. Complete Apps Script Code

Paste this entire block into `Code.gs` in the Apps Script editor.

```javascript
/**
 * Nagomi Reservation Handler
 * Receives reservation form submissions and appends them to a Google Sheet.
 *
 * CORS NOTE (IMPORTANT — read before editing):
 * Google Apps Script web apps deployed with "Anyone" access automatically
 * serve `Access-Control-Allow-Origin: *` on ContentService responses.
 * You CANNOT manually set response headers in Apps Script — the runtime
 * strips them. The only way to make browser POSTs work cross-origin is:
 *
 *   1. Deploy with "Who has access: Anyone" (not "Anyone with Google account")
 *   2. Have the landing page POST with `Content-Type: text/plain;charset=utf-8`
 *      This is a "simple request" per the CORS spec, so the browser skips
 *      the preflight OPTIONS request entirely. Apps Script cannot respond
 *      to preflight requests correctly, so avoiding them is the fix.
 *
 * The request body is still JSON — only the Content-Type header is text/plain.
 * We parse e.postData.contents as JSON inside doPost().
 */

const SHEET_NAME = 'Reservations';
const HEADERS = ['Timestamp', 'Name', 'Phone', 'People', 'Date', 'Time', 'Branch'];

/**
 * Handles POST requests from the reservation form.
 */
function doPost(e) {
  try {
    // Safely parse the JSON body. If the body is missing or malformed,
    // return a structured error instead of throwing a 500.
    let payload;
    try {
      if (!e || !e.postData || !e.postData.contents) {
        throw new Error('Empty request body');
      }
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({
        success: false,
        error: 'Invalid JSON body: ' + parseErr.message
      });
    }

    // Extract fields with safe defaults.
    const people    = payload.people    || '';
    const date      = payload.date      || '';
    const time      = payload.time      || '';
    const name      = payload.name      || '';
    const phone     = payload.phone     || '';
    const branch    = payload.branch    || '';
    const timestamp = payload.timestamp || new Date();

    // Open the spreadsheet and find (or create) the Reservations sheet.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Append the reservation row in the documented column order.
    sheet.appendRow([timestamp, name, phone, people, date, time, branch]);

    return jsonResponse({
      success: true,
      message: 'Reservation saved'
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.message
    });
  }
}

/**
 * Health check — visit the web app URL in a browser to confirm it's live.
 */
function doGet(e) {
  return jsonResponse({
    success: true,
    service: 'Nagomi Reservation Handler',
    status: 'ok',
    time: new Date().toISOString()
  });
}

/**
 * CORS preflight handler. In practice this is rarely invoked because
 * the landing page uses Content-Type: text/plain (a "simple request"
 * that skips preflight). Included defensively so the endpoint does not
 * 404 if some client does send an OPTIONS request.
 */
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Shared JSON response helper.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this ONCE from the Apps Script editor to create the Reservations
 * sheet with the correct header row. After running, check the spreadsheet
 * tab — you should see a "Reservations" sheet with a bold header row.
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  } else {
    sheet.clear();
  }
  sheet.appendRow(HEADERS);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180); // Timestamp
  sheet.setColumnWidth(2, 150); // Name
  sheet.setColumnWidth(3, 130); // Phone
  sheet.setColumnWidth(4, 70);  // People
  sheet.setColumnWidth(5, 110); // Date
  sheet.setColumnWidth(6, 90);  // Time
  sheet.setColumnWidth(7, 140); // Branch
  SpreadsheetApp.getUi().alert('Reservations sheet is ready. You can now deploy the web app.');
}
```

---

## 2. Step-by-Step Deployment Instructions

Follow these steps in order. Do not skip any — step 9 in particular is where most people break CORS.

1. **Create the spreadsheet.** Open a new browser tab, go to [https://sheets.new](https://sheets.new). A blank spreadsheet opens. Click the title "Untitled spreadsheet" at the top-left and rename it to **`Nagomi Reservations`**.

2. **Open the script editor.** In the menu bar, click **Extensions → Apps Script**. A new tab opens with the Apps Script editor.

3. **Paste the code.** In the editor, you'll see a file called `Code.gs` with a stub `function myFunction() {}`. Select all of that default content and delete it. Then paste the entire code block from **Section 1** above into `Code.gs`.

4. **Save and name the project.** Press **Ctrl+S** (Windows/Linux) or **Cmd+S** (Mac). A dialog asks for a project name — enter **`Nagomi Reservation Handler`** and click OK. The file icon should change from red/unsaved to normal.

5. **Run `setupSheet` once to initialize the sheet and grant permissions.**
   - At the top of the editor, find the function dropdown (it says "Select function" or similar). Choose **`setupSheet`**.
   - Click the **Run** button (▶).
   - An **Authorization required** dialog appears. Click **Review permissions**.
   - Pick your Google account.
   - You will see a scary warning: **"Google hasn't verified this app"**. This is normal for personal scripts. Click **Advanced** at the bottom-left, then click **Go to Nagomi Reservation Handler (unsafe)**, then click **Allow**.
   - The function runs. Switch back to the spreadsheet tab — you should now see a second sheet tab at the bottom called **`Reservations`** with a bold header row: `Timestamp | Name | Phone | People | Date | Time | Branch`.

6. **Open the deployment dialog.** Back in the Apps Script editor, click the blue **Deploy** button in the top-right, then **New deployment**.

7. **Choose the deployment type.** In the dialog, click the **gear icon** next to "Select type" and pick **Web app**.

8. **Fill in the deployment form.**
   - **Description:** `Nagomi reservation v1`
   - **Execute as:** **Me (your-email@gmail.com)** — this lets the script write to the sheet using your permissions.
   - **Who has access:** **Anyone** ⚠️ **CRITICAL** — you must pick **`Anyone`**, NOT **`Anyone with Google account`**. The "Anyone with Google account" option blocks unauthenticated POSTs from the landing page and will cause CORS failures. If you only see "Anyone within [organization]", you are signed in with a Workspace account that restricts this — switch to a personal @gmail.com account.

9. **Deploy and copy the URL.** Click **Deploy**. A success dialog appears with the **Web app URL** — it looks like `https://script.google.com/macros/s/AKfycby.../exec`. Click the copy icon next to it and save it somewhere (Notion, a sticky note, the landing page config). **This is the webhook URL.** Click **Done** to close.

10. **Sanity-check in the browser.** Paste the Web app URL into a new browser tab and press Enter. You should see a JSON response like:
    ```json
    {"success":true,"service":"Nagomi Reservation Handler","status":"ok","time":"2026-04-09T..."}
    ```
    If you see an HTML login page or an error, the access setting in step 9 is wrong — redeploy with "Anyone".

11. **Test the POST path with curl.** In a terminal, replace `YOUR_WEB_APP_URL` with the URL from step 9 and run:

    ```bash
    curl -L -X POST 'YOUR_WEB_APP_URL' \
      -H 'Content-Type: text/plain;charset=utf-8' \
      -d '{"people":2,"date":"2026-04-15","time":"19:00","name":"Test","phone":"99112233","branch":"Sukhbaatar","timestamp":"2026-04-09T12:00:00Z"}'
    ```

    The `-L` flag is **critical** — Apps Script responds with a 302 redirect to `script.googleusercontent.com`, and without `-L` curl will stop at the redirect and you'll see empty output. With `-L` you should see:
    ```json
    {"success":true,"message":"Reservation saved"}
    ```

12. **Verify the row landed.** Switch to the `Nagomi Reservations` spreadsheet tab and click the `Reservations` sheet at the bottom. You should see a new row: `[current time] | Test | 99112233 | 2 | 2026-04-15 | 19:00 | Sukhbaatar`. If you see it, the integration is live. 🎉

---

## 3. Webhook URL Format and Frontend Integration

### URL format

The Web app URL always has this shape:

```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

`{DEPLOYMENT_ID}` is a long opaque string starting with `AKfycb...`. It is unique per deployment.

### Redeployment behavior ⚠️

**By default, creating a "New deployment" generates a NEW URL every time.** This will break the landing page if you don't update it.

To publish code changes **without changing the URL**, do this instead:

1. Apps Script editor → **Deploy** → **Manage deployments**
2. Click the pencil ✏️ icon next to the existing `Nagomi reservation v1` row
3. Under **Version**, pick **New version**
4. Click **Deploy**

The URL stays identical. Always use this flow for updates — never "New deployment" unless you intentionally want a fresh URL (e.g. for staging vs. production).

### Frontend fetch snippet

Paste this into the landing page form handler. Replace `WEBHOOK_URL` with the URL from Section 2 step 9.

```javascript
await fetch('WEBHOOK_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    people,
    date,
    time,
    name,
    phone,
    branch,
    timestamp: new Date().toISOString()
  })
});
```

### Why `Content-Type: text/plain` (not `application/json`)?

The browser's CORS rules classify requests into "simple" and "preflighted":

- A **simple request** is sent directly. The browser just adds an `Origin` header and ships it.
- A **preflighted request** triggers an extra `OPTIONS` call first to ask the server "are you OK with this?" The server must respond with specific `Access-Control-Allow-*` headers.

A POST with `Content-Type: application/json` is **preflighted**. Google Apps Script web apps **cannot set arbitrary response headers** on the `OPTIONS` call — the Apps Script runtime strips custom headers from `ContentService` responses. So preflight fails, and the browser blocks the real POST with a CORS error.

A POST with `Content-Type: text/plain` (along with `application/x-www-form-urlencoded` or `multipart/form-data`) is a **simple request** per the [Fetch spec](https://fetch.spec.whatwg.org/#cors-safelisted-request-header). No preflight fires, the POST goes through, and the Apps Script runtime automatically adds `Access-Control-Allow-Origin: *` on the actual response. This is the standard, battle-tested workaround for all Apps Script webhooks.

The request **body is still valid JSON** — only the Content-Type header lies about it. The server parses `e.postData.contents` with `JSON.parse()` regardless of the declared content type.

### Response handling

The Apps Script response comes back with `Content-Type: application/json` (because `ContentService.MimeType.JSON`), even though we sent the request as `text/plain`. So on the frontend you can parse it normally:

```javascript
const res = await fetch('WEBHOOK_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ people, date, time, name, phone, branch, timestamp: new Date().toISOString() })
});
const data = await res.json();
if (data.success) {
  // show "Reservation confirmed" UI
} else {
  // show error message from data.error
}
```

### Troubleshooting cheat sheet

| Symptom | Cause | Fix |
|---|---|---|
| `CORS error` in browser console | Deployed as "Anyone with Google account" | Redeploy as "Anyone" (Section 2, step 9) |
| `401 Unauthorized` | Same as above | Same fix |
| Curl returns empty body | Missing `-L` flag | Add `-L` to follow the 302 redirect |
| Row appears with wrong column order | Code was modified | Restore the `appendRow([timestamp, name, phone, people, date, time, branch])` order |
| URL changed and landing page broke | Used "New deployment" instead of "Manage deployments" | Use Manage deployments → edit → New version |
| `{"success":false,"error":"Invalid JSON body..."}` | Frontend sent a non-JSON body | Ensure `body: JSON.stringify({...})` |
| Health check returns HTML login page | Not deployed with "Anyone" access | Redeploy |

---

**Ready for the client meeting.** If anything misbehaves in the demo, open the spreadsheet + the Apps Script editor's **Executions** tab (left sidebar) side by side — every POST shows up there with logs, and you can see the exact error in 10 seconds.
