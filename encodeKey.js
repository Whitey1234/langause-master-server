const fs = require('fs');

const key = fs.readFileSync('./tutor-booking--service-key.json', 'utf8');
const base64Key = Buffer.from(key).toString('base64');
console.log(base64Key);
// echo "# langause-master-server" >> README.md 
// git init
// git add README.md
// git commit -m "first commit"
// git branch -M main
// git remote add origin https://github.com/Whitey1234/langause-master-server.git
// git push -u origin main
// https://github.com/Whitey1234/langause-master-server.git