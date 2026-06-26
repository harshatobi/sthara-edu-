const fs = require('fs');
const { spawnSync } = require('child_process');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const lines = envLocal.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const splitIndex = trimmed.indexOf('=');
    if (splitIndex !== -1) {
      const key = trimmed.substring(0, splitIndex);
      let value = trimmed.substring(splitIndex + 1);
      
      // Remove surrounding quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
         value = value.substring(1, value.length - 1);
      }

      console.log(`Pushing ${key} to Vercel...`);
      
      // We spawn vercel env add and write the value to its stdin
      const child = spawnSync('npx.cmd', ['vercel', 'env', 'add', key, 'production'], {
        input: value,
        encoding: 'utf8'
      });
      
      if (child.status !== 0) {
          console.error(`Error adding ${key}: ${child.stderr}`);
          // If it says "already exists", we can try `vercel env rm KEY production -y` then add again
          if (child.stderr && child.stderr.includes('already exists')) {
             console.log(`Key ${key} already exists. Overwriting is interactive via CLI, skipping...`);
          }
      } else {
          console.log(`Successfully added ${key}`);
      }
    }
  }
}
