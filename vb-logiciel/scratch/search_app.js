const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'App.js');
const query = process.argv[2];

if (!query) {
  console.log("Usage: node search_app.js <search_query>");
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
let matchCount = 0;

console.log(`Searching for "${query}" in App.js...`);

lines.forEach((line, index) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    matchCount++;
    console.log(`${index + 1}: ${line.trim()}`);
  }
});

console.log(`Found ${matchCount} matches.`);
