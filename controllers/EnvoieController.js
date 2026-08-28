const envoie = require("../model/Envoie");
const asyncHandler = require("express-async-handler");

exports.insertEnvoie = asyncHandler(async (req, res)=> {
    try {
        const {nom, telephone} = req.body;
    
        const resultat = await envoie.create({nom, telephone});

        if(resultat) {
            res.status(200).json('Compte ajouter !');       
        } else {
            res.status(401).json('Erreur de l\'insrtion du compte !');
        }
    } catch (error) {
        console.error('Error', error);
    }
    
})

exports.getEnvoie = asyncHandler(async (req, res)=> {
    try {
        const type = true;
        const resultat = await envoie.findAll({ where: { type }});

        if(resultat) {
            res.json(resultat);
        } else {
            res.status(401).json('Erreur de recuperation !');
        }
    } catch (error) {
        console.error('Error', error);
    }
    
})

exports.fndAll = asyncHandler(async (req, res)=> {
    try {
        const resultat = await envoie.findAll();

        if(resultat) {
            res.json(resultat);
        } else {
            res.status(401).json('Erreur de recuperation !');
        }
    } catch (error) {
        console.error('Error', error);
    }
    
})

exports.remove = asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const count = await envoie.destroy({ where: { id }});
        if (count === 0) {
          res.status(401).json('Error lors de suppression !');
        }
        res.status(200).json('Compte supprimé !');
    } catch (error) {
      console.error('Error', error);
    }
});

exports.updateCompte = asyncHandler(async (req, res)=> {
    const { type } = req.body;
    const id = req.params.id;
    const [resultat] = await envoie.update(
        { type },
        { where: { id } }
    );

    if(resultat) {
        if(type == true){
            res.status(200).json("compte activé!");
        }else{
            res.status(200).json("compte désactivé!");
        }         
    } else {
        res.status(401).json('Une erreur s\'est profuite!');
    }
})