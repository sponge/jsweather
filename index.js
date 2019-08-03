const { registerFont, loadImage, createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');
const fs = require('fs');
const moment = require('moment');

// css style color presets, to be passed in ctx.fillStyle
const Colors = {
  White: 'rgba(255, 255, 255, 1.0)',
  Black: 'rgba(0, 0, 0, 1.0)',
  Blue: 'rgba(8, 15, 255, 1.0)',
  LightBlue: 'rgba(121, 112, 255, 1.0)',
  DarkBlue: 'rgba(41, 25, 92, 1.0)',
  Orange: 'rgba(194, 108, 2, 1.0)',
  Red: 'rgba(198, 19, 2, 1.0)',
  Teal: 'rgba(47, 65, 120, 1.0)',
  TealAlso: 'rgba(172, 177, 237, 1.0)',
  Yellow: 'rgba(205, 185, 0, 1.0)'
};

// dict of list of promises, so we can load all the images once without hitting the disk every time
const Icons = {
  'clear-day': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/clear-day/${i}.png`)),
  'clear-night': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/clear-night/0.png`)),
  'cloudy': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/cloudy/0.png`)),
  'fog': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/fog/0.png`)),
  'partly-cloudy-day': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/partly-cloudy-day/${i}.png`)),
  'partly-cloudy-night': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/partly-cloudy-night/0.png`)),
  'rain': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/rain/${i}.png`)),
  'sleet': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/sleet/${i}.png`)),
  'snow': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/snow/0.png`)),
  'wind': Array(6).fill().map((e, i) => loadImage(`${__dirname}/res/wind/0.png`))
};

// dict of promises for non-icon images to be loaded once
const Images = {
  'bg': loadImage(`${__dirname}/res/background.png`)
}

// fonts used
registerFont(`${__dirname}/res/Star4000 Large.ttf`, {family: 'Star4000 Large'});
registerFont(`${__dirname}/res/Star4000 Small.ttf`, {family: 'Star4000 Small'});
registerFont(`${__dirname}/res/Star4000.ttf`, {family: 'Star4000'});

const Fonts = {
  smFont: '36px Star4000 Small',
  mdFont: '36px Star4000',
  lgFont: '32px Star4000 Large'
};

// very light abstraction over drawing. loop through a set of drawing commands and blit them to the canvas
// some stuff i don't purposefully support like right aligned images just because i never use them
async function drawCommands(ctx, cmds) {
  let x, y = 0;
  for (const cmd of cmds) {
    // if it's relative, add the position instead of setting it
    x = cmd.relative === true ? x + cmd.x : cmd.x;
    y = cmd.relative === true ? y + cmd.y : cmd.y;

    // default to white
    const color = cmd.color || Colors.White;
    const halign = cmd.halign || 'left';

    // if a css font string exists, set the font and draw the text
    if (cmd.font) {
      // setup defaults
      ctx.font = cmd.font;
      const text = cmd.text || '';
      const measure = ctx.measureText(text);

      // offset the text based on halign
      const textX = halign === 'center' ? x - measure.width / 2 : halign === 'right' ? x - measure.width : x;

      // draw the text
      ctx.fillStyle = Colors.Black;
      ctx.fillText(text, textX + 2, y + 2);
      ctx.fillStyle = color;
      ctx.fillText(text, textX, y);
    }

    if (cmd.shape) {
      ctx.fillStyle = color;
      ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
      ctx.fill();
    }

    // if there's an image attached (which are promises), resolve and draw
    if (cmd.image) {
      const img = await cmd.image;
      const imgX = halign === 'center' ? x - img.width / 2 : halign === 'right' ? x - img.width : x;

      // draw the image
      ctx.drawImage(img, imgX, y);
    }
  }
}

async function render(info) {
  const canvas = createCanvas(975, 575);
  const ctx = canvas.getContext('2d');

  ctx.antialias = 'none';

  // strings we need for drawing commands

  const topDateLine = info.date.format('h:mm:ss A');
  const bottomDateLine = info.date.format('ddd MMM D');
  let tickerLine = info.alert ? info.alert + '\n' : '';
  tickerLine += `Temp: ${info.temperature}°${info.unit}   Feels Like: ${info.feelsLike}°${info.unit}`;

  // FIXME: red alert at bottom

  const cmds = [
    {image: Images.bg, x: 0, y: 0},

    // top left address lines
    {font: Fonts.mdFont, text: info.address, x: 150, y: 34},
    {font: Fonts.mdFont, text: "Extended Forecast", color: Colors.Yellow, relative: true, x: 0, y: 36},

    // top right clock
    {font: Fonts.smFont, text: topDateLine, x: 695, y: 45},
    {font: Fonts.smFont, text: bottomDateLine, relative: true, x: 0, y: 25},

    // bottom ticker
    {shape: 'rectangle', color: info.alert ? Colors.Red : Colors.Teal, x: 0, y: 479, w: 975, h: 96},
    {font: Fonts.mdFont, text: tickerLine, x: 5, y: 510},
  ];

  await drawCommands(ctx, cmds);

  // the base image is done, use this as the background for the animated forecast
  const encoder = new GIFEncoder(975, 575);

  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(100);

  for (let f = 0; f < 6; f++) {
    const frame = createCanvas(975, 575);
    const fctx = frame.getContext('2d');

    fctx.antialias = 'none';
    fctx.drawImage(canvas, 0, 0);

    let d = 0;
    for (const day of info.forecast) {
      const shortDayStr = day.date.format('ddd').toUpperCase();
      const dayIcon = Icons[day.icon][f] || Icons['clear-day'][f];
      const cmds = [
        // move the cursor to the top left of the content box
        {x: 15 + 244 * d++, y: 90},
        // abbreviated day, icon, summary
        {font: Fonts.mdFont, text: shortDayStr, halign: 'center', color: Colors.Yellow, relative: true, x: 100, y: 40},
        {image: dayIcon, halign: 'center', relative: true, x: 0, y: 15},
        {font: Fonts.mdFont, text: day.summary, halign: 'center', relative: true, x: 0, y: 165},
        // lo
        {font: Fonts.mdFont, text: "Lo", color: Colors.TealAlso, halign: 'center', relative: true, x: -50, y: 90},
        {font: Fonts.lgFont, text: day.loTemp, halign: 'center', relative: true, x: 0, y: 45},
        // hi (double the x movement and undo y since we're in relative mode)
        {font: Fonts.mdFont, text: "Hi", color: Colors.Yellow, halign: 'center', relative: true, x: 100, y: -45},
        {font: Fonts.lgFont, text: day.hiTemp, halign: 'center', relative: true, x: 0, y: 45},
      ];

      await drawCommands(fctx, cmds);
    }

    encoder.addFrame(fctx);
  }

  encoder.finish();

  return encoder.out.getData();
}

const exampleWeather = {
  address: "Lake Hopatcong 07849, NJ",
  unit: "F",
  date: moment(),
  temperature: 75,
  feelsLike: 76,
  alert: undefined,
  // alert: 'Severe Thunderstorm Watch',
  forecast: [
    { date: moment('2019-07-31'), icon: 'rain', summary: 'Rain', loTemp: 65, hiTemp: 80 },
    { date: moment('2019-08-01'), icon: 'partly-cloudy-day', summary: 'Partly\nCloudy', loTemp: 64, hiTemp: 83 },
    { date: moment('2019-08-02'), icon: 'cloudy', summary: 'Cloudy', loTemp: 65, hiTemp: 79 },
    { date: moment('2019-08-03'), icon: 'rain', summary: 'Rain', loTemp: 64, hiTemp: 81 }
  ]
};

function getWeather(location, darkSkyApiKey) {
  // FIXME: add rest of api stuff here
  return render(exampleWeather)
}

if (require.main === module) {
  (async function main() {
    const gif = await getWeather('75287', 'asdf');
    fs.writeFileSync(__dirname + '/weather.gif', gif)
  })();
}

module.exports = {
  getWeather
};