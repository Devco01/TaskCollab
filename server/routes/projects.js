const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Routes pour les projets
router.get('/', projectController.getAllProjects);
router.get('/:id', projectController.getProjectById);
router.post('/', projectController.createProject);
router.put('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

// Routes pour les membres du projet
router.post('/:id/members', projectController.addProjectMember);
router.delete('/:projectId/members/:memberId', projectController.removeProjectMember);

module.exports = router; 