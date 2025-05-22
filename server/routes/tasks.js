const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Routes pour les tâches
router.get('/', taskController.getAllTasks);
router.get('/summary', taskController.getTasksSummary);
router.get('/:id', taskController.getTaskById);
router.post('/', taskController.createTask);
router.put('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

module.exports = router; 