const authService = require('../../services/auth.service');
const websocket = require('../../core/websocket');

let loginAssistantRunning = false;

class AuthController {
  async getStatus(req, res) {
    try {
      const status = await authService.checkLoginStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async openLogin(req, res) {
    if (loginAssistantRunning) {
      return res.json({
        success: true,
        message: 'Jendela login TikTok sudah sedang berjalan di layar monitor Anda.'
      });
    }

    loginAssistantRunning = true;
    authService
      .runLoginAssistant((sessionData) => {
        websocket.broadcast('login_success', {
          username: sessionData.username || 'Akun TikTok Aktif'
        });
      })
      .finally(() => {
        loginAssistantRunning = false;
      });

    res.json({
      success: true,
      message: 'Jendela browser login TikTok telah dibuka di layar komputer Anda.'
    });
  }

  updateUsername(req, res) {
    try {
      const { username } = req.body;
      if (!username) {
        return res.status(400).json({ error: 'Username tidak boleh kosong.' });
      }

      const updated = authService.updateUsername(username);
      websocket.broadcast('login_success', { username: updated });

      res.json({
        success: true,
        message: `Username berhasil diperbarui menjadi ${updated}`,
        username: updated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new AuthController();

