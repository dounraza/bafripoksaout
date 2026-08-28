const ALL_CARDS = [
  '2c', '2d', '2h', '2s',
  '3c', '3d', '3h', '3s',
  '4c', '4d', '4h', '4s',
  '5c', '5d', '5h', '5s',
  '6c', '6d', '6h', '6s',
  '7c', '7d', '7h', '7s',
  '8c', '8d', '8h', '8s',
  '9c', '9d', '9h', '9s',
  'Tc', 'Td', 'Th', 'Ts',
  'Jc', 'Jd', 'Jh', 'Js',
  'Qc', 'Qd', 'Qh', 'Qs',
  'Kc', 'Kd', 'Kh', 'Ks',
  'Ac', 'Ad', 'Ah', 'As'
];

function completeToFiveCards(input, playersCards, isAutoCompletion) {
  
  if (!isAutoCompletion || input.length >= 5) {
    return input;
  }

  // Flatten hole cards for all players
  const allHoleCards = playersCards.flat();
  
  // Create a set of all currently used cards (community + players)
  const usedSet = new Set([...input, ...allHoleCards]
    .filter(card => card != null)
    .map(card => card.toLowerCase()));

  // Filter available cards to ensure no duplicates
  const remaining = ALL_CARDS.filter(card => !usedSet.has(card.toLowerCase()));

  // Fisher-Yates shuffle
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }

  const needed = 5 - input.length;
  const additional = remaining.slice(0, needed);
  
  return [...input, ...additional];
}

module.exports = { completeToFiveCards }