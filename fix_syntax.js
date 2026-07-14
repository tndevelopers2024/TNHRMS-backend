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
    
    // Fix `)),` if any
    content = content.replace(/`\)\),/g, '`,');
    
    // Fix `)), {` if any
    content = content.replace(/`\)\), \{/g, '`, {');

    // Fix `), {` -> `, {`
    content = content.replace(/`\), \{/g, '`, {');
    
    // Fix `))` -> `)`
    content = content.replace(/`\)\)/g, '`)');
    
    if (original !== content) {
        fs.writeFileSync(file, content, 'utf8');
        replacedCount++;
    }
});

console.log(`Successfully fixed syntax in ${replacedCount} files.`);
