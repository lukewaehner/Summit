# Review Notification Setup Guide

## Quick Overview

**Students type "Needs Review" in their Tasks sheet** → **System scans hourly** → **Writes to central queue** → **Advisors get batch emails every 10 min**

---

## 🎯 How It Works

### Two-Phase System

**Phase 1: Collection** (Runs every hour)

- Scans each student's **"Tasks"** sheet AND **"ApplicationTracker"** sheet
- **Tasks sheet:** Checks column C for "Needs Review", reads D (title) and H (link)
- **ApplicationTracker sheet:** Checks column E for "Needs Review", reads D (title), no links
- Writes to central ReviewQueue sheet
- **Multiple tasks per student supported across both sheets!**

**Phase 2: Notification** (Runs every 10 minutes)

- Reads ReviewQueue sheet (super fast)
- Groups tasks by advisor
- Sends batch emails
- Updates status to "notified"

---

## 📋 Student Sheet Structure

### Sheet 1: Tasks (in each student's spreadsheet)

| A   | B   | **C (Status)**   | **D (Task Title)**      | E   | F   | G   | **H (Document Link)**           |
| --- | --- | ---------------- | ----------------------- | --- | --- | --- | ------------------------------- |
|     |     |                  |                         |     |     |     |                                 |
|     |     |                  |                         |     |     |     |                                 |
|     |     | **Needs Review** | **College Essay Draft** |     |     |     | **https://docs.google.com/...** |
|     |     | Completed        | Application Form        |     |     |     | https://...                     |
|     |     | **Needs Review** | **Resume Review**       |     |     |     | **https://docs.google.com/...** |

**Students type "Needs Review" in column C!**

### Sheet 2: ApplicationTracker (in each student's spreadsheet)

| A   | B   | C   | **D (Application Title)** | **E (Status)**   | F   | G   |
| --- | --- | --- | ------------------------- | ---------------- | --- | --- |
|     |     |     |                           |                  |     |     |
|     |     |     |                           |                  |     |     |
|     |     |     |                           |                  |     |     |
|     |     |     | **Common App**            | **Needs Review** |     |     |
|     |     |     | **Coalition App**         | Completed        |     |     |
|     |     |     | **UC Application**        | **Needs Review** |     |     |

**Students type "Needs Review" in column E!** (No links for this sheet)

### Configuration

The system scans **both sheets**:

**Tasks Sheet:**

- **Sheet name:** `Tasks`
- **Starting row:** Row 3
- **Status column:** C (looking for "Needs Review")
- **Title column:** D (task description)
- **Link column:** H (document URL)

**ApplicationTracker Sheet:**

- **Sheet name:** `ApplicationTracker`
- **Starting row:** Row 4
- **Status column:** E (looking for "Needs Review")
- **Title column:** D (application title)
- **Link column:** None (no links collected)

---

## 🛠️ Setup Steps

### Step 1: Add Advisor Column to StudentData

In your Broadcast Sheet, update StudentData:

| A (Name)   | B (URL) | C (Email)        | **D (Advisor)** |
| ---------- | ------- | ---------------- | --------------- |
| John Doe   | url1    | john@example.com | **Maggie**      |
| Jane Smith | url2    | jane@example.com | **Jackie**      |

### Step 2: Create ReviewQueue Sheet

Run this once in Apps Script Editor:

```javascript
setupReviewQueue();
```

This creates a sheet with columns:

- A: Timestamp
- B: Student Name
- C: Task Title (from column D)
- D: Document Link (from column H)
- E: Status
- F: Notified At

### Step 3: Verify Both Sheets Exist

Make sure each student spreadsheet has:

1. **"Tasks" sheet** with columns C (status), D (title), H (link)
2. **"ApplicationTracker" sheet** with columns D (title), E (status)

If a sheet is missing, it will be skipped (no error).

### Step 4: Configure Advisor Emails

Update `/services/ReviewNotificationService.js`:

```javascript
_getAdvisorEmail(advisorName) {
  const advisorEmails = {
    Maggie: "maggie@summit.edu", // UPDATE THIS
    Jackie: "jackie@summit.edu", // UPDATE THIS
  };
  return advisorEmails[advisorName] || null;
}
```

### Step 5: Set Up Two Triggers

**Trigger 1: Hourly Collection**

1. Apps Script Editor → Triggers (⏰ icon)
2. Add Trigger
3. Settings:
   - Function: `collectReviewRequests`
   - Event: Time-driven
   - Type: Hour timer
   - Interval: Every hour

**Trigger 2: 10-Minute Notification**

1. Add Trigger
2. Settings:
   - Function: `processReviewRequests`
   - Event: Time-driven
   - Type: Minutes timer
   - Interval: Every 10 minutes

---

## 🧪 Testing

### Test 1: Tasks Sheet

1. Open a test student's spreadsheet
2. Go to "Tasks" sheet
3. In any row (row 3 or later):
   - Column C: `Needs Review`
   - Column D: `Test Essay`
   - Column H: `https://docs.google.com/document/...`
4. Run `collectReviewRequests()` manually
5. Check ReviewQueue sheet - verify new row with link

### Test 1b: ApplicationTracker Sheet

1. Same student spreadsheet
2. Go to "ApplicationTracker" sheet
3. In any row (row 4 or later):
   - Column D: `Common App`
   - Column E: `Needs Review`
4. Run `collectReviewRequests()` again
5. Check ReviewQueue - should have 2 entries now (one from each sheet)
6. Run `processReviewRequests()`
7. Advisor receives ONE email with both tasks listed

### Test 2: Multiple Tasks (Same Student)

1. In same student's Tasks sheet, add 3 rows with "Needs Review"
2. Run `collectReviewRequests()`
3. Check ReviewQueue - should have 3 separate entries
4. Run `processReviewRequests()`
5. Advisor receives ONE email with all 3 tasks listed

### Test 3: Performance (50 Students)

1. Time the collection: run `collectReviewRequests()`
2. Check logs: should process 50 students in 60-150 seconds
3. Run `processReviewRequests()`
4. Should complete in <10 seconds

---

## 📧 Advisor Email Example

```
Subject: 5 Tasks Need Review - Summit CRM

Hi Maggie,

The following tasks need review:

• John Doe - College Essay Draft (Tasks)
  Submitted: Dec 2, 10:30 AM
  Link: https://docs.google.com/document/...

• John Doe - Common App (ApplicationTracker)
  Submitted: Dec 2, 10:30 AM

• Jane Smith - Resume Review (Tasks)
  Submitted: Dec 2, 11:15 AM
  Link: https://docs.google.com/document/...

You can access each student's spreadsheet from the Student Data sheet.

—
Summit CRM Automated Notification
```

---

## ⚙️ Configuration Options

### If Your Columns Are Different

Update `STUDENT_SHEET_CONFIG` in `/services/ReviewNotificationService.js`:

```javascript
STUDENT_SHEET_CONFIG: {
  sheetName: "Tasks",     // Your sheet name
  startRow: 3,            // First data row
  statusColumn: 3,        // Column C (A=1, B=2, C=3)
  titleColumn: 4,         // Column D (task title)
  linkColumn: 8,          // Column H (document link)
  needsReviewValue: "Needs Review",
}
```

### Change Collection Frequency

**More frequent (every 30 minutes):**

- Edit Trigger 1 → Minutes timer → Every 30 minutes

**Less frequent (twice daily):**

- Edit Trigger 1 → Day timer → Specific time → Run at 9 AM and 5 PM

### Adjust Batch Size

For faster runs with fewer timeouts:

```javascript
// In Main.js
function collectReviewRequests() {
  return ReviewNotificationService.collectReviewRequests({
    batchSize: 25, // Process 25 students per run instead of 50
  });
}
```

---

## 🐛 Troubleshooting

### No tasks being collected

**Check:**

1. Sheet names are exactly "Tasks" and "ApplicationTracker" (case-sensitive)
2. **Tasks:** Data starts at row 3, status in column C
3. **ApplicationTracker:** Data starts at row 4, status in column E
4. Both sheets have "Needs Review" exactly (case-sensitive)
5. Column D has task/application title (not empty) in both sheets
6. Trigger for `collectReviewRequests()` is active
7. Check execution logs for errors

### Duplicate tasks in queue

**This is normal if:**

- Student has multiple different tasks needing review
- System checks student name + task title for uniqueness

**Problem if:**

- Same task appears twice
- Check for multiple triggers running

**Solution:**

- Delete duplicate triggers
- Clear duplicate rows from ReviewQueue manually

### Collection is slow

**Solutions:**

1. Reduce batch size: `{ batchSize: 25 }`
2. Run less frequently (every 2 hours)
3. Check for students with very large sheets

### No emails being sent

**Check:**

1. ReviewQueue has entries with status="pending"
2. Advisor names in StudentData match exactly
3. Advisor emails configured correctly
4. Trigger for `processReviewRequests()` is active
5. Check spam folder

---

## 💡 Tips & Best Practices

### For Students

**Simple instructions:**

**For task/essay reviews:**

> 1. Go to your **Tasks** sheet
> 2. Find the task row
> 3. Type 'Needs Review' in column C
> 4. Make sure the task title is in column D
> 5. Put the document link in column H
> 6. Your advisor will be notified within 1-2 hours

**For application reviews:**

> 1. Go to your **ApplicationTracker** sheet
> 2. Find the application row
> 3. Type 'Needs Review' in column E (not column C!)
> 4. Make sure the application name is in column D
> 5. Your advisor will be notified within 1-2 hours

### Optional: Add Dropdown Validation

Make it easier for students in **both sheets**:

**Tasks sheet:**

1. Select all of column C (from C3 down)
2. Data → Data validation
3. Criteria: List of items
4. Values: `Needs Review, In Progress, Completed, Not Started`
5. Save

**ApplicationTracker sheet:**

1. Select all of column E (from E4 down)
2. Data → Data validation
3. Criteria: List of items
4. Values: `Needs Review, In Progress, Completed, Not Started`
5. Save

Now students have dropdowns instead of typing in both sheets.

### Optional: Auto-Clear After Collection

To prevent re-collecting the same task, add this feature:

After a task is added to queue, clear the "Needs Review" status:

```javascript
// In collectReviewRequests(), after adding to queue:
targetSheet
  .getRange(
    this.STUDENT_SHEET_CONFIG.startRow + rowIdx,
    this.STUDENT_SHEET_CONFIG.statusColumn
  )
  .setValue("In Review");
```

---

## 📊 Expected Performance

### Collection Phase

| Students | Avg Time | Max Time | Notes            |
| -------- | -------- | -------- | ---------------- |
| 25       | 30s      | 75s      | Single run       |
| 50       | 60s      | 150s     | Single run       |
| 75       | 90s      | 225s     | Single run       |
| 100      | 120s     | 300s     | Chunked (2 runs) |

**Handles 100+ students with chunked processing**

### Notification Phase

| Tasks in Queue | Time   | Emails Sent  |
| -------------- | ------ | ------------ |
| 10             | 3-5s   | 1-2 advisors |
| 50             | 5-10s  | 2-3 advisors |
| 100            | 10-15s | 2-3 advisors |

**Always fast - only reads one sheet**

---

## ✅ Benefits of This Approach

✅ **Multiple tasks per student** - flexible and realistic
✅ **Scans both Tasks and ApplicationTracker** - comprehensive coverage
✅ **Simple for students** - just type "Needs Review" in the right column
✅ **No form needed** - works in existing spreadsheets
✅ **Handles timeouts** - chunked processing with auto-resume
✅ **Fast notifications** - separate phase ensures speed
✅ **Batch emails** - advisors get one email with all tasks from both sheets
✅ **Document links** - included when available (Tasks sheet only)
✅ **Scalable** - works with 100+ students
✅ **Auditable** - full history in ReviewQueue

---

## 🎓 Go-Live Checklist

- [ ] StudentData has Advisor column (D)
- [ ] ReviewQueue sheet created
- [ ] Advisor emails configured
- [ ] Hourly collection trigger set up
- [ ] 10-minute notification trigger set up
- [ ] Tested with 3-5 sample students
- [ ] Verified email delivery
- [ ] Students instructed about Tasks AND ApplicationTracker sheets
- [ ] Optional: Added dropdown validation to column C (Tasks) and E (ApplicationTracker)

---

## 📞 Support

If issues arise:

1. **Check execution logs:** Apps Script Editor → Executions
2. **Check ReviewQueue sheet:** Verify data is being written
3. **Check StudentData sheet:** Verify advisor mapping
4. **Check triggers:** Both should be active with green checkmarks
5. **Manual test:** Run functions manually to isolate issues

Common log messages:

- ✓ `"Scanned X, New requests: Y"` - Collection working
- ✓ `"Found X pending review requests"` - Notification found tasks
- ✓ `"Sent notification to [Advisor]"` - Email sent successfully
- ⚠️ `"Sheet 'Tasks' not found"` - Check sheet name spelling
- ⚠️ `"No advisor found for [Student]"` - Check StudentData column D
