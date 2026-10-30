const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const sharp = require('sharp');
const root = __dirname;
(async () => {
  const svg = fs.readFileSync(path.join(root, 'icon-master.svg'));
  for (const size of [16,22,24,32,48,64,96,128,192,256,512,1024]) {
    await sharp(svg).resize(size,size).png().toFile(path.join(root,`icon-${size}.png`));
  }
  await sharp(fs.readFileSync(path.join(root,'logo-mark.svg'))).png().toFile(path.join(root,'logo-mark.png'));
  const set = path.join(root,'RemocodeBrowser.iconset'); fs.mkdirSync(set,{recursive:true});
  for (const size of [16,32,128,256,512]) {
    for (const [suffix,px] of [['',size],['@2x',size*2]]) {
      fs.copyFileSync(path.join(root,`icon-${px}.png`),path.join(set,`icon_${size}x${size}${suffix}.png`));
    }
  }
  if (process.platform === 'darwin') {
    cp.execFileSync('iconutil',['-c','icns',set,'-o',path.join(root,'RemocodeBrowser-v2.icns')]);
    // CFBundleIconName uses the asset catalog before CFBundleIconFile.
    const mac = path.join(root, 'mac');
    const catalog = path.join(mac, 'Assets.xcassets');
    const appIcon = path.join(catalog, 'AppIcon.appiconset');
    fs.mkdirSync(appIcon, {recursive:true});
    const info = {author:'xcode', version:1};
    const images = [];
    for (const size of [16,32,128,256,512]) {
      for (const scale of [1,2]) {
        const px = size * scale;
        const filename = `appicon_${px}.png`;
        fs.copyFileSync(path.join(root,`icon-${px}.png`),path.join(appIcon,filename));
        images.push({filename,idiom:'mac',scale:`${scale}x`,size:`${size}x${size}`});
      }
    }
    fs.writeFileSync(path.join(catalog,'Contents.json'),JSON.stringify({info},null,2));
    fs.writeFileSync(path.join(appIcon,'Contents.json'),JSON.stringify({images,info},null,2));
    cp.execFileSync('xcrun',['actool',catalog,'--compile',mac,'--platform','macosx',
      '--minimum-deployment-target','12.0','--app-icon','AppIcon',
      '--output-partial-info-plist',path.join(mac,'assetcatalog-info.plist')]);
    fs.copyFileSync(path.join(root,'RemocodeBrowser-v2.icns'),path.join(mac,'app.icns'));
  }
  console.log('Exported clean SVG-rendered app icons and transparent logo.');
})().catch(e=>{console.error(e);process.exitCode=1});
