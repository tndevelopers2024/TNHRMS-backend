const fs = require('fs');
const path = require('path');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(file));
        } else {
            if (file.endsWith('.jsx') || file.endsWith('.js')) {
                results.push(file);
            }
        }
    });
    return results;
}

const frontendSrcPath = path.resolve(__dirname, '../frontend/src');
const files = walkDir(frontendSrcPath);

let replacedCount = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Convert fetch("/api/..." or fetch('/api/...' to fetch(`http://${window.location.hostname}:5000/api/...`
    content = content.replace(/fetch\(['"]\/api\/([^'"]+)['"]/g, 'fetch(`http://${window.location.hostname}:5000/api/$1`)');
    
    // Convert fetch(`/api/...` to fetch(`http://${window.location.hostname}:5000/api/...`
    content = content.replace(/fetch\(`\/api\//g, 'fetch(`http://${window.location.hostname}:5000/api/');
    
    if (original !== content) {
        fs.writeFileSync(file, content, 'utf8');
        replacedCount++;
    }
});

console.log(`Successfully updated ${replacedCount} files.`);
