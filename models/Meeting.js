/**
 * Represents a meeting between a student and advisor.
 * @param {string} name - The name of the student.
 * @param {string} email - The email of the student.
 * @param {Date} date - The date of the meeting.
 * @param {string} advisor - Which advisor the meeting is with.
 * @param {string} description - A general description of the meeting.
 */

class Meeting {
  constructor(name, email, date, advisor, description) {
    this.name = name;
    this.email = email;
    this.date = date;
    this.advisor = advisor;
    this.description = description;
  }
}
