import fs from 'fs';
import path from 'path';

function scan(dir, results = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scan(fullPath, results);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes("from 'firebase/") || content.includes('from "firebase/') || content.includes('@/lib/firebase') || content.includes("import('firebase")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const found = scan('./src');
console.log('Files still referencing firebase:', found);
