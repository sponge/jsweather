const { registerFont, loadImage, createCanvas } = require('canvas');
const fs = require('fs');
const os = require('os');
const moment = require('moment');
const fetch = require('node-fetch');
const DarkSky = require('dark-sky');
require('moment-timezone');
const GIFEncoder = require('gif-encoder-2');

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

// css style font strings used for canvas ctx.font
const Fonts = {
  smFont: '36px Star4000 Small',
  mdFont: '36px Star4000',
  lgFont: '32px Star4000 Large'
};

const IconDescriptions = {
  'clear-day': 'Clear',
  'clear-night': 'Clear',
  'cloudy': 'Cloudy',
  'fog': 'Fog',
  'partly-cloudy-day': 'Partly\nCloudy',
  'partly-cloudy-night': 'Partly\nCloudy',
  'rain': 'Rain',
  'sleet': 'Sleet',
  'snow': 'Snow',
  'wind': 'Wind'
}

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

    // assume all shapes are rectangles for now
    if (cmd.shape) {
      if (cmd.shape === 'rectangle') {
        ctx.fillStyle = color;
        ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        ctx.fill();
      }
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
  const encoder = new GIFEncoder(975, 575)
  encoder.start()
  encoder.setDelay(150)

  ctx.antialias = 'none';

  // strings we need for drawing commands
  const topDateLine = info.date.format('h:mm:ss A');
  const bottomDateLine = info.date.format('ddd MMM D');
  let tickerLine = info.alert ? info.alert + '\n' : '';
  tickerLine += `Temp: ${info.temperature}°${info.unit}   Feels Like: ${info.feelsLike}°${info.unit}   Humidity: ${info.humidity}%`;

  // trim long address strings to fit
  let address = info.address;
  ctx.font = Fonts.mdFont;
  while (ctx.measureText(address).width > 550) {
    const end = address.lastIndexOf(',');
    address = address.substring(0, end !== -1 ? end : address.length - 1 ).trim();
  }

  const cmds = [
    {image: Images.bg, x: 0, y: 0},

    // top left address lines
    {font: Fonts.mdFont, text: address, x: 150, y: 34},
    {font: Fonts.mdFont, text: "Extended Forecast", color: Colors.Yellow, relative: true, x: 0, y: 36},

    // top right clock
    {font: Fonts.smFont, text: topDateLine, x: 695, y: 45},
    {font: Fonts.smFont, text: bottomDateLine, relative: true, x: 0, y: 25},

    // bottom ticker
    {shape: 'rectangle', color: info.alert ? Colors.Red : Colors.Teal, x: 0, y: 479, w: 975, h: 96},
    {font: Fonts.mdFont, text: tickerLine, x: 5, y: 510},
  ];

  await drawCommands(ctx, cmds);

  // each animated weather icon is either exactly 1 frame or 6 frames
  for (let f = 0; f < 6; f++) {
    const frame = createCanvas(975, 575);
    const fctx = frame.getContext('2d');

    fctx.antialias = 'none';
    fctx.drawImage(canvas, 0, 0);

    let d = 0;
    // loop through each day in the extended forecast object, should be 4
    for (const day of info.forecast) {
      const shortDayStr = day.date.format('ddd').toUpperCase();
      const dayIcon = Icons[day.icon][f] || Icons['clear-day'][f];
      const cmds = [
        // move the painting cursor to the top left of the content box
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
  return new Promise((resolve, reject) => {
    const buffer = encoder.out.getData();
    resolve(buffer);
  });
}

async function getWeather(location, bingKey, darkSkyKey) {
  const darksky = new DarkSky(darkSkyKey);

  const url = `http://dev.virtualearth.net/REST/v1/Locations/${encodeURI(location)}?includeNeighborhood=1&maxResults=1&include=queryParse&key=${bingKey}`;
  const response = await fetch(url);
  const jsonResponse = await response.json();

  // unwrap microsoft's garbage api
  const loc = jsonResponse.resourceSets[0].resources[0];
  const coords = loc.geocodePoints[0].coordinates;
  const address = loc.name;

  const forecast = await darksky.options({
    latitude: coords[0],
    longitude: coords[1],
    exclude: ['minutely', 'hourly'],
    units: 'auto'
  }).get();

  const results = {
    address: loc.name,
    unit: forecast.flags.units !== 'us' ? 'C' : 'F',
    date: moment(forecast.currently.time * 1000).tz(forecast.timezone),
    temperature: forecast.currently.temperature.toFixed(0),
    feelsLike: forecast.currently.apparentTemperature.toFixed(0),
    humidity: (forecast.currently.humidity * 100).toFixed(0),
    alert: forecast.alerts ? forecast.alerts.map(alert => alert.title).join(', ') : undefined,
    forecast: forecast.daily.data.map(d => { return {
      date: moment(d.time * 1000).tz(forecast.timezone),
      icon: d.icon,
      summary: IconDescriptions[d.icon] || d.icon,
      loTemp: d.temperatureMin.toFixed(0),
      hiTemp: d.temperatureMax.toFixed(0)
    }}).slice(0, 4)
  }

  return render(results);
}

if (require.main === module) {
  const config = require('./config.js');
  (async function main() {
    const gif = await getWeather(config.location, config.bingKey, config.darkSkyKey);
    fs.writeFileSync(__dirname + '/weather.gif', gif)
  })();
}

module.exports = {
  getWeather
};
