const pool = require('./db');

async function checkSolde() {
  console.log('--- Inspection table `solde` ---');
  try {
    const [cols] = await pool.query('DESCRIBE solde');
    console.log('📋 Structure de la table `solde` :');
    cols.forEach(c => console.log(`  - ${c.Field} (${c.Type}) | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default}`));

    const [rows] = await pool.query('SELECT * FROM solde LIMIT 10');
    console.log('\n📊 Exemples de données dans `solde` :', rows);
  } catch (error) {
    console.error('Erreur:', error.message);
  } finally {
    process.exit(0);
  }
}

checkSolde();
