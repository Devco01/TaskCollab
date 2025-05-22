const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuration de la base de données
const sequelize = new Sequelize(
  process.env.DB_NAME || 'taskcollab',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
	host: '127.0.0.1',
	dialect: 'mysql',
    port: 3307,
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Test de la connexion
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connexion à la base de données établie avec succès.');
  } catch (error) {
    console.error('Impossible de se connecter à la base de données:', error);
  }
};

// Synchronisation des modèles avec la base de données
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log(`Base de données synchronisée${force ? ' (tables recréées)' : ''}`);
  } catch (error) {
    console.error('Erreur lors de la synchronisation de la base de données:', error);
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase
}; 