module.exports = {
  PORT: process.env.PORT || 8000,
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  CHANNELS: ['chrome', 'msedge', undefined],
  DEFAULT_DELAYS: {
    MIN: 20,
    MAX: 45
  },
  SELECTORS: {
    MESSAGE_BUTTONS: [
      "a[href*='/messages'][href*='u=']",
      "a[href*='messages?'][href*='u=']",
      "a:has-text('Pesan')",
      "button:has-text('Pesan')",
      "div[role='button']:has-text('Pesan')",
      "a:has-text('Message')",
      "button:has-text('Message')",
      "div[role='button']:has-text('Message')",
      "button[data-e2e='user-message-btn']",
      "div[data-e2e='user-message-btn']",
      "a[data-e2e='user-message-btn']"
    ],
    CHAT_INPUTS: [
      "div[contenteditable='true']",
      "div[data-e2e='message-input-area']",
      "div[data-e2e='chat-input']",
      "div[role='textbox']",
      "textarea[placeholder*='message']",
      "textarea[placeholder*='pesan']",
      "textarea[placeholder*='Kirim pesan']",
      'textarea'
    ],
    SEND_BUTTONS: [
      "button[data-e2e='message-send-btn']",
      "button:has-text('Send')",
      "button:has-text('Kirim')",
      "svg[data-icon='send']",
      "div[data-e2e='message-send-btn']"
    ],
    LOGIN_MODALS: [
      '#loginContainer',
      '[data-e2e="login-modal"]',
      'div[id*="loginContainer"]',
      'div[id*="login-modal"]'
    ],
    CAPTCHA_CONTAINERS: [
      '.captcha_verify_container',
      '#tiktok-verify-ele',
      'div[class*="captcha_verify"]',
      'div[id*="verify-bar"]'
    ]
  }
};

