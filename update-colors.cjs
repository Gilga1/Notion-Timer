const fs = require('fs');
let code = fs.readFileSync('client/src/pages/today.tsx', 'utf8');

code = code.replace(/bg-zinc-900 border-zinc-800 hover:border-zinc-700/g, 'bg-card border-border hover:bg-secondary/50');
code = code.replace(/text-zinc-100/g, 'text-foreground');
code = code.replace(/text-zinc-500/g, 'text-muted-foreground');
code = code.replace(/bg-zinc-800 hover:bg-zinc-700/g, 'bg-secondary hover:bg-secondary/80');
code = code.replace(/text-zinc-300/g, 'text-foreground');
code = code.replace(/bg-zinc-900 border border-zinc-800/g, 'bg-card border border-border');
code = code.replace(/text-zinc-600/g, 'text-muted-foreground/70');
code = code.replace(/text-zinc-400/g, 'text-muted-foreground');
code = code.replace(/bg-zinc-800/g, 'bg-secondary');
code = code.replace(/bg-zinc-600/g, 'bg-muted-foreground/30');
code = code.replace(/border-zinc-600/g, 'border-muted-foreground/30');
code = code.replace(/border-zinc-800/g, 'border-border');
code = code.replace(/bg-zinc-900/g, 'bg-background');
code = code.replace(/text-zinc-200/g, 'text-foreground');
code = code.replace(/stroke="#27272a"/g, 'stroke="currentColor" className="text-secondary"');

fs.writeFileSync('client/src/pages/today.tsx', code);
console.log("Updated today.tsx colors");
