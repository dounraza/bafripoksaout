const { where } = require("sequelize");
const { Sequelize, Op } = require("sequelize"); 
const Depot = require("../model/DepotMobileMoney");
const asyncHandler = require("express-async-handler");
const User = require("../model/User");
const Soldes = require("../model/Soldes");

exports.depot = asyncHandler(async (req, res)=> {
    const {pseudo, montant, numero, nom, reference} = req.body;

    if(Number(montant)<=0) {
        res.status(500).json({message: 'Montant incorecte'});
    }

    const depot = await Depot.create({pseudo, montant, numero, nom, reference });

    if(depot) {
        res.status(200).json("depot effcetuer !");          
    } else {
        res.status(500).json('Erreur lors du depot !');
    }
})
exports.findByPseudo = asyncHandler(async (req, res)=> {
    const pseudo = req.params.pseudo;
    const depot = await Depot.findAll({ where: { pseudo } });

    if(depot) {
        res.status(200).json(depot);          
    } else {
        res.status(500).json('Erreur lors du depot !');
    }
})
exports.findByEtat = asyncHandler(async (req, res)=> {
    const etat = req.params.etat;
    const depot = await Depot.findAll({ where: { etat } });

    if(depot) {
        res.status(200).json(depot);          
    } else {
        res.status(500).json('Erreur lors du depot !');
    }
})

exports.findAll = asyncHandler(async (req, res)=> {
    const depot = await Depot.findAll({
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

    if(depot) {
        res.status(200).json(depot);          
    } else {
        res.status(500).json('Erreur lors du depot !');
    }
})

exports.transaction = asyncHandler(async (req, res) => {
  const id = req.params.id; // id du dépôt à modifier
  const { etat } = req.body; // nouvelle valeur de etat

  try {
    // Vérifie si le dépôt existe
    const getDepot = await Depot.findByPk(id);
    
    if (!getDepot) {
      return res.status(500).json({ message: "Dépôt introuvable" });
    }

    // Récupère le pseudo de l'utilisateur
    const name = getDepot.pseudo;
    const user = await User.findOne({ where: { name } });
    

    // Vérifie si l'utilisateur existe
    if (!user) {
      return res.status(500).json({ message: "Utilisateur introuvable" });
    }

    // Vérifie si l'utilisateur a un solde suffisant
    const solde = await Soldes.findOne({ where: { userId: user.id } });

    // Met à jour l'état du dépôt
    const [updated] = await Depot.update(
      { etat },
      { where: { id } }
    );

    // Si l'état est "true", met à jour le solde de l'utilisateur
    if (etat === true) {
      const newSolde = Number(solde.montant) + Number(getDepot.montant);
      await Soldes.update({ montant: newSolde }, { where: { userId: user.id } });
    }

    // Vérifie si le dépôt a bien été mis à jour
    if (updated) {
      const updatedDepot = await Depot.findByPk(id);
      res.status(200).json({ message: "Mise à jour réussie", depot: updatedDepot });
    } else {
      res.status(500).json({ message: "Dépôt non trouvé" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur lors de la mise à jour" });
  }
});

exports.findAllDesc = asyncHandler(async (req, res)=> {
    const depot = await Depot.findAll({
        order: [
            ['id', 'DESC'] // ou 'DESC' pour l'ordre décroissant
        ]
    });

    if(depot) {
        res.status(200).json(depot);          
    } else {
        res.status(500).json('Erreur lors du depot !');
    }
})