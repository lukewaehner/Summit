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
   * Sends meeting notes email to a student.
   * Creates a beautifully formatted HTML email using the MeetingNotesTemplate.
   *
   * @param {string} studentName - Name of the student
   * @param {string} datetime - Formatted date and time of the meeting
   * @param {string} notes - Meeting notes content
   * @param {string} recipientEmail - Student's email address
   * @returns {Object} Result object with success status and message
   * @throws {Error} If validation fails or email cannot be sent
   *
   * @example
   * EmailService.sendMeetingNotes(
   *   "John Doe",
   *   "Jan 15, 2024 (10:00 AM)",
   *   "Discussed project progress...",
   *   "john.doe@example.com"
   * );
   */
  sendMeetingNotes(studentName, datetime, notes, recipientEmail) {
    try {
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

      // Send email with HTML body
      MailApp.sendEmail({
        to: recipientEmail,
        subject: subject,
        htmlBody: htmlBody,
        name: "Summit CRM",
      });

      if (CONFIG.debugMode) {
        Logger.log("Email sent successfully to: " + recipientEmail);
      }

      return {
        success: true,
        message: "Email sent successfully to " + recipientEmail,
      };
    } catch (error) {
      Logger.log("Error sending meeting notes email: " + error.toString());
      return {
        success: false,
        message: "Failed to send email: " + error.message,
      };
    }
  },
};
