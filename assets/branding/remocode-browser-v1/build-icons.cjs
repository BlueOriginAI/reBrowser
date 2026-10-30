const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const sharp = require('sharp');
const root = __dirname;
(async () => {
  const svg = fs.readFileSync(path.join(root, 'icon-master.svg'));
  for (const size of [16,32,48,64,128,256,512,1024]) {
    await sharp(svg).resize(size,size).png().toFile(path.join(root,`icon-${size}.png`));
  }
  await sharp(fs.readFileSync(path.join(root,'logo-mark.svg'))).png().toFile(path.join(root,'logo-mark.png'));
  const set = path.join(root,'RemocodeBrowser.iconset'); fs.mkdirSync(set,{recursive:true});
  for (const size of [16,32,128,256,512]) {
    for (const [suffix,px] of [['',size],['@2x',size*2]]) {
      fs.copyFileSync(path.join(root,`icon-${px}.png`),path.join(set,`icon_${size}x${size}${suffix}.png`));
    }
  }
  if (process.platform === 'darwin') cp.execFileSync('iconutil',['-c','icns',set,'-o',path.join(root,'RemocodeBrowser-v1.icns')]);
  console.log('Exported clean SVG-rendered app icons and transparent logo.');
})().catch(e=>{console.error(e);process.exitCode=1});
