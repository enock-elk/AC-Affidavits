/**
 * Affidavit Automation — Gmail CREATE_DRAFT handler
 *
 * PASTE THIS INTO THE EXISTING Apps Script project that powers:
 *   https://script.google.com/macros/s/AKfycbw-M9kVkSSXKuJ49tohaconx99-l5VcbU1xSNeUTccX2gs0prok3LltyTyO7mdNKtm8/exec
 *
 * Then wire it into doPost (see MERGE STEPS at bottom) and redeploy the web app.
 */

/**
 * Creates a Gmail draft in the account that runs the web app
 * (Deploy → Execute as: Me).
 *
 * @param {Object} data - { subject, htmlBody, to? }
 * @return {Object} JSON-serializable response
 */
function handleCreateDraft_(data) {
  var subject = (data && data.subject) ? String(data.subject) : '(No subject)';
  var htmlBody = (data && data.htmlBody) ? String(data.htmlBody) : '';
  var to = (data && data.to) ? String(data.to) : '';

  if (!htmlBody) {
    return { status: 'error', message: 'htmlBody is required to create a draft.' };
  }

  GmailApp.createDraft(to, subject, '', { htmlBody: htmlBody });

  return {
    status: 'success',
    message: 'Draft created in Gmail.'
  };
}

/**
 * Optional helper: return JSON with CORS-friendly ContentService output.
 * Use this if your project does not already have an equivalent.
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
 * =============================================================================
 * MERGE STEPS (required — frontend cannot create Gmail drafts without this)
 * =============================================================================
 *
 * 1. Open the live Apps Script project (Extensions → Apps Script from the
 *    linked Google Sheet, or script.google.com → find the Affidavit project).
 *
 * 2. Add this file (File → New → Script) and paste the functions above, OR
 *    paste handleCreateDraft_ into your existing Code.gs.
 *
 * 3. In doPost(e), AFTER you parse the JSON body and BEFORE firm-sync logic,
 *    add this branch (adjust variable names to match your script):
 *
 *      var data = JSON.parse(e.postData.contents);
 *
 *      if (data.action === 'CREATE_DRAFT') {
 *        return jsonResponse_(handleCreateDraft_(data));
 *      }
 *
 *      if (data.action === 'LOG_FEEDBACK') {
 *        // ... your existing feedback vault logic ...
 *      }
 *
 *      // ... existing firm update / "Firm not found in Google Sheet" logic ...
 *
 * 4. Authorize Gmail:
 *    - Project Settings → show "appsscript.json" (or File → Project properties)
 *    - Ensure oauthScopes include:
 *        "https://www.googleapis.com/auth/gmail.compose"
 *      (keep your existing spreadsheets scopes)
 *    - Run handleCreateDraft_ once from the editor (or Deploy) and approve Gmail
 *      access when prompted.
 *
 * 5. Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.
 *    Keep the same Web App URL so EmailEngine.jsx does not need a URL change.
 *
 * 6. Deployment settings should remain:
 *      Execute as: Me
 *      Who has access: Anyone  (or Anyone with Google account — match current)
 *
 * Drafts land in the Gmail inbox of the Google account that owns the deployment
 * ("Execute as: Me"), not necessarily the browser user's account.
 * =============================================================================
 */
