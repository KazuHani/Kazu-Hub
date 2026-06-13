const fs = require('fs');
const css = fs.readFileSync('styles.css', 'utf8');
const checks = [
    ['bg-[#070e1a]', css.includes('070e1a')],
    ['z-[100]', css.includes('z-\\\\[100\\\\]') || css.indexOf('[100]') > -1],
    ['tracking-[0.35em]', css.includes('0\\.35')],
    ['text-[0.65rem]', css.includes('0\\.65')],
    ['max-w-[95rem]', css.includes('95rem')],
    ['text-cyan-400/40', css.includes('40\\/40') || css.includes('cyan-400\\/40')],
    ['animate-pulse', css.includes('animate-pulse')],
    ['animate-float-avatar', css.includes('animate-float-avatar') || css.includes('float-avatar')],
    ['bg-[#0a1526]', css.includes('0a1526')],
    ['backdrop-blur-[24px]', css.includes('24px') && css.includes('backdrop-blur')],
    ['dashboard-wrapper', css.includes('dashboard-wrapper')],
    ['bento-grid', css.includes('bento-grid')],
    ['glass-panel', css.includes('glass-panel')],
    ['loader-ring', css.includes('loader-ring')],
    ['mesh-gradient', css.includes('mesh-gradient')],
    ['tech-font', css.includes('tech-font')],
    ['content-hidden', css.includes('content-hidden')],
    ['entrance-anim', css.includes('entrance-anim')],
];

checks.forEach(([name, result]) => {
    console.log((result ? '✓' : '✗') + ' ' + name);
});
console.log('\nCSS file size:', css.length, 'bytes');
