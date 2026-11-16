const { runQuery } = require('./src/database/connection');

(async () => {
  try {
    await runQuery('DELETE FROM outreach_tasks');
    await runQuery('DELETE FROM campaigns');
    await runQuery('DELETE FROM activity_logs');
    try {
      await runQuery("DELETE FROM sqlite_sequence WHERE name IN ('outreach_tasks', 'campaigns', 'activity_logs')");
    } catch (e) {}
    console.log('RESET_SUCCESS: Database auto-increment reset to 1');
  } catch (err) {
    console.error('RESET_FAILED:', err.message);
  }
})();
