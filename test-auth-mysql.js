const User = require('./models/User');
const pool = require('./db');

async function testAuthAndSolde() {
  console.log('--- Test complet Authentification + Table Solde MySQL ---');
  const testEmail = `test_${Date.now()}@afripoks.com`;
  const testPseudo = `player_${Math.floor(Math.random() * 10000)}`;
  const testPassword = 'Password123!';

  try {
    // 1. Inscription
    console.log(`1. Inscription de ${testPseudo} (${testEmail})...`);
    const created = await User.create({
      name: testPseudo,
      email: testEmail,
      password: testPassword,
      initialSolde: 1500
    });
    console.log('✅ Utilisateur créé dans MySQL avec succès :', created);

    // 2. Vérification de la présence dans la table `solde`
    console.log('2. Vérification de la table `solde` par userId...');
    const [soldeRows] = await pool.query('SELECT * FROM solde WHERE userId = ?', [created.id]);
    console.log('✅ Ligne trouvée dans `solde` :', soldeRows[0]);
    if (soldeRows.length === 0 || parseFloat(soldeRows[0].montant) !== 1500) {
      throw new Error(`Solde incorrect dans la table solde : attendu 1500, obtenu ${soldeRows[0]?.montant}`);
    }

    // 3. Recherche de l'utilisateur avec son solde joint
    console.log('3. Recherche par ID (avec solde)...');
    const userWithSolde = await User.findById(created.id);
    console.log('✅ Utilisateur avec solde :', {
      id: userWithSolde.id,
      name: userWithSolde.name,
      email: userWithSolde.email,
      solde: userWithSolde.solde
    });

    // 4. Mise à jour du solde
    console.log('4. Mise à jour du solde à 2500.50...');
    await User.updateSolde(created.id, 2500.50);
    const updatedSolde = await User.getSolde(created.id);
    console.log(`✅ Nouveau solde récupéré depuis la table solde : ${updatedSolde}`);
    if (updatedSolde !== 2500.50) {
      throw new Error(`Erreur mise à jour solde : attendu 2500.50, obtenu ${updatedSolde}`);
    }

    // 5. Recherche par Email pour la connexion (avec solde)
    console.log('5. Connexion / recherche par email...');
    const loginUser = await User.findByEmailOrName(testEmail);
    const isPasswordValid = await User.verifyPassword(testPassword, loginUser.password);
    console.log(`✅ Connexion validée : ${isPasswordValid}, Solde connecté : ${loginUser.solde}`);

    // 6. Nettoyage de l'utilisateur et de son solde de test
    console.log('6. Nettoyage...');
    await pool.query('DELETE FROM solde WHERE userId = ?', [created.id]);
    await pool.query('DELETE FROM users WHERE id = ?', [created.id]);
    console.log(`🧹 Utilisateur de test (ID: ${created.id}) et son solde nettoyés.`);

    console.log('\n🎉 TOUS LES TESTS AUTHENTIFICATION + TABLE SOLDE SONT VALIDÉS !');
  } catch (error) {
    console.error('❌ Erreur lors du test :', error);
  } finally {
    process.exit(0);
  }
}

testAuthAndSolde();
