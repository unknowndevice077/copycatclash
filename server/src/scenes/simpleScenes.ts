/**
 * "Simple pictures": original flat illustrations designed to be recreated in 20-45 seconds.
 * Few bold shapes, flat fills, and colors taken from the in-game palette so players can match them.
 * Rendered to JPEGs by `npm run photos:simple` (see scripts/generateSimpleScenes.ts).
 */
import type { Difficulty, PhotoCategory } from '@ccc/shared';

export interface SimpleScene {
  slug: string;
  title: string;
  category: PhotoCategory;
  difficulty: Difficulty;
  svg: string;
}

// In-game palette colors (see PALETTE_24) so every scene is reproducible with the swatches.
const K = {
  black: '#000000',
  dark: '#4a4a4a',
  grey: '#9b9b9b',
  white: '#ffffff',
  maroon: '#7a1f1f',
  red: '#e53935',
  pink: '#ff8a80',
  orange: '#ff7043',
  brown: '#8d5524',
  tan: '#f4a261',
  yellow: '#ffd166',
  cream: '#fff59d',
  green: '#2e7d32',
  lime: '#66bb6a',
  mint: '#b9f6ca',
  teal: '#00897b',
  navy: '#0d47a1',
  blue: '#1e88e5',
  sky: '#81d4fa',
  indigo: '#3949ab',
  purple: '#6a1b9a',
  violet: '#ab47bc',
  rose: '#f48fb1',
  sand: '#c2a878',
};

const W = 1024;
const H = 768;

// Tiny SVG builders.
const bg = (fill: string) => `<rect x="0" y="0" width="${W}" height="${H}" fill="${fill}"/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const circle = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, rot = 0) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''}/>`;
const poly = (pts: string, fill: string) => `<polygon points="${pts}" fill="${fill}"/>`;
const path = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;
const line = (d: string, stroke: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Upper half-disc sitting on the line y. */
const dome = (cx: number, y: number, r: number, fill: string) => path(`M ${cx - r} ${y} A ${r} ${r} 0 0 1 ${cx + r} ${y} Z`, fill);
const cloud = (x: number, y: number, s = 1) =>
  [ellipse(x, y, 70 * s, 42 * s, K.white), ellipse(x + 60 * s, y - 20 * s, 60 * s, 48 * s, K.white), ellipse(x + 115 * s, y, 70 * s, 40 * s, K.white)].join('');
const stars = (pts: Array<[number, number]>, r = 7) => pts.map(([x, y]) => circle(x, y, r, K.white)).join('');

export const SIMPLE_SCENES: SimpleScene[] = [
  // ------------------------------------------------------------------ landscapes
  {
    slug: 'sunset-over-the-sea',
    title: 'Sunset over the sea',
    category: 'landscapes',
    difficulty: 'easy',
    svg: bg(K.orange) + circle(512, 440, 140, K.yellow) + rect(0, 440, W, 328, K.navy) + rect(400, 510, 224, 16, K.yellow, 8) + rect(450, 570, 124, 14, K.yellow, 7),
  },
  {
    slug: 'green-hills',
    title: 'Green hills and sun',
    category: 'landscapes',
    difficulty: 'easy',
    svg: bg(K.sky) + circle(820, 150, 80, K.yellow) + ellipse(260, 790, 470, 320, K.lime) + ellipse(820, 820, 460, 330, K.green),
  },
  {
    slug: 'snowy-mountain',
    title: 'Snowy mountain',
    category: 'landscapes',
    difficulty: 'easy',
    svg: bg(K.sky) + poly('120,640 512,140 904,640', K.grey) + poly('432,242 512,140 592,242 552,226 512,256 472,226', K.white) + rect(0, 600, W, 168, K.lime),
  },
  {
    slug: 'moon-night',
    title: 'Moon over the hills',
    category: 'landscapes',
    difficulty: 'easy',
    svg:
      bg(K.navy) +
      circle(760, 200, 95, K.cream) +
      circle(805, 170, 88, K.navy) +
      stars([[150, 120], [300, 220], [460, 90], [600, 300], [900, 380], [220, 380]]) +
      ellipse(250, 820, 520, 260, K.indigo) +
      ellipse(850, 840, 480, 240, K.purple),
  },
  {
    slug: 'palm-island',
    title: 'Palm tree island',
    category: 'landscapes',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 430, W, 338, K.blue) +
      ellipse(512, 560, 280, 70, K.tan) +
      line('M 500 545 Q 480 420 540 300', K.brown, 30) +
      ellipse(470, 300, 110, 34, K.green, -25) +
      ellipse(610, 300, 110, 34, K.green, 25) +
      ellipse(520, 250, 34, 100, K.green, 10) +
      circle(840, 130, 70, K.yellow),
  },
  {
    slug: 'rainbow',
    title: 'Rainbow',
    category: 'landscapes',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      [K.red, K.orange, K.yellow, K.lime, K.blue, K.purple]
        .map((c, i) => {
          const r = 400 - i * 40;
          return line(`M ${512 - r} 640 A ${r} ${r} 0 0 1 ${512 + r} 640`, c, 42);
        })
        .join('') +
      rect(0, 620, W, 148, K.green) +
      cloud(40, 600, 1.1) +
      cloud(760, 600, 1.1),
  },
  {
    slug: 'tree-by-the-lake',
    title: 'Tree by the lake',
    category: 'landscapes',
    difficulty: 'easy',
    svg: bg(K.sky) + rect(0, 380, W, 388, K.lime) + ellipse(620, 570, 300, 110, K.blue) + rect(200, 300, 44, 220, K.brown) + circle(222, 270, 120, K.green),
  },
  {
    slug: 'volcano',
    title: 'Volcano',
    category: 'landscapes',
    difficulty: 'medium',
    svg:
      bg(K.pink) +
      circle(470, 190, 55, K.grey) +
      circle(545, 140, 65, K.grey) +
      circle(610, 85, 48, K.grey) +
      poly('170,700 430,270 594,270 854,700', K.brown) +
      poly('430,270 594,270 570,330 540,300 512,360 480,300 455,330', K.red) +
      rect(0, 690, W, 78, K.dark),
  },
  {
    slug: 'snowy-pines',
    title: 'Snowy pine trees',
    category: 'landscapes',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      rect(0, 520, W, 248, K.white) +
      [230, 512, 794]
        .map((x) => rect(x - 18, 520, 36, 70, K.brown) + poly(`${x - 130},540 ${x},200 ${x + 130},540`, K.green))
        .join(''),
  },
  {
    slug: 'beach-umbrella',
    title: 'Beach umbrella',
    category: 'landscapes',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 330, W, 150, K.blue) +
      rect(0, 480, W, 288, K.tan) +
      line('M 520 420 L 560 680', K.dark, 14) +
      dome(520, 430, 170, K.red) +
      circle(780, 640, 45, K.yellow),
  },
  {
    slug: 'desert-cactus',
    title: 'Desert cactus',
    category: 'landscapes',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      circle(820, 140, 75, K.yellow) +
      rect(0, 520, W, 248, K.tan) +
      rect(470, 250, 90, 340, K.green, 45) +
      rect(360, 340, 60, 150, K.green, 30) +
      rect(360, 440, 140, 50, K.green, 25) +
      rect(610, 300, 60, 150, K.green, 30) +
      rect(530, 400, 140, 50, K.green, 25),
  },

  // ------------------------------------------------------------------ food
  {
    slug: 'red-apple',
    title: 'Red apple',
    category: 'food',
    difficulty: 'easy',
    svg: bg(K.mint) + circle(440, 430, 175, K.red) + circle(584, 430, 175, K.red) + rect(500, 180, 24, 100, K.brown, 10) + ellipse(590, 210, 70, 30, K.green, -30),
  },
  {
    slug: 'watermelon-slice',
    title: 'Watermelon slice',
    category: 'food',
    difficulty: 'easy',
    svg:
      bg(K.cream) +
      path('M 170 280 A 342 342 0 0 0 854 280 Z', K.green) +
      path('M 210 280 A 302 302 0 0 0 814 280 Z', K.red) +
      [[380, 360], [512, 400], [640, 360], [450, 480], [580, 480]].map(([x, y]) => ellipse(x, y, 12, 20, K.black)).join(''),
  },
  {
    slug: 'pizza-slice',
    title: 'Pizza slice',
    category: 'food',
    difficulty: 'medium',
    svg:
      bg(K.blue) +
      poly('512,690 250,230 774,230', K.yellow) +
      line('M 250 230 Q 512 160 774 230', K.tan, 56) +
      circle(470, 330, 42, K.red) +
      circle(600, 340, 42, K.red) +
      circle(520, 480, 40, K.red),
  },
  {
    slug: 'ice-cream-cone',
    title: 'Ice cream cone',
    category: 'food',
    difficulty: 'easy',
    svg: bg(K.rose) + poly('390,390 634,390 512,720', K.tan) + circle(512, 330, 150, K.white) + circle(512, 170, 32, K.red),
  },
  {
    slug: 'fried-egg',
    title: 'Fried egg',
    category: 'food',
    difficulty: 'easy',
    svg: bg(K.blue) + circle(460, 400, 190, K.white) + circle(600, 370, 160, K.white) + circle(560, 490, 160, K.white) + circle(530, 410, 85, K.yellow),
  },
  {
    slug: 'banana',
    title: 'Banana',
    category: 'food',
    difficulty: 'easy',
    svg: bg(K.violet) + path('M 240 240 Q 512 800 820 270 Q 760 340 520 400 Q 300 380 240 240 Z', K.yellow) + circle(245, 245, 16, K.brown) + circle(815, 275, 14, K.brown),
  },
  {
    slug: 'donut',
    title: 'Pink donut',
    category: 'food',
    difficulty: 'easy',
    svg:
      bg(K.mint) +
      circle(512, 384, 250, K.tan) +
      circle(512, 384, 215, K.rose) +
      circle(512, 384, 85, K.mint) +
      [[400, 250, K.blue], [620, 260, K.yellow], [360, 460, K.white], [660, 480, K.blue], [520, 560, K.yellow]]
        .map(([x, y, c]) => rect(Number(x) - 20, Number(y) - 7, 40, 14, String(c), 7))
        .join(''),
  },
  {
    slug: 'cupcake',
    title: 'Cupcake',
    category: 'food',
    difficulty: 'medium',
    svg: bg(K.cream) + poly('330,450 694,450 640,710 384,710', K.blue) + circle(420, 430, 115, K.rose) + circle(604, 430, 115, K.rose) + circle(512, 360, 135, K.rose) + circle(512, 215, 40, K.red),
  },
  {
    slug: 'cherries',
    title: 'Two cherries',
    category: 'food',
    difficulty: 'easy',
    svg: bg(K.white) + line('M 540 170 Q 440 300 400 470', K.green, 18) + line('M 540 170 Q 600 330 620 490', K.green, 18) + ellipse(600, 170, 80, 32, K.lime, -20) + circle(400, 540, 100, K.red) + circle(625, 560, 100, K.red),
  },
  {
    slug: 'orange-slice',
    title: 'Orange slice',
    category: 'food',
    difficulty: 'easy',
    svg:
      bg(K.navy) +
      circle(512, 384, 270, K.orange) +
      circle(512, 384, 235, K.yellow) +
      Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return line(`M 512 384 L ${Math.round(512 + Math.cos(a) * 235)} ${Math.round(384 + Math.sin(a) * 235)}`, K.white, 14);
      }).join(''),
  },

  // ------------------------------------------------------------------ animals
  {
    slug: 'orange-fish',
    title: 'Orange fish',
    category: 'animals',
    difficulty: 'easy',
    svg: bg(K.blue) + ellipse(470, 384, 240, 145, K.orange) + poly('690,384 870,250 870,518', K.orange) + circle(360, 350, 30, K.white) + circle(360, 350, 14, K.black) + circle(170, 180, 22, K.sky) + circle(210, 110, 14, K.sky),
  },
  {
    slug: 'grey-cat',
    title: 'Grey cat face',
    category: 'animals',
    difficulty: 'medium',
    svg:
      bg(K.yellow) +
      poly('300,300 350,90 480,230', K.grey) +
      poly('724,300 674,90 544,230', K.grey) +
      poly('340,250 360,150 430,230', K.rose) +
      poly('684,250 664,150 594,230', K.rose) +
      circle(512, 420, 240, K.grey) +
      ellipse(420, 380, 32, 44, K.green) +
      ellipse(604, 380, 32, 44, K.green) +
      poly('480,470 544,470 512,510', K.rose) +
      line('M 300 480 L 420 500 M 300 540 L 420 520 M 724 480 L 604 500 M 724 540 L 604 520', K.black, 6),
  },
  {
    slug: 'ladybug',
    title: 'Ladybug',
    category: 'animals',
    difficulty: 'easy',
    svg:
      bg(K.lime) +
      circle(512, 210, 95, K.black) +
      circle(512, 430, 230, K.red) +
      line('M 512 210 L 512 660', K.black, 12) +
      [[410, 340], [620, 340], [390, 480], [640, 480], [450, 590], [580, 590]].map(([x, y]) => circle(x, y, 38, K.black)).join(''),
  },
  {
    slug: 'snail',
    title: 'Snail',
    category: 'animals',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 620, W, 148, K.green) +
      rect(230, 560, 600, 70, K.tan, 35) +
      circle(290, 520, 55, K.tan) +
      line('M 275 470 L 250 380 M 305 470 L 330 380', K.tan, 10) +
      circle(560, 430, 180, K.orange) +
      circle(560, 430, 115, K.yellow) +
      circle(560, 430, 50, K.orange),
  },
  {
    slug: 'owl',
    title: 'Brown owl',
    category: 'animals',
    difficulty: 'medium',
    svg:
      bg(K.navy) +
      poly('330,230 360,120 430,200', K.brown) +
      poly('694,230 664,120 594,200', K.brown) +
      ellipse(512, 430, 220, 270, K.brown) +
      ellipse(512, 510, 135, 165, K.tan) +
      circle(425, 330, 72, K.white) +
      circle(599, 330, 72, K.white) +
      circle(425, 330, 32, K.black) +
      circle(599, 330, 32, K.black) +
      poly('482,390 542,390 512,440', K.orange),
  },
  {
    slug: 'yellow-chick',
    title: 'Yellow chick',
    category: 'animals',
    difficulty: 'easy',
    svg: bg(K.sky) + rect(0, 620, W, 148, K.lime) + circle(512, 440, 200, K.yellow) + circle(450, 380, 20, K.black) + poly('560,410 650,440 560,470', K.orange) + line('M 470 640 L 450 700 M 560 640 L 580 700', K.orange, 14),
  },
  {
    slug: 'blue-whale',
    title: 'Blue whale',
    category: 'animals',
    difficulty: 'easy',
    svg:
      bg(K.navy) +
      ellipse(470, 450, 300, 170, K.blue) +
      poly('740,420 900,300 900,540', K.blue) +
      circle(320, 420, 20, K.black) +
      line('M 420 280 L 420 190 M 420 200 Q 380 150 350 170 M 420 200 Q 460 150 490 170', K.sky, 14),
  },
  {
    slug: 'frog-face',
    title: 'Frog face',
    category: 'animals',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      circle(370, 280, 95, K.lime) +
      circle(654, 280, 95, K.lime) +
      ellipse(512, 470, 300, 210, K.lime) +
      circle(370, 280, 55, K.white) +
      circle(654, 280, 55, K.white) +
      circle(370, 290, 25, K.black) +
      circle(654, 290, 25, K.black) +
      line('M 380 520 Q 512 610 644 520', K.green, 14) +
      circle(320, 470, 30, K.rose) +
      circle(704, 470, 30, K.rose),
  },
  {
    slug: 'penguin',
    title: 'Penguin',
    category: 'animals',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 640, W, 128, K.white) +
      ellipse(512, 410, 175, 260, K.black) +
      ellipse(512, 460, 120, 195, K.white) +
      circle(460, 260, 18, K.white) +
      circle(564, 260, 18, K.white) +
      poly('482,300 542,300 512,340', K.orange) +
      ellipse(440, 665, 55, 22, K.orange) +
      ellipse(584, 665, 55, 22, K.orange),
  },

  // ------------------------------------------------------------------ objects
  {
    slug: 'red-umbrella',
    title: 'Red umbrella in the rain',
    category: 'objects',
    difficulty: 'easy',
    svg:
      bg(K.grey) +
      dome(512, 400, 260, K.red) +
      line('M 512 400 L 512 620 Q 512 680 460 670', K.black, 18) +
      [[160, 150], [260, 320], [820, 180], [880, 380], [180, 560], [820, 580]].map(([x, y]) => ellipse(x, y, 10, 22, K.sky)).join(''),
  },
  {
    slug: 'three-balloons',
    title: 'Three balloons',
    category: 'objects',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      line('M 360 380 L 512 700 M 512 330 L 512 700 M 664 380 L 512 700', K.dark, 6) +
      ellipse(360, 300, 105, 130, K.red) +
      ellipse(664, 300, 105, 130, K.blue) +
      ellipse(512, 240, 105, 130, K.yellow),
  },
  {
    slug: 'light-bulb',
    title: 'Light bulb',
    category: 'objects',
    difficulty: 'medium',
    svg:
      bg(K.navy) +
      line('M 512 60 L 512 110 M 300 150 L 340 190 M 724 150 L 684 190 M 220 330 L 280 330 M 804 330 L 744 330', K.yellow, 16) +
      circle(512, 330, 175, K.cream) +
      rect(440, 450, 144, 80, K.cream) +
      rect(450, 530, 124, 110, K.grey, 12) +
      line('M 450 565 L 574 565 M 450 605 L 574 605', K.dark, 10),
  },
  {
    slug: 'coffee-mug',
    title: 'Coffee mug',
    category: 'objects',
    difficulty: 'easy',
    svg:
      bg(K.orange) +
      `<circle cx="660" cy="450" r="75" fill="none" stroke="${K.white}" stroke-width="40"/>` +
      rect(350, 300, 300, 330, K.white, 30) +
      ellipse(500, 305, 140, 28, K.brown) +
      line('M 440 250 Q 420 200 450 160 M 540 250 Q 520 200 550 160', K.white, 12),
  },
  {
    slug: 'gift-box',
    title: 'Gift box',
    category: 'objects',
    difficulty: 'easy',
    svg:
      bg(K.purple) +
      rect(300, 370, 424, 300, K.red) +
      rect(270, 300, 484, 90, K.red) +
      rect(482, 300, 60, 370, K.yellow) +
      ellipse(450, 270, 75, 40, K.yellow, 20) +
      ellipse(574, 270, 75, 40, K.yellow, -20),
  },
  {
    slug: 'wall-clock',
    title: 'Wall clock',
    category: 'objects',
    difficulty: 'medium',
    svg:
      bg(K.teal) +
      circle(512, 384, 275, K.black) +
      circle(512, 384, 250, K.white) +
      [0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return circle(Math.round(512 + Math.cos(a) * 205), Math.round(384 + Math.sin(a) * 205), 16, K.black);
      }).join('') +
      line('M 512 384 L 512 220 M 512 384 L 630 440', K.black, 18) +
      circle(512, 384, 22, K.red),
  },
  {
    slug: 'red-heart',
    title: 'Red heart',
    category: 'objects',
    difficulty: 'easy',
    svg: bg(K.rose) + path('M 512 690 C 120 450 180 140 400 160 C 470 165 505 215 512 250 C 519 215 554 165 624 160 C 844 140 904 450 512 690 Z', K.red),
  },
  {
    slug: 'candle',
    title: 'Candle',
    category: 'objects',
    difficulty: 'medium',
    svg: bg(K.navy) + ellipse(512, 680, 210, 42, K.yellow) + rect(452, 360, 120, 330, K.white) + ellipse(512, 290, 42, 72, K.orange) + ellipse(512, 305, 20, 40, K.yellow),
  },
  {
    slug: 'kite',
    title: 'Kite in the sky',
    category: 'objects',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      cloud(700, 560, 1) +
      poly('480,110 670,330 480,560 290,330', K.red) +
      line('M 480 110 L 480 560 M 290 330 L 670 330', K.yellow, 10) +
      line('M 480 560 Q 420 640 480 700 Q 540 740 520 768', K.dark, 6),
  },

  // ------------------------------------------------------------------ vehicles
  {
    slug: 'red-car',
    title: 'Red car',
    category: 'vehicles',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      rect(0, 570, W, 198, K.dark) +
      rect(360, 290, 300, 140, K.red, 40) +
      rect(200, 400, 620, 150, K.red, 30) +
      rect(395, 320, 105, 80, K.sky, 10) +
      rect(525, 320, 105, 80, K.sky, 10) +
      circle(340, 560, 70, K.black) +
      circle(690, 560, 70, K.black) +
      circle(340, 560, 28, K.grey) +
      circle(690, 560, 28, K.grey),
  },
  {
    slug: 'sailboat',
    title: 'Sailboat',
    category: 'vehicles',
    difficulty: 'easy',
    svg: bg(K.sky) + rect(0, 520, W, 248, K.blue) + poly('270,510 754,510 690,610 334,610', K.brown) + rect(502, 150, 16, 360, K.dark) + poly('520,165 520,490 750,490', K.white) + poly('500,210 500,490 320,490', K.red),
  },
  {
    slug: 'rocket',
    title: 'Rocket',
    category: 'vehicles',
    difficulty: 'medium',
    svg:
      bg(K.navy) +
      stars([[150, 120], [860, 160], [230, 520], [820, 560], [120, 330]]) +
      poly('440,580 584,580 560,690 512,650 464,690', K.orange) +
      poly('420,270 604,270 512,100', K.red) +
      rect(420, 260, 184, 330, K.white, 20) +
      poly('420,470 330,600 420,590', K.red) +
      poly('604,470 694,600 604,590', K.red) +
      circle(512, 370, 56, K.blue),
  },
  {
    slug: 'hot-air-balloon',
    title: 'Hot air balloon',
    category: 'vehicles',
    difficulty: 'easy',
    svg: bg(K.sky) + cloud(90, 600, 1) + circle(512, 290, 210, K.red) + ellipse(512, 290, 75, 210, K.yellow) + line('M 400 460 L 470 580 M 624 460 L 554 580', K.dark, 6) + rect(460, 575, 104, 85, K.brown, 10),
  },
  {
    slug: 'school-bus',
    title: 'Yellow bus',
    category: 'vehicles',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 600, W, 168, K.dark) +
      rect(170, 290, 690, 300, K.yellow, 30) +
      [220, 350, 480, 610].map((x) => rect(x, 330, 100, 90, K.sky, 10)).join('') +
      rect(740, 330, 80, 180, K.sky, 10) +
      circle(320, 590, 62, K.black) +
      circle(710, 590, 62, K.black),
  },
  {
    slug: 'steam-train',
    title: 'Green steam train',
    category: 'vehicles',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 640, W, 20, K.dark) +
      circle(330, 180, 45, K.grey) +
      circle(390, 130, 55, K.grey) +
      rect(290, 230, 70, 120, K.black) +
      rect(230, 340, 420, 210, K.green, 20) +
      rect(600, 240, 200, 310, K.green, 20) +
      rect(640, 280, 120, 90, K.sky, 10) +
      circle(330, 580, 60, K.red) +
      circle(500, 580, 60, K.red) +
      circle(700, 580, 60, K.red),
  },
  {
    slug: 'airplane',
    title: 'Airplane',
    category: 'vehicles',
    difficulty: 'medium',
    svg:
      bg(K.blue) +
      cloud(90, 140, 0.9) +
      cloud(740, 610, 0.9) +
      poly('470,380 600,380 520,620 440,620', K.grey) +
      poly('470,380 600,380 520,160 440,160', K.grey) +
      poly('780,380 880,240 890,380', K.red) +
      ellipse(512, 384, 350, 72, K.white) +
      [320, 400, 480, 560, 640].map((x) => circle(x, 370, 16, K.blue)).join(''),
  },
  {
    slug: 'submarine',
    title: 'Yellow submarine',
    category: 'vehicles',
    difficulty: 'easy',
    svg:
      bg(K.teal) +
      rect(470, 180, 20, 90, K.dark) +
      rect(430, 250, 140, 110, K.yellow, 20) +
      ellipse(512, 430, 310, 135, K.yellow) +
      [370, 512, 654].map((x) => circle(x, 430, 42, K.sky)).join('') +
      circle(880, 250, 20, K.sky) +
      circle(920, 180, 14, K.sky),
  },

  // ------------------------------------------------------------------ buildings
  {
    slug: 'little-house',
    title: 'Little house',
    category: 'buildings',
    difficulty: 'easy',
    svg: bg(K.sky) + rect(0, 620, W, 148, K.lime) + rect(330, 370, 360, 270, K.cream) + poly('290,380 512,180 734,380', K.red) + rect(475, 500, 80, 140, K.brown) + rect(370, 420, 80, 70, K.sky) + rect(580, 420, 80, 70, K.sky),
  },
  {
    slug: 'lighthouse',
    title: 'Lighthouse',
    category: 'buildings',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 600, W, 168, K.blue) +
      ellipse(512, 640, 220, 60, K.grey) +
      poly('440,620 584,620 556,230 468,230', K.white) +
      poly('460,500 564,500 559,430 465,430', K.red) +
      poly('468,340 556,340 553,290 471,290', K.red) +
      rect(462, 170, 100, 60, K.yellow) +
      poly('450,175 574,175 512,110', K.red),
  },
  {
    slug: 'castle',
    title: 'Castle',
    category: 'buildings',
    difficulty: 'medium',
    svg:
      bg(K.sky) +
      rect(0, 640, W, 128, K.lime) +
      rect(250, 250, 140, 400, K.grey) +
      rect(634, 250, 140, 400, K.grey) +
      rect(390, 360, 244, 290, K.grey) +
      [250, 300, 350, 634, 684, 734].map((x) => rect(x, 210, 40, 45, K.grey)).join('') +
      path('M 452 650 L 452 540 A 60 60 0 0 1 572 540 L 572 650 Z', K.brown) +
      line('M 320 250 L 320 150 M 704 250 L 704 150', K.dark, 8) +
      poly('320,150 390,175 320,200', K.red) +
      poly('704,150 774,175 704,200', K.red),
  },
  {
    slug: 'red-barn',
    title: 'Red barn',
    category: 'buildings',
    difficulty: 'easy',
    svg: bg(K.sky) + rect(0, 620, W, 148, K.lime) + rect(320, 340, 384, 300, K.red) + poly('290,350 512,170 734,350', K.maroon) + rect(432, 450, 160, 190, K.white) + line('M 432 450 L 592 640 M 592 450 L 432 640', K.red, 14),
  },
  {
    slug: 'igloo',
    title: 'Igloo',
    category: 'buildings',
    difficulty: 'easy',
    svg:
      bg(K.sky) +
      rect(0, 560, W, 208, K.white) +
      dome(512, 580, 280, K.white) +
      line('M 250 480 Q 512 430 774 480 M 290 400 Q 512 350 734 400', K.grey, 8) +
      dome(512, 580, 90, K.dark),
  },
  {
    slug: 'camping-tent',
    title: 'Camping tent',
    category: 'buildings',
    difficulty: 'easy',
    svg:
      bg(K.navy) +
      circle(820, 140, 60, K.cream) +
      stars([[150, 120], [330, 80], [560, 150], [260, 250]]) +
      rect(0, 620, W, 148, K.green) +
      poly('260,640 480,260 700,640', K.orange) +
      poly('420,640 480,470 540,640', K.dark) +
      poly('790,640 830,560 870,640', K.yellow),
  },
  {
    slug: 'city-skyline',
    title: 'City at sunset',
    category: 'buildings',
    difficulty: 'medium',
    svg:
      bg(K.orange) +
      circle(512, 470, 150, K.yellow) +
      [
        [60, 330, 150, K.indigo],
        [230, 220, 130, K.dark],
        [380, 380, 160, K.purple],
        [560, 260, 140, K.dark],
        [720, 350, 120, K.indigo],
        [860, 240, 140, K.dark],
      ]
        .map(([x, top, w, c]) => rect(Number(x), Number(top), Number(w), H - Number(top), String(c)))
        .join('') +
      [[100, 400], [150, 470], [270, 300], [270, 400], [610, 330], [610, 430], [900, 320], [900, 420]].map(([x, y]) => rect(x, y, 26, 34, K.yellow)).join(''),
  },

  // ------------------------------------------------------------------ abstract
  {
    slug: 'three-stripes',
    title: 'Three stripes',
    category: 'abstract',
    difficulty: 'easy',
    svg: rect(0, 0, 342, H, K.blue) + rect(342, 0, 340, H, K.white) + rect(682, 0, 342, H, K.red),
  },
  {
    slug: 'target',
    title: 'Target',
    category: 'abstract',
    difficulty: 'easy',
    svg: bg(K.blue) + circle(512, 384, 300, K.red) + circle(512, 384, 220, K.white) + circle(512, 384, 140, K.red) + circle(512, 384, 60, K.white),
  },
  {
    slug: 'diagonal-split',
    title: 'Diagonal split',
    category: 'abstract',
    difficulty: 'easy',
    svg: poly(`0,0 ${W},0 0,${H}`, K.yellow) + poly(`${W},0 ${W},${H} 0,${H}`, K.purple),
  },
  {
    slug: 'sunburst',
    title: 'Sunburst',
    category: 'abstract',
    difficulty: 'medium',
    svg:
      bg(K.yellow) +
      Array.from({ length: 8 }, (_, i) => {
        const a0 = (i * Math.PI) / 4;
        const a1 = a0 + Math.PI / 8;
        const p = (a: number) => `${Math.round(512 + Math.cos(a) * 900)},${Math.round(384 + Math.sin(a) * 900)}`;
        return poly(`512,384 ${p(a0)} ${p(a1)}`, K.orange);
      }).join('') +
      circle(512, 384, 120, K.red),
  },
  {
    slug: 'polka-dots',
    title: 'Polka dots',
    category: 'abstract',
    difficulty: 'easy',
    svg: bg(K.teal) + [0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => circle(170 + c * 228, 160 + r * 224, 70, K.white))).join(''),
  },
  {
    slug: 'color-blocks',
    title: 'Color blocks',
    category: 'abstract',
    difficulty: 'medium',
    svg:
      bg(K.white) +
      rect(0, 0, 420, 460, K.red) +
      rect(700, 520, 324, 248, K.blue) +
      rect(0, 620, 240, 148, K.yellow) +
      line(`M 420 0 L 420 ${H} M 0 460 L ${W} 460 M 700 460 L 700 ${H} M 240 460 L 240 ${H} M 0 620 L 240 620 M 700 520 L ${W} 520`, K.black, 22),
  },
  {
    slug: 'rainbow-bands',
    title: 'Rainbow bands',
    category: 'abstract',
    difficulty: 'easy',
    svg: [K.red, K.orange, K.yellow, K.lime, K.blue, K.purple].map((c, i) => rect(0, i * 128, W, 128, c)).join(''),
  },
  {
    slug: 'four-squares',
    title: 'Four squares',
    category: 'abstract',
    difficulty: 'easy',
    svg: rect(0, 0, 512, 384, K.red) + rect(512, 0, 512, 384, K.blue) + rect(0, 384, 512, 384, K.yellow) + rect(512, 384, 512, 384, K.green),
  },
];

export function sceneSvg(scene: SimpleScene): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${scene.svg}</svg>`;
}
