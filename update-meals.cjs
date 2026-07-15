const fs = require('fs');
let code = fs.readFileSync('client/src/pages/meals.tsx', 'utf8');

code = code.replace(/bg-blue-600 text-white/g, 'bg-primary text-primary-foreground shadow-sm');
code = code.replace(/bg-zinc-800 text-zinc-400 hover:bg-zinc-700/g, 'bg-secondary text-secondary-foreground hover:bg-secondary/80');
code = code.replace(/className="flex-1 min-w-\[120px\] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1\.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"/g, 'className="flex-1 min-w-[120px] bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"');
code = code.replace(/text-zinc-500/g, 'text-muted-foreground');
code = code.replace(/border-zinc-800/g, 'border-border');
code = code.replace(/text-zinc-500 hover:text-zinc-300/g, 'text-muted-foreground hover:text-foreground');
code = code.replace(/focus:border-zinc-500/g, 'focus:border-primary');
code = code.replace(/bg-zinc-800 hover:bg-zinc-700 text-zinc-300/g, 'bg-secondary hover:bg-secondary/80 text-secondary-foreground');
code = code.replace(/bg-zinc-900 border border-zinc-800/g, 'bg-card border border-border');
code = code.replace(/text-zinc-300/g, 'text-foreground');
code = code.replace(/border-t border-zinc-800/g, 'border-t border-border');
code = code.replace(/text-zinc-400/g, 'text-muted-foreground');

fs.writeFileSync('client/src/pages/meals.tsx', code);
console.log("Updated meals.tsx colors");
