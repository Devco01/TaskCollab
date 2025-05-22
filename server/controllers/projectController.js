const { Project, User, Task, ProjectMember } = require('../models');
const { Op } = require('sequelize');

// Récupérer tous les projets (avec filtres optionnels)
exports.getAllProjects = async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    const filters = { ownerId: req.user.id };

    // Filtre par statut
    if (status) {
      filters.status = status;
    }

    // Filtre par priorité
    if (priority) {
      filters.priority = priority;
    }

    // Recherche par nom ou description
    if (search) {
      filters[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Récupérer les projets où l'utilisateur est propriétaire
    const ownedProjects = await Project.findAll({
      where: filters,
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Task,
          as: 'tasks',
          attributes: ['id', 'title', 'status', 'priority', 'dueDate']
        }
      ]
    });

    // Récupérer les projets où l'utilisateur est membre
    const memberProjects = await Project.findAll({
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          where: { id: req.user.id },
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        },
        {
          model: Task,
          as: 'tasks',
          attributes: ['id', 'title', 'status', 'priority', 'dueDate']
        }
      ]
    });

    // Fusion des projets en évitant les doublons
    const allProjects = [
      ...ownedProjects,
      ...memberProjects.filter(mp => !ownedProjects.some(op => op.id === mp.id))
    ];

    res.status(200).json({
      count: allProjects.length,
      projects: allProjects
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des projets:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des projets', error: error.message });
  }
};

// Récupérer un projet par son ID
exports.getProjectById = async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        },
        {
          model: Task,
          as: 'tasks',
          include: [
            {
              model: User,
              as: 'assignee',
              attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
            }
          ]
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier si l'utilisateur est propriétaire ou membre du projet
    const isOwner = project.ownerId === req.user.id;
    const isMember = project.members.some(member => member.id === req.user.id);

    if (!isOwner && !isMember) {
      return res.status(403).json({ message: 'Accès non autorisé à ce projet' });
    }

    res.status(200).json({ project });
  } catch (error) {
    console.error('Erreur lors de la récupération du projet:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du projet', error: error.message });
  }
};

// Créer un nouveau projet
exports.createProject = async (req, res) => {
  try {
    const { name, description, startDate, endDate, status, priority, members } = req.body;

    const project = await Project.create({
      name,
      description,
      startDate,
      endDate,
      status: status || 'not_started',
      priority: priority || 'medium',
      ownerId: req.user.id
    });

    // Ajouter des membres au projet si spécifiés
    if (members && Array.isArray(members) && members.length > 0) {
      // Vérifier si les utilisateurs existent
      const users = await User.findAll({
        where: { id: members }
      });

      if (users.length > 0) {
        await project.addMembers(users);
      }
    }

    // Récupérer le projet avec les relations
    const createdProject = await Project.findByPk(project.id, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        }
      ]
    });

    res.status(201).json({
      message: 'Projet créé avec succès',
      project: createdProject
    });
  } catch (error) {
    console.error('Erreur lors de la création du projet:', error);
    res.status(500).json({ message: 'Erreur lors de la création du projet', error: error.message });
  }
};

// Mettre à jour un projet
exports.updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, description, startDate, endDate, status, priority, members } = req.body;

    // Vérifier si le projet existe
    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id'],
          through: { attributes: [] }
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier si l'utilisateur est le propriétaire du projet
    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à modifier ce projet' });
    }

    // Mettre à jour le projet
    await project.update({
      name: name || project.name,
      description: description !== undefined ? description : project.description,
      startDate: startDate || project.startDate,
      endDate: endDate || project.endDate,
      status: status || project.status,
      priority: priority || project.priority
    });

    // Mettre à jour les membres si spécifiés
    if (members && Array.isArray(members)) {
      // Récupérer les utilisateurs existants
      const users = await User.findAll({
        where: { id: members }
      });

      // Remplacer les membres actuels
      await project.setMembers(users);
    }

    // Récupérer le projet mis à jour avec les relations
    const updatedProject = await Project.findByPk(projectId, {
      include: [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'members',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar'],
          through: { attributes: [] }
        }
      ]
    });

    res.status(200).json({
      message: 'Projet mis à jour avec succès',
      project: updatedProject
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du projet', error: error.message });
  }
};

// Supprimer un projet
exports.deleteProject = async (req, res) => {
  try {
    const projectId = req.params.id;

    // Vérifier si le projet existe
    const project = await Project.findByPk(projectId);

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier si l'utilisateur est le propriétaire du projet
    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer ce projet' });
    }

    // Supprimer les tâches associées
    await Task.destroy({
      where: { projectId }
    });

    // Supprimer les membres du projet
    await ProjectMember.destroy({
      where: { ProjectId: projectId }
    });

    // Supprimer le projet
    await project.destroy();

    res.status(200).json({
      message: 'Projet et tâches associées supprimés avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du projet:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du projet', error: error.message });
  }
};

// Ajouter un membre au projet
exports.addProjectMember = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'L\'ID de l\'utilisateur est requis' });
    }

    // Vérifier si le projet existe
    const project = await Project.findByPk(projectId);

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier si l'utilisateur est le propriétaire du projet
    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à ajouter des membres à ce projet' });
    }

    // Vérifier si l'utilisateur existe
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Vérifier si l'utilisateur est déjà membre du projet
    const isMember = await ProjectMember.findOne({
      where: {
        ProjectId: projectId,
        UserId: userId
      }
    });

    if (isMember) {
      return res.status(400).json({ message: 'L\'utilisateur est déjà membre de ce projet' });
    }

    // Ajouter l'utilisateur comme membre du projet
    await project.addMember(user);

    res.status(200).json({
      message: 'Membre ajouté au projet avec succès',
      member: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du membre au projet:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du membre au projet', error: error.message });
  }
};

// Supprimer un membre du projet
exports.removeProjectMember = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const memberId = req.params.memberId;

    // Vérifier si le projet existe
    const project = await Project.findByPk(projectId);

    if (!project) {
      return res.status(404).json({ message: 'Projet non trouvé' });
    }

    // Vérifier si l'utilisateur est le propriétaire du projet
    if (project.ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer des membres de ce projet' });
    }

    // Vérifier si l'utilisateur est membre du projet
    const isMember = await ProjectMember.findOne({
      where: {
        ProjectId: projectId,
        UserId: memberId
      }
    });

    if (!isMember) {
      return res.status(404).json({ message: 'L\'utilisateur n\'est pas membre de ce projet' });
    }

    // Supprimer l'utilisateur des membres du projet
    await ProjectMember.destroy({
      where: {
        ProjectId: projectId,
        UserId: memberId
      }
    });

    // Désassigner les tâches attribuées à ce membre dans ce projet
    await Task.update(
      { assigneeId: null },
      {
        where: {
          projectId,
          assigneeId: memberId
        }
      }
    );

    res.status(200).json({
      message: 'Membre retiré du projet avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du membre du projet:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du membre du projet', error: error.message });
  }
}; 