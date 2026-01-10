/**
 * Service for managing email operations across the Summit CRM.
 * Provides methods for sending various types of emails to students.
 * @namespace EmailService
 */

const EmailService = {
  /**
   * Email templates directory path
   * @private
   */
  _TEMPLATES_PATH: "ui/templates/",

  /**
   * Validates an email address format.
   * @private
   * @param {string} email - Email address to validate
   * @returns {boolean} True if email is valid
   */
  _isValidEmail(email) {
    return email && typeof email === "string" && email.includes("@");
  },

  /**
   * Sends meeting notes email to a student, with optional CC to parent.
   * Creates a beautifully formatted HTML email using the MeetingNotesTemplate.
   * Parent email is looked up from F11 on the student's Home Page.
   *
   * @param {string} studentName - Name of the student
   * @param {string} datetime - Formatted date and time of the meeting
   * @param {string} notes - Meeting notes content
   * @param {string} recipientEmail - Student's email address
   * @param {string} [studentUrl] - URL to student's spreadsheet (for parent lookup)
   * @returns {Object} Result object with success status and message
   * @throws {Error} If validation fails or email cannot be sent
   *
   * @example
   * EmailService.sendMeetingNotes(
   *   "John Doe",
   *   "Jan 15, 2024 (10:00 AM)",
   *   "Discussed project progress...",
   *   "john.doe@example.com",
   *   "https://docs.google.com/spreadsheets/d/..."
   * );
   */
  sendMeetingNotes(studentName, datetime, notes, recipientEmail, studentUrl) {
    try {
      Logger.log("=== sendMeetingNotes called ===");
      Logger.log("Student: " + studentName);
      Logger.log("Recipient: " + recipientEmail);
      Logger.log("Student URL: " + (studentUrl || "NOT PROVIDED"));

      // Validate email address
      if (!this._isValidEmail(recipientEmail)) {
        throw new Error("Invalid email address");
      }

      // Validate required fields
      if (!studentName || !datetime || !notes) {
        throw new Error(
          "Missing required fields: studentName, datetime, or notes"
        );
      }

      // Look up parent email from student's Home Page F11
      let parentEmail = null;
      if (studentUrl) {
        Logger.log("Looking up parent email...");
        parentEmail = this._getParentEmail(studentUrl);
        Logger.log("Parent email result: " + (parentEmail || "NOT FOUND"));
      } else {
        Logger.log("No student URL provided - skipping parent lookup");
      }

      // Create HTML email from template
      const template = HtmlService.createTemplateFromFile(
        this._TEMPLATES_PATH + "MeetingNotesTemplate"
      );
      template.studentName = studentName;
      template.datetime = datetime;
      template.notes = notes;

      // Evaluate template to get HTML content
      const htmlBody = template.evaluate().getContent();

      // Email subject line
      const subject = "Summit Meeting Notes - " + datetime;

      // Build email options
      const emailOptions = {
        to: recipientEmail,
        subject: subject,
        htmlBody: htmlBody,
        name: "Summit CRM",
      };

      // Add CC to parent if available
      if (parentEmail) {
        emailOptions.cc = parentEmail;
        Logger.log("Adding parent CC: " + parentEmail);
      } else {
        Logger.log("No parent CC - sending to student only");
      }

      Logger.log(
        "Sending email with options: " +
          JSON.stringify({
            to: emailOptions.to,
            cc: emailOptions.cc || "none",
            subject: emailOptions.subject,
          })
      );

      // Send email with HTML body
      MailApp.sendEmail(emailOptions);
      Logger.log("Email sent successfully!");

      if (CONFIG.debugMode) {
        Logger.log("Email sent successfully to: " + recipientEmail);
      }

      // Build success message
      let successMsg = "Email sent successfully to " + recipientEmail;
      if (parentEmail) {
        successMsg += " (CC: " + parentEmail + ")";
      }

      return {
        success: true,
        message: successMsg,
      };
    } catch (error) {
      Logger.log("Error sending meeting notes email: " + error.toString());
      return {
        success: false,
        message: "Failed to send email: " + error.message,
      };
    }
  },

  /**
   * Gets the parent email from a student's Home Page F11.
   * @private
   * @param {string} studentUrl - URL to student's spreadsheet
   * @returns {string|null} Parent email or null if not found
   */
  _getParentEmail(studentUrl) {
    try {
      Logger.log("_getParentEmail called with URL: " + studentUrl);

      const studentSs =
        spreadsheetHelperFunctions.openSpreadsheetWithUrl(studentUrl);
      Logger.log("Opened spreadsheet: " + studentSs.getName());

      const homePage = studentSs.getSheetByName("Home Page");

      if (!homePage) {
        Logger.log("ERROR: Home Page sheet not found!");
        return null;
      }

      Logger.log("Found Home Page sheet");

      const parentEmail = homePage.getRange("F11").getValue();
      Logger.log("Raw F11 value: '" + parentEmail + "'");

      const email = String(parentEmail || "").trim();
      Logger.log("Trimmed email: '" + email + "'");

      if (email && email.includes("@")) {
        Logger.log("Valid parent email found: " + email);
        return email;
      }

      Logger.log("No valid email in F11 (missing @ or empty)");
      return null;
    } catch (error) {
      Logger.log("Error looking up parent email: " + error.toString());
      return null;
    }
  },
};
