const User = require('./User');
const Project = require('./Project');
const Task = require('./Task');
const { sequelize } = require('../config/database');

// Relations User - Project
User.hasMany(Project, { foreignKey: 'ownerId', as: 'ownedProjects' });
Project.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

// Relations User - Task (assignee)
User.hasMany(Task, { foreignKey: 'assigneeId', as: 'assignedTasks' });
Task.belongsTo(User, { foreignKey: 'assigneeId', as: 'assignee' });

// Relations User - Task (creator)
User.hasMany(Task, { foreignKey: 'createdById', as: 'createdTasks' });
Task.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });

// Relations Project - Task
Project.hasMany(Task, { foreignKey: 'projectId', as: 'tasks' });
Task.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });

// Table de jointure pour les membres du projet
const ProjectMember = sequelize.define('ProjectMember', {}, { timestamps: true });

// Relations Many-to-Many User - Project (membres)
User.belongsToMany(Project, { through: ProjectMember, as: 'memberProjects' });
Project.belongsToMany(User, { through: ProjectMember, as: 'members' });

module.exports = {
  User,
  Project,
  Task,
  ProjectMember,
  sequelize
}; 