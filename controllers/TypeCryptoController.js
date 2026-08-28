const types = require("../model/TypeCryptoMoney");
const asyncHandler = require("express-async-handler");

exports.findType = asyncHandler(async (req, res)=> {
    const type = await types.findAll();

    if(type) {
        res.status(200).json(type);          
    } else {
        res.status(401).json('Erreur lors de la recuperation !');
    }
})

exports.findTypeAcrtif = asyncHandler(async (req, res)=> {
    const type = true;
    const typeCrypto = await types.findAll({where : {type}});

    if(typeCrypto) {
        res.status(200).json(typeCrypto);          
    } else {
        res.status(401).json('Erreur lors de la recuperation !');
    }
})

exports.createType = asyncHandler(async (req, res)=> {
    const {name,code,adresse} = req.body;
    const type = await types.create({name,code,adresse});

    if(type) {
        res.status(200).json("type creer !");          
    } else {
        res.status(401).json('Erreur lors de la recuperation !');
    }
})

exports.updateType = asyncHandler(async (req, res)=> {
    const { type } = req.body;
    const id = req.params.id;
    const [resultat] = await types.update(
        { type },
        { where: { id } }
    );

    if(resultat) {
        if(type == true){
            res.status(200).json("Type crypto activé!");
        }else{
            res.status(200).json("Type Crypto désactivé!");
        }         
    } else {
        res.status(401).json('Une erreur s\'est profuite!');
    }
})
