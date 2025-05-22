const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { testConnection, syncDatabase } = require('./config/database');

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connexion à la base de données
testConnection();

// Synchroniser les modèles avec la base de données
// Force à false pour ne pas supprimer les données existantes
syncDatabase(false);

// Routes de base
app.get('/', (req, res) => {
  res.json({ message: 'Bienvenue sur l\'API de TaskCollab' });
});

// Importation des routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Une erreur est survenue',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
});

module.exports = app; 