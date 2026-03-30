import fs from 'fs';
const files = fs.readdirSync('src/commands/slash').filter(f => f.endsWith('.ts'));

for (const f of files) {
    const p = 'src/commands/slash/' + f;
    let c = fs.readFileSync(p, 'utf8');
    
    if (c.includes('placeBet( , ,') || c.includes('placeBet(,,') || c.includes('placeBet(, ,')) {
        let changed = false;
        
        if (f === 'bet.ts') {
            c = c.replace(/const challengerLocked = await economyRepo\.placeBet\(,\s*,\s*'bet_bet',\s*'Apuesta de bet'\);/g, 
                          "const challengerLocked = await economyRepo.placeBet(challenger.id, amount, 'bet_bet', 'Apuesta de bet');");
            c = c.replace(/const challengedLocked = await economyRepo\.placeBet\(,\s*,\s*'bet_bet',\s*'Apuesta de bet'\);/g, 
                          "const challengedLocked = await economyRepo.placeBet(challenged.id, amount, 'bet_bet', 'Apuesta de bet');");
            changed = true;
        } else if (f === 'rps.ts') {
            c = c.replace(/const placed = await economyRepo\.placeBet\(,\s*,\s*'rps_bet',\s*'Apuesta de rps'\);/g, 
                          "const placed = await economyRepo.placeBet(userId, bet, 'rps_bet', 'Apuesta en Piedra, Papel o Tijera');");
            c = c.replace(/const oppLocked = await economyRepo\.placeBet\(,\s*,\s*'rps_bet',\s*'Apuesta de rps'\);/g, 
                          "const oppLocked = await economyRepo.placeBet(opponent.id, bet, 'rps_bet', 'Apuesta en Piedra, Papel o Tijera');");
            changed = true;
        } else {
            c = c.replace(/placeBet\(\s*,\s*,\s*'([^']+)',\s*'([^']+)'\)/g, "placeBet(userId, bet, '$1', '$2')");
            changed = true;
        }
        
        if (changed) {
            fs.writeFileSync(p, c);
            console.log('Fixed ', f);
        }
    }
}
