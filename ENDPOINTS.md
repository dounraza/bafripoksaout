# API Endpoints Documentation

## Authentication
- POST `/api/auth/login`
- POST `/api/auth/register`
- POST `/api/auth/admin/login`
- POST `/api/auth/admin/register`

## Soldes
- POST `/api/solde/init`
- GET `/api/solde/:id`
- POST `/api/solde/update/:id`
- GET `/api/solde-all` (Admin)
- GET `/api/total-solde` (Admin)

## Dépôts
- POST `/api/depot/crypto-money`
- GET `/api/depot/crypto-money`
- GET `/api/depot/crypto-money/desc`
- GET `/api/depot/crypto-money/:pseudo`
- GET `/api/depot/crypto-money/etat/:etat`
- POST `/api/depot/crypto-money/transaction/:id`
- POST `/api/depot/mobile-money`
- GET `/api/depot/mobile-money`
- GET `/api/depot/mobile-money/desc`
- GET `/api/depot/mobile-money/:pseudo`
- GET `/api/depot/mobile-money/etat/:etat`
- POST `/api/depot/mobile-money/transaction/:id`

## Retraits
- POST `/api/retrait/crypto-money`
- GET `/api/retrait/crypto-money`
- GET `/api/retrait/crypto-money/desc`
- GET `/api/retrait/crypto-money/:pseudo`
- GET `/api/retrait/crypto-money/etat/:etat`
- POST `/api/retrait/crypto-money/transaction/:id`
- POST `/api/retrait/mobile-money`
- GET `/api/retrait/mobile-money`
- GET `/api/retrait/mobile-money/desc`
- GET `/api/retrait/mobile-money/:pseudo`
- GET `/api/retrait/mobile-money/etat/:etat`
- POST `/api/retrait/mobile-money/transaction/:id`

## Tables & Jeu
- GET `/api/` (Tables)
- GET `/api/:id` (Table by ID)
- GET `/api/in-table/:userId`

## Envois
- POST `/api/compte`
- GET `/api/compte`
- GET `/api/compte/All`
- DELETE `/api/compte/remove/:id`
- PUT `/api/compte/:id`

## Historique
- GET `/api/historique/all`
- GET `/api/historique/table/:tableName/last`
- GET `/api/historique/last/:tableName`
- GET `/api/historique/last-history/:tableName`

## Types Crypto
- GET `/api/type-crypto-money`
- GET `/api/type-crypto-money/actif`
- POST `/api/type-crypto-money`
- PUT `/api/type-crypto-money/:id`

## Utilisateurs
- GET `/api/userConnected`
- PUT `/api/users/:userId`
- GET `/api/users/avatar/:userId`
- POST `/api/users/upload-avatar`
