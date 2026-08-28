const asyncHandler = require("express-async-handler");
const HistoriqueMain = require("../model/HistoriqueMain");

exports.getAllHistorique = asyncHandler(async (req, res) => {
    try {
        console.log("miditra");
        
        const historiques = await HistoriqueMain.findAll({
            order: [['datetime', 'DESC']]
        });
        res.json(historiques);
    } catch (error) {
        console.error("Erreur lors de la récupération de l'historique :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de l'historique." });
    }
});

exports.getLastHistoriqueByTable = asyncHandler(async (req, res) => {
    try {
        const { tableName } = req.params;
        
        if (!tableName) {
            return res.status(400).json({ message: "Le nom de la table est requis." });
        }
        
        const historique = await HistoriqueMain.findOne({
            where: {
                table_name: tableName
            },
            order: [['datetime', 'DESC']]
        });
        
        if (!historique) {
            return res.json(null);
        }
        
        // Extraire tous les noms des joueurs
        const joueurs = new Set();
        
        // Ajouter les noms depuis main_joueurs
        if (historique.main_joueurs && Array.isArray(historique.main_joueurs)) {
            historique.main_joueurs.forEach(joueur => {
                if (joueur.pseudo) {
                    joueurs.add(joueur.pseudo);
                }
            });
        }
        
        // Ajouter les noms depuis foldes
        if (historique.foldes && Array.isArray(historique.foldes)) {
            historique.foldes.forEach(nom => {
                if (nom) {
                    joueurs.add(nom);
                }
            });
        }
        
        // Ajouter les noms depuis gagnants
        if (historique.gagnants && Array.isArray(historique.gagnants)) {
            historique.gagnants.forEach(nom => {
                if (nom) {
                    joueurs.add(nom);
                }
            });
        }
        
        // Créer la réponse avec les noms des joueurs
        const response = {
            ...historique.toJSON(),
            joueurs: Array.from(joueurs)
        };
        
        res.json(response);
    } catch (error) {
        console.error("Erreur lors de la récupération du dernier historique :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du dernier historique." });
    }
});
