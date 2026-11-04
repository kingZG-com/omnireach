const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.get('/status', (req, res) => authController.getStatus(req, res));
router.get('/open-login', (req, res) => authController.openLogin(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));
router.post('/update-username', (req, res) => authController.updateUsername(req, res));

module.exports = router;

