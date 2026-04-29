
const fs = require('fs');
const content = fs.readFileSync('App.js', 'utf8');

let balance = 0;
let lines = content.split('\n');
let stacks = [];

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
        let char = line[j];
        if (char === '{') {
            balance++;
            stacks.push(i + 1);
        }
        if (char === '}') {
            balance--;
            stacks.pop();
            if (balance < 0) {
                 console.log(`EXCESS closing brace at line ${i+1}`);
                 balance = 0; // reset for next segments
            }
        }
    }
}

if (balance !== 0) {
    console.log(`Unbalanced! Balance is ${balance}`);
    console.log(`Last unclosed brace opened at line(s): ${stacks.join(', ')}`);
} else {
    console.log("Balanced!");
}
