const { runQuery, getAllRows } = require('./src/database/connection');

(async () => {
  await runQuery('DELETE FROM outreach_tasks');
  try {
    await runQuery("DELETE FROM sqlite_sequence WHERE name = 'outreach_tasks'");
  } catch (e) {}
  const seq = await getAllRows("SELECT * FROM sqlite_sequence WHERE name = 'outreach_tasks'");
  console.log('Sequence for outreach_tasks:', seq);
})();
