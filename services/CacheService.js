/**
 * Service for caching data to improve performance
 * Uses Google Apps Script's CacheService to store temporary data
 * @namespace CacheService
 */

const SummitCacheService = {
  /**
   * Cache expiration times (in seconds)
   */
  CACHE_DURATIONS: {
    STUDENT_LIST: 300, // 5 minutes
    STUDENT_MEETINGS: 300, // 5 minutes
  },

  /**
   * Gets the appropriate cache instance
   * @private
   * @returns {GoogleAppsScript.Cache.Cache} Cache instance
   */
  _getCache() {
    return CacheService.getScriptCache();
  },

  /**
   * Generates a cache key for student meetings
   * @private
   * @param {string} studentUrl - URL to student spreadsheet
   * @returns {string} Cache key
   */
  _getMeetingsCacheKey(studentUrl) {
    // Use MD5 hash or simple encoding of URL
    return "meetings_" + Utilities.base64Encode(studentUrl).substring(0, 50);
  },

  /**
   * Gets cached student list
   * @returns {Array<Object>|null} Cached student data or null if not found/expired
   */
  getCachedStudentList() {
    const cache = this._getCache();
    const cached = cache.get("student_list");

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        Logger.log("Error parsing cached student list: " + e);
        return null;
      }
    }
    return null;
  },

  /**
   * Caches student list
   * @param {Array<Object>} students - Student data array
   */
  cacheStudentList(students) {
    const cache = this._getCache();
    cache.put(
      "student_list",
      JSON.stringify(students),
      this.CACHE_DURATIONS.STUDENT_LIST
    );
  },

  /**
   * Gets cached meetings for a student
   * @param {string} studentUrl - URL to student spreadsheet
   * @returns {Array<Object>|null} Cached meetings or null if not found/expired
   */
  getCachedMeetings(studentUrl) {
    const cache = this._getCache();
    const key = this._getMeetingsCacheKey(studentUrl);
    const cached = cache.get(key);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        Logger.log("Error parsing cached meetings: " + e);
        return null;
      }
    }
    return null;
  },

  /**
   * Caches meetings for a student
   * @param {string} studentUrl - URL to student spreadsheet
   * @param {Array<Object>} meetings - Meetings data array
   */
  cacheMeetings(studentUrl, meetings) {
    const cache = this._getCache();
    const key = this._getMeetingsCacheKey(studentUrl);
    cache.put(
      key,
      JSON.stringify(meetings),
      this.CACHE_DURATIONS.STUDENT_MEETINGS
    );
  },

  /**
   * Clears all cached data
   */
  clearAll() {
    const cache = this._getCache();
    cache.removeAll(["student_list"]);
    // Note: Can't easily clear all meeting caches without tracking keys
    // They will expire naturally after 5 minutes
  },
};
