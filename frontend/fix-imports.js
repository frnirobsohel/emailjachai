const fs = require('fs');
const path = require('path');

const walk = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
};

const files = walk('.');
files.forEach((file) => {
    let content = fs.readFileSync(file, 'utf8');
    const original = content;
    
    // Fix messed up imports from previous attempts
    content = content.replace(/@\/app\/\\\(dashboard\\\)\/_components\//g, '@/app/(dashboard)/_components/');
    
    // Standard replacements
    content = content.replace(/@\/components\/ui\//g, '@/components/common/');
    content = content.replace(/@\/components\/dashboard\//g, '@/app/(dashboard)/_components/');
    
    // Fix Store Imports
    content = content.replace(/@\/lib\/store\/use-auth-store/g, '@/lib/store/user-state');
    content = content.replace(/@\/lib\/store\/use-credit-store/g, '@/lib/store/credit-state');
    content = content.replace(/useAuthStore/g, 'useUserStore');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated: ${file}`);
    }
});
