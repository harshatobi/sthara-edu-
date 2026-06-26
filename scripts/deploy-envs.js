const fs = require('fs');
const cp = require('child_process');
const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');

for (const line of lines) {
    if(!line.includes('=') || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    const key = line.substring(0, idx).trim();
    let val = line.substring(idx+1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length-1);
        val = val.replace(/\\n/g, '\n'); // parse escaped newlines
    }
    
    // skip the one we already added to avoid interactive overwrite prompt
    if (key === 'NEXT_PUBLIC_FIREBASE_API_KEY') {
       console.log('Skipping NEXT_PUBLIC_FIREBASE_API_KEY (already added)');
       continue;
    }

    fs.writeFileSync('val.txt', val);
    console.log(`Setting ${key}...`);
    try {
        cp.execSync('cmd.exe /c "type val.txt | npx vercel env add ' + key + ' production"');
    } catch (e) {
        console.log(`Failed to set ${key}: ${e.message}`);
    }
}
if(fs.existsSync('val.txt')) fs.unlinkSync('val.txt');
console.log('Done!');
