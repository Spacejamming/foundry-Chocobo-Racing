const fs = require('fs');
const path = require('path');

// 1. Get the new version from package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const newVersion = packageData.version;

console.log(`Syncing version to v${newVersion} across files...`);

// 2. Update module.json
const moduleJsonPath = path.join(__dirname, 'module.json');
const moduleData = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));

moduleData.version = newVersion;
const repoUrl = packageData.repository.url.replace('git+', '').replace('.git', '');

// Assuming download URL pattern: https://github.com/Spacejamming/foundry-Chocobo-Racing/releases/download/vX.Y.Z/module.zip
moduleData.manifest = `${repoUrl}/releases/latest/download/module.json`;
moduleData.download = `${repoUrl}/releases/download/v${newVersion}/module.zip`;

fs.writeFileSync(moduleJsonPath, JSON.stringify(moduleData, null, 2) + '\n');
console.log(`Updated module.json to v${newVersion} and set download/manifest URLs.`);
console.log('Version synchronization complete.');
