const authService = require('./src/services/auth.service');

authService
  .runLoginAssistant()
  .then((res) => {
    if (res.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
