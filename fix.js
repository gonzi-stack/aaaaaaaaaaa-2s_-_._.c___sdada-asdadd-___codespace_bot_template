const fs = require('fs');
const files = fs.readdirSync('src/commands/slash').filter(f => f.endsWith('.ts'));

for (const f of files) {
    const p = 'src/commands/slash/' + f;
    let c = fs.readFileSync(p, 'utf8');
    
    // In bet.ts
    // placeBet(, , 'bet_bet', 'Apuesta de bet'); -> this was challenger.id, amount
    // also challenged.id, amount
    
    // Most others are userId, bet
    if (c.includes('placeBet(,')) {
        if (f === 'bet.ts') {
             // Let's just fix bet manually
        } else {
             c = c.replace(/placeBet\(,\s*,\s*'([^']+)',\s*'([^']+)'\)/g, "placeBet(userId, bet, '$1', '$2')");
             fs.writeFileSync(p, c);
             console.log('Fixed ', f);
        }
    }
}
