const { Task, User, Project, ProjectMember } = require('../models');
const { Op } = require('sequelize');

// Récupérer toutes les tâches de l'utilisateur (avec filtres optionnels)
exports.getAllTasks = async (req, res) => {
  try {
    const { status, priority, projectId, search, assignee } = req.query;
    
    // Construire les filtres de base
    const filters = {};
    
    // Filtre par statut
    if (status) {
      filters.status = status;
    }
    
    // Filtre par priorité
    if (priority) {
      filters.priority = priority;
    }
    
    // Filtre par projet
    if (projectId) {
      filters.projectId = projectId;
    }
    
    // Filtre par recherche de texte
    if (search) {
      filters[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Filtre par assigné
    if (assignee === 'me') {
      filters.assigneeId = req.user.id;
    } else if (assignee === 'unassigned') {
      filters.assigneeId = null;
    } else if (assignee && !isNaN(assignee)) {
      filters.assigneeId = parseInt(assignee);
    }
    
    // Trouver tous les projets dont l'utilisateur est propriétaire ou membre
    const userProjects = await Project.findAll({
      attributes: ['id'],
      where: {
        [Op.or]: [
          { ownerId: req.user.id },
          {
            '$members.id$': req.user.id
          }
        ]
      },
      include: [
        {
          model: User,
          as: 'members',
          attributes: [],
          through: { attributes: [] }
        }
      ]
    });
    
    const projectIds = userProjects.map(project => project.id);
    
    // Si l'utilisateur n'a pas de projets, retourner un tableau vide
    if (projectIds.length === 0) {
      return res.status(200).json({
        count: 0,
        tasks: []
      });
    }
    
    // Ajouter le filtre de projets accessibles
    if (!filters.projectId) {
      filters.projectId = {
        [Op.in]: projectIds
      };
    } else {
      // Vérifier si le projet spécifié est accessible à l'utilisateur
      if (!projectIds.includes(parseInt(filters.projectId))) {
        return res.status(403).json({ message: 'Vous n\'avez pas accès à ce projet' });
      }
    }
    
    // Récupérer les tâches
    const tasks = await Task.findAll({
      where: filters,
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'status', 'priority']
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC']
      ]
    });
    
    res.status(200).json({
      count: tasks.length,
      tasks
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des tâches:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des tâches', error: error.message });
  }
};

// Récupérer une tâche par son ID
exports.getTaskById = async (req, res) => {
  try {
    const taskId = req.params.id;
    
    const task = await Task.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'ownerId', 'status', 'priority'],
          include: [
            {
              model: User,
              as: 'members',
              attributes: ['id'],
              through: { attributes: [] }
            }
          ]
        }
      ]
    });
    
    if (!task) {
      return res.status(404).json({ message: 'Tâche non trouvée' });
    }
    
    // Vérifier si l'utilisateur a accès à cette tâche
    const isProjectOwner = task.project.ownerId === req.user.id;
    const isProjectMember = task.project.members.some(member => member.id === req.user.id);
    const isTaskCreator = task.createdById === req.user.id;
    const isTaskAssignee = task.assigneeId === req.user.id;
    
    if (!isProjectOwner && !isProjectMember && !isTaskCreator && !isTaskAssignee) {
      return res.status(403).json({ message: 'Vous n\'avez pas accès à cette tâche' });
    }
    
    res.status(200).json({ task });
  } catch (error) {
    console.error('Erreur lors de la récupération de la tâche:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la tâche', error: error.message });
  }
};

// Créer une nouvelle tâche
exports.createTask = async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, projectId, assigneeId } = req.body;
    
    if (!title || !projectId) {
      return res.status(400).json({ message: 'Le titre et l\'ID du projet sont requis' });
    }
    
    // Vérifier si le projet existe et si l'utilisateur y a accès
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
    
    const isProjectOwner = project.ownerId === req.user.id;
    const isProjectMember = project.members.some(member => member.id === req.user.id);
    
    if (!isProjectOwner && !isProjectMember) {
      return res.status(403).json({ message: 'Vous n\'avez pas accès à ce projet' });
    }
    
    // Vérifier si l'assigné existe et fait partie du projet
    if (assigneeId) {
      const isAssigneeValid = assigneeId === project.ownerId || 
                             project.members.some(member => member.id === assigneeId);
      
      if (!isAssigneeValid) {
        return res.status(400).json({ 
          message: 'L\'utilisateur assigné doit être le propriétaire ou un membre du projet' 
        });
      }
    }
    
    // Créer la tâche
    const task = await Task.create({
      title,
      description,
      status: status || 'to_do',
      priority: priority || 'medium',
      dueDate,
      projectId,
      assigneeId,
      createdById: req.user.id
    });
    
    // Récupérer la tâche avec les relations
    const createdTask = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'status', 'priority']
        }
      ]
    });
    
    res.status(201).json({
      message: 'Tâche créée avec succès',
      task: createdTask
    });
  } catch (error) {
    console.error('Erreur lors de la création de la tâche:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la tâche', error: error.message });
  }
};

// Mettre à jour une tâche
exports.updateTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, description, status, priority, dueDate, assigneeId } = req.body;
    
    // Récupérer la tâche avec son projet
    const task = await Task.findByPk(taskId, {
      include: [
        {
          model: Project,
          as: 'project',
          include: [
            {
              model: User,
              as: 'members',
              attributes: ['id'],
              through: { attributes: [] }
            }
          ]
        }
      ]
    });
    
    if (!task) {
      return res.status(404).json({ message: 'Tâche non trouvée' });
    }
    
    // Vérifier si l'utilisateur a le droit de modifier cette tâche
    const isProjectOwner = task.project.ownerId === req.user.id;
    const isTaskCreator = task.createdById === req.user.id;
    const isTaskAssignee = task.assigneeId === req.user.id;
    
    if (!isProjectOwner && !isTaskCreator && !isTaskAssignee) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à modifier cette tâche' });
    }
    
    // Vérifier si l'assigné existe et fait partie du projet (si fourni)
    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        // Permettre de désassigner une tâche
      } else {
        const isAssigneeValid = assigneeId === task.project.ownerId || 
                               task.project.members.some(member => member.id === assigneeId);
        
        if (!isAssigneeValid) {
          return res.status(400).json({ 
            message: 'L\'utilisateur assigné doit être le propriétaire ou un membre du projet' 
          });
        }
      }
    }
    
    // Préparer les données de mise à jour
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    
    // Si le statut est changé à "completed", enregistrer la date d'achèvement
    if (status === 'completed' && task.status !== 'completed') {
      updateData.completedAt = new Date();
    } else if (status !== 'completed' && task.status === 'completed') {
      updateData.completedAt = null;
    }
    
    // Mettre à jour la tâche
    await task.update(updateData);
    
    // Récupérer la tâche mise à jour avec les relations
    const updatedTask = await Task.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName', 'avatar']
        },
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'status', 'priority']
        }
      ]
    });
    
    res.status(200).json({
      message: 'Tâche mise à jour avec succès',
      task: updatedTask
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la tâche:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la tâche', error: error.message });
  }
};

// Supprimer une tâche
exports.deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    
    // Récupérer la tâche avec son projet
    const task = await Task.findByPk(taskId, {
      include: [
        {
          model: Project,
          as: 'project'
        }
      ]
    });
    
    if (!task) {
      return res.status(404).json({ message: 'Tâche non trouvée' });
    }
    
    // Vérifier si l'utilisateur a le droit de supprimer cette tâche
    const isProjectOwner = task.project.ownerId === req.user.id;
    const isTaskCreator = task.createdById === req.user.id;
    
    if (!isProjectOwner && !isTaskCreator) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer cette tâche' });
    }
    
    // Supprimer la tâche
    await task.destroy();
    
    res.status(200).json({
      message: 'Tâche supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la tâche:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la tâche', error: error.message });
  }
};

// Obtenir un résumé des tâches par statut
exports.getTasksSummary = async (req, res) => {
  try {
    const { projectId } = req.query;
    
    // Filtrer par projet si fourni
    const whereClause = {};
    
    if (projectId) {
      // Vérifier si l'utilisateur a accès au projet
      const project = await Project.findOne({
        where: {
          id: projectId,
          [Op.or]: [
            { ownerId: req.user.id },
            { '$members.id$': req.user.id }
          ]
        },
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
        return res.status(403).json({ message: 'Vous n\'avez pas accès à ce projet' });
      }
      
      whereClause.projectId = projectId;
    } else {
      // Récupérer tous les projets auxquels l'utilisateur a accès
      const projects = await Project.findAll({
        attributes: ['id'],
        where: {
          [Op.or]: [
            { ownerId: req.user.id },
            { '$members.id$': req.user.id }
          ]
        },
        include: [
          {
            model: User,
            as: 'members',
            attributes: ['id'],
            through: { attributes: [] }
          }
        ]
      });
      
      if (projects.length === 0) {
        return res.status(200).json({
          summary: {
            to_do: 0,
            in_progress: 0,
            review: 0,
            completed: 0,
            total: 0
          },
          byPriority: {
            low: 0,
            medium: 0,
            high: 0
          },
          assignedToMe: 0,
          createdByMe: 0,
          unassigned: 0
        });
      }
      
      whereClause.projectId = {
        [Op.in]: projects.map(p => p.id)
      };
    }
    
    // Compter les tâches par statut
    const counts = await Task.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: whereClause,
      group: ['status']
    });
    
    // Compter les tâches par priorité
    const priorityCounts = await Task.findAll({
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: whereClause,
      group: ['priority']
    });
    
    // Compter les tâches assignées à l'utilisateur
    const assignedToMe = await Task.count({
      where: {
        ...whereClause,
        assigneeId: req.user.id
      }
    });
    
    // Compter les tâches créées par l'utilisateur
    const createdByMe = await Task.count({
      where: {
        ...whereClause,
        createdById: req.user.id
      }
    });
    
    // Compter les tâches non assignées
    const unassigned = await Task.count({
      where: {
        ...whereClause,
        assigneeId: null
      }
    });
    
    // Formater les résultats
    const summary = {
      to_do: 0,
      in_progress: 0,
      review: 0,
      completed: 0,
      total: 0
    };
    
    const byPriority = {
      low: 0,
      medium: 0,
      high: 0
    };
    
    counts.forEach(result => {
      summary[result.status] = parseInt(result.getDataValue('count'));
      summary.total += parseInt(result.getDataValue('count'));
    });
    
    priorityCounts.forEach(result => {
      byPriority[result.priority] = parseInt(result.getDataValue('count'));
    });
    
    res.status(200).json({
      summary,
      byPriority,
      assignedToMe,
      createdByMe,
      unassigned
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du résumé des tâches:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du résumé des tâches', error: error.message });
  }
}; 