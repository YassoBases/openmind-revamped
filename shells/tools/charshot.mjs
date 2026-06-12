/**
 * Character preview: renders Hudhud + Nahla in a grid of expressions/states
 * against a Phaser scene, so the brand art can be iterated visually.
 *   node tools/charshot.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');
const phaser = readFileSync(join(root, 'node_modules', 'phaser', 'dist', 'phaser.min.js'), 'utf8');
const gamefeel = readFileSync(join(shellsDir, 'src', 'lib', 'gamefeel.js'), 'utf8');
const mascot = readFileSync(join(shellsDir, 'src', 'lib', 'mascot.js'), 'utf8');

const html = `<!doctype html><html><head><meta charset=utf8><style>html,body{margin:0;background:#fff}</style></head>
<body><div id=app></div>
<script>${phaser}</script><script>${gamefeel}</script><script>${mascot}</script>
<script>
const W=1200,H=720;
class S extends Phaser.Scene{
  create(){
    this.add.rectangle(W/2,H/2,W,H,0xf6efe2);
    const accent=0x1cb0f6;
    const hooExprs=['idle','happy','thinking','sad','celebrating','surprised'];
    const beeExprs=['idle','happy','cheering','celebrating','sleeping'];
    hooExprs.forEach((e,i)=>{
      const x=110+i*190, y=180;
      this.add.text(x,300,'hudhud:'+e,{fontFamily:'sans-serif',fontSize:'15px',color:'#7a2d22'}).setOrigin(0.5);
      const h=new Hoopoe(this,x,y,{accent,scale:1.15});
      h.setExpression(e);
      if(e==='celebrating')h.crestPop('fan');
    });
    beeExprs.forEach((e,i)=>{
      const x=150+i*220, y=520;
      this.add.text(x,640,'nahla:'+e,{fontFamily:'sans-serif',fontSize:'15px',color:'#7a2d22'}).setOrigin(0.5);
      const b=new Bee(this,x,y,{accent,scale:1.5});
      b.setExpression(e);
      if(e==='cheering'||e==='celebrating')b.showXp(true);
    });
    // a big hero pair, XP shown
    window.__ready=true;
  }
}
new Phaser.Game({type:Phaser.AUTO,parent:'app',width:W,height:H,backgroundColor:'#f6efe2',scene:S});
</script></body></html>`;

const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(outDir, 'characters.png') });
console.log('errors:', errs.length ? errs.slice(0, 5).join('\n') : 'none');
await browser.close();
