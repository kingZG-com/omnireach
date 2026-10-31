const { cleanLocks } = require('./core/browser');

if (require.main === module) {
  cleanLocks();
  console.log('Clean lock check completed.');
}

module.exports = {
  cleanLocks
};
