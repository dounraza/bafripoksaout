const { Sequelize } = require("sequelize"); 
const retrait = require("../model/RetraitMobileMoney");
const asyncHandler = require("express-async-handler");
const User = require("../model/User");
const Soldes = require("../model/Soldes");

exports.retrait = asyncHandler(async (req, res) => {
  const { pseudo, montant, numero, nom } = req.body;

  // Trouver l'utilisateur
  const user = await User.findOne({ where: { name: pseudo } });
  if (!user) {
    return res.status(404).json({ message: "Utilisateur introuvable" });
  }

  // Trouver le solde de l'utilisateur
  const solde = await Soldes.findOne({ where: { userId: user.id } });
  console.log(montant);
  
  if (!solde || Number(solde.montant) < Number(montant)) {
    return res.status(400).json({ message: "Solde insuffisant" });
  }

  if(Number(montant) <= 0) {
    return res.status(500).json({ message: "Montant incorrecte" });    
  }

  // Déduire immédiatement le solde
  const newSolde = Number(solde.montant) - Number(montant);
  await Soldes.update({ montant: newSolde }, { where: { userId: user.id } });

  // Créer la demande de retrait avec etat = false (en attente)
  const resultat = await retrait.create({ pseudo, montant, numero, nom, etat: false });

  if (resultat) {
    res.status(200).json("Retrait demandé, solde débité !");
  } else {
    // En cas d'erreur création retrait, on remet le solde (rollback manuel)
    await Soldes.update({ montant: solde.montant }, { where: { userId: user.id } });
    res.status(500).json('Erreur lors du retrait !');
  }
});

exports.findByPseudo = asyncHandler(async (req, res)=> {
    const pseudo = req.params.pseudo;
    const retraitAll = await retrait.findAll({ where: { pseudo } });

    if(retraitAll) {
        res.status(200).json(retraitAll);          
    } else {
        res.status(401).json('Erreur lors du depot !');
    }
})
exports.findByEtat = asyncHandler(async (req, res)=> {
    const etat = req.params.etat;
    const retraitAll = await retrait.findAll({ where: { etat } });

    if(retraitAll) {
        res.status(200).json(retraitAll);          
    } else {
        res.status(401).json('Erreur lors du depot !');
    }
})
exports.findAll = asyncHandler(async (req, res)=> {
    const retraitAll = await retrait.findAll({
        where: {
            etat: false,
            // Comparaison entre CreatedAt et UpdatedAt
            [Sequelize.Op.and]: [
                Sequelize.where(
                    Sequelize.col("CreatedAt"),
                    "=",
                    Sequelize.col("UpdatedAt")
                ),
            ],
        },
        order: [
            ['id', 'DESC'] // ou 'DESC' pour l'ordre décroissant
        ]
    });

    if(retraitAll) {
        res.status(200).json(retraitAll);          
    } else {
        res.status(401).json('Erreur lors du depot !');
    }
})

exports.transaction = asyncHandler(async (req, res) => {
  const id = req.params.id; // id de la demande retrait
  const { etat } = req.body; // true ou false
  console.log('[TRANSACTION MOBILE] id', id);
  console.log('[TRANSACTION MOBILE] etat', etat);
  try {
    // Trouver la demande
    const demande = await retrait.findByPk(id);
    if (!demande) {
      return res.status(404).json({ message: "Demande de retrait introuvable" });
    }
    console.info('[TRANSACTION MOBILE] demande', demande);

    // Trouver utilisateur et solde
    const user = await User.findOne({ where: { name: demande.pseudo } });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }
    const solde = await Soldes.findOne({ where: { userId: user.id } });
    if (!solde) {
      return res.status(404).json({ message: "Solde utilisateur introuvable" });
    }
    
    console.log('[TRANSACTION MOBILE] solde.montant', solde.montant);
    console.log('[TRANSACTION MOBILE] demande.montant', demande.montant);
    console.log('[TRANSACTION MOBILE] user.id', user.id);
    
    // Si refus (etat = false) ET la demande était en attente, on restitue le solde
    if (etat === false && (demande.etat === false || parseInt(demande.etat) === 0)) {
      console.log('[TRANSACTION MOBILE] restitute solde');
      const newSolde = Number(solde.montant) + Number(demande.montant);
      await Soldes.update({ montant: newSolde }, { where: { userId: user.id } });
    }

    // Mettre à jour l'état de la demande
    const [updated] = await retrait.update({ etat }, { where: { id } });

    if (updated) {
      const updatedDemande = await retrait.findByPk(id);
      res.status(200).json({ message: "Mise à jour réussie", demande: updatedDemande });
    } else {
      res.status(404).json({ message: "Demande non trouvée pour mise à jour" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur lors de la mise à jour" });
  }
});


exports.findAllDesc = asyncHandler(async (req, res)=> {
    const retraitAll = await retrait.findAll({
        order: [
            ['id', 'DESC'] // ou 'DESC' pour l'ordre décroissant
        ]
    });

    if(retraitAll) {
        
        res.status(200).json(retraitAll);          
    } else {
        res.status(401).json('Erreur lors du depot !');
    }
})