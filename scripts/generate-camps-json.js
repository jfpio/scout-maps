const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Input and output paths
const tsvPath = path.join(__dirname, '../data/HAL 2025 - lista wyjazdów - Dane aktualne.tsv');
const tentSvgPath = path.join(__dirname, '../data/tent.svg');
const wolfSvgPath = path.join(__dirname, '../data/wolf.svg');
const outputPath = path.join(__dirname, '../public/index.html');

// Read TSV file
const tsvData = fs.readFileSync(tsvPath, 'utf8');
// Read SVG files and encode as data URLs
function svgToDataUrl(svgPath) {
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  // Inline as data:image/svg+xml;utf8,
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgContent);
}
const tentDataUrl = svgToDataUrl(tentSvgPath);
const wolfDataUrl = svgToDataUrl(wolfSvgPath);

// Parse TSV using PapaParse
const parsed = Papa.parse(tsvData, {
  header: true,
  delimiter: '\t',
  skipEmptyLines: true,
});

// Helper to parse GPS coordinates (handles both decimal and DMS)
function parseGPS(gps) {
  if (!gps) return null;
  // Decimal format: "53.53010681604106, 20.78754993842591"
  if (/^-?\d+\.\d+, ?-?\d+\.\d+$/.test(gps)) {
    const [lat, lng] = gps.split(',').map(Number);
    return { lat, lng };
  }
  // DMS format: "53°44'07.0\"N 21°38'39.3\"E"
  const dmsRegex = /(\d+)°(\d+)'([\d.]+)\"([NS])\s+(\d+)°(\d+)'([\d.]+)\"([EW])/;
  const match = gps.match(dmsRegex);
  if (match) {
    const lat = dmsToDecimal(+match[1], +match[2], +match[3], match[4] === 'S');
    const lng = dmsToDecimal(+match[5], +match[6], +match[7], match[8] === 'W');
    return { lat, lng };
  }
  return null;
}
function dmsToDecimal(deg, min, sec, negative) {
  let val = deg + min / 60 + sec / 3600;
  return negative ? -val : val;
}

// Map columns dynamically
const headerMap = parsed.meta.fields.reduce((acc, field) => {
  acc[field.trim()] = field;
  return acc;
}, {});

const camps = parsed.data
  .map(row => {
    if (row[headerMap['Odwołany?']] === 'TRUE') return null;
    const gps = row[headerMap['Współrzędne GPS']];
    const coords = parseGPS(gps);
    if (!coords) return null;
    // Collect all team names (Nazwa drużyny 1-8) if present and non-empty
    const teams = [];
    for (let i = 1; i <= 8; i++) {
      const teamName = row[headerMap[`Nazwa drużyny ${i}`]];
      if (teamName && teamName.trim()) {
        teams.push(teamName.trim());
      }
    }
    const name = `${row[headerMap['Nr']]} ${row[headerMap['Imię komendanta/komendantki']]} ${row[headerMap['Nazwisko komendanta/komendantki']]}`.trim();
    const adres = row[headerMap['Adres lub trasa wyjazdu']] || '';
    const email = row[headerMap['Adres mailowy w domenie @zhr.pl']] || '';
    const start = row[headerMap['Data rozpoczęcia wyjazdu']] || '';
    const end = row[headerMap['Data zakończenia wyjazdu']] || '';
    const teamsHtml = teams.length
      ? teams.map(t => `<div>- ${t}</div>`).join('')
      : 'brak';
    const detailsHtml =
      `<b>${name}</b><br>` +
      `<b>Adres:</b> ${adres}<br>` +
      `<b>Email:</b> ${email}<br>` +
      `<b>Data rozpoczęcia:</b> ${start}<br>` +
      `<b>Data zakończenia:</b> ${end}<br>` +
      `<b>Drużyny:</b> ${teamsHtml}`;
    return {
      category: row[headerMap['Forma wyjazdu (znormalizowana)']] || '',
      name,
      gps: coords,
      details: {
        Adres: adres,
        Email: email,
        'Data rozpoczęcia wyjazdu': start,
        'Data zakończenia wyjazdu': end,
        teams,
      },
      detailsHtml,
    };
  })
  .filter(Boolean);

// HTML template with inlined camps data and SVG icons as data URLs
const html = `<!-- AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Mapa Obozów Harcerskich</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    #map { width: 100vw; height: 100vh; }
    .camp-label {
      font-weight: bold;
      font-size: 1em;
      color: #333;
      text-align: center;
      margin-bottom: 2px;
      text-shadow: 0 0 2px #fff;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script>
    // Inlined camp data
    const camps = ${JSON.stringify(camps, null, 2)};

    // Inlined SVG icons as data URLs
    const tentDataUrl = '${tentDataUrl}';
    const wolfDataUrl = '${wolfDataUrl}';

    const icons = {
      'obóz stały': L.icon({
        iconUrl: tentDataUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      }),
      'kolonia': L.icon({
        iconUrl: wolfDataUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      }),
      'default': L.icon({
        iconUrl: tentDataUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      })
    };

    const map = L.map('map').setView([52, 19], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    camps.forEach(camp => {
      const icon = icons[camp.category] || icons['default'];
      // Create a divIcon with label above
      const marker = L.marker([camp.gps.lat, camp.gps.lng], { icon }).addTo(map);
      // Add label above icon
      const label = L.divIcon({
        className: 'camp-label',
        html: camp.name,
        iconAnchor: [16, 0],
        iconSize: [120, 24]
      });
      L.marker([camp.gps.lat, camp.gps.lng], { icon: label, interactive: false }).addTo(map);
      // Popup with details
      marker.bindPopup(camp.detailsHtml);
    });
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Generated ${outputPath} with ${camps.length} camps.`); 