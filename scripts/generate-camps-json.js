const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Input and output paths
const tsvPath = path.join(__dirname, '../data/HAL.tsv');
const tentSvgPath = path.join(__dirname, '../public/tent.svg');
const wolfSvgPath = path.join(__dirname, '../public/wolf.svg');
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
  
  // Decimal format: "53.53010681604106, 20.78754993842591" or with location name: "53.814152, 21.185590, Borowski Las"
  // Also handle format without space after comma: "53,7946841, 17,4879548"
  if (/^-?\d+[,.]?\d+,\s*-?\d+[,.]?\d+/.test(gps)) {
    const parts = gps.split(',');
    // Replace comma with period for decimal separator
    const lat = parseFloat(parts[0].replace(',', '.'));
    const lng = parseFloat(parts[1].replace(',', '.'));
    return { lat, lng };
  }
  
  // DMS format with spaces: "51.518794 N, 22.896442 E"
  const dmsSpaceRegex = /^(\d+\.\d+)\s*([NS]),?\s*(\d+\.\d+)\s*([EW])$/;
  const spaceMatch = gps.match(dmsSpaceRegex);
  if (spaceMatch) {
    const lat = parseFloat(spaceMatch[1]) * (spaceMatch[2] === 'S' ? -1 : 1);
    const lng = parseFloat(spaceMatch[3]) * (spaceMatch[4] === 'W' ? -1 : 1);
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

// Track parsing warnings
const warnings = [];

const camps = parsed.data
  .map(row => {
    if (row[headerMap['Odwołany?']] === 'TRUE') return null;
    const gps = row[headerMap['Współrzędne GPS']];
    const coords = parseGPS(gps);
    const campType = row[headerMap['Forma wyjazdu (znormalizowana)']] || '';
    const campNr = row[headerMap['Nr']];
    
    // Log warning for camps that should be parsed but aren't
    if (!coords && (campType === 'obóz stały' || campType === 'kolonia')) {
      warnings.push(`Camp Nr ${campNr} (${campType}) - GPS parsing failed: "${gps || 'empty'}"`);
    }
    
    if (!coords) return null;
    // Collect all team names (Nazwa drużyny 1-8) if present and non-empty
    const teams = [];
    for (let i = 1; i <= 8; i++) {
      const teamName = row[headerMap[`Nazwa drużyny ${i}`]];
      if (teamName && teamName.trim()) {
        teams.push(teamName.trim());
      }
    }
    const instructorRank = row[headerMap['Stopień instruktorski komendanta/komendantki']] || '';
    const scoutRank = row[headerMap['Stopień harcerski komendanta/komendantki']] || '';
    const firstName = row[headerMap['Imię komendanta/komendantki']] || '';
    const lastName = row[headerMap['Nazwisko komendanta/komendantki']] || '';
    const campNumber = row[headerMap['Nr']] || '';
    
    // Build name with format: "Nr instruktorRank firstName lastName scoutRank"
    let nameParts = [campNumber];
    if (instructorRank && instructorRank !== 'brak') nameParts.push(instructorRank);
    nameParts.push(firstName, lastName);
    if (scoutRank && scoutRank !== 'brak') nameParts.push(scoutRank);
    const name = nameParts.filter(Boolean).join(' ');
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
      startDate: start,
      endDate: end,
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
    .date-filter {
      position: absolute;
      top: 10px;
      right: 10px;
      background: white;
      padding: 15px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 1000;
    }
    .date-filter h3 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 16px;
    }
    .date-filter label {
      display: block;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .date-filter input {
      width: 100%;
      margin-bottom: 10px;
      padding: 5px;
      border: 1px solid #ccc;
      border-radius: 3px;
    }
    .date-filter button {
      width: 100%;
      padding: 8px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
    }
    .date-filter button:hover {
      background: #0056b3;
    }
    .filter-info {
      margin-top: 10px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="date-filter">
    <h3>Filtr dat</h3>
    <label for="dateInput">Wybierz datę:</label>
    <input type="date" id="dateInput">
    <button onclick="filterByDate()">Pokaż obozy</button>
    <button onclick="showAllCamps()">Pokaż wszystkie</button>
    <div class="filter-info" id="filterInfo"></div>
  </div>
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

    // Store all markers and labels
    let allMarkers = [];
    let allLabels = [];

    // Function to parse date in DD-MM-YYYY format
    function parseDate(dateStr) {
      if (!dateStr) return null;
      const parts = dateStr.split('-');
      if (parts.length !== 3) return null;
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }

    // Function to check if date is in camp range
    function isDateInCampRange(camp, date) {
      const startDate = parseDate(camp.startDate);
      const endDate = parseDate(camp.endDate);
      if (!startDate || !endDate) return false;
      return date >= startDate && date <= endDate;
    }

    // Create markers for all camps
    camps.forEach(camp => {
      const icon = icons[camp.category] || icons['default'];
      const marker = L.marker([camp.gps.lat, camp.gps.lng], { icon }).addTo(map);
      const label = L.divIcon({
        className: 'camp-label',
        html: camp.name,
        iconAnchor: [16, 0],
        iconSize: [120, 24]
      });
      const labelMarker = L.marker([camp.gps.lat, camp.gps.lng], { icon: label, interactive: false }).addTo(map);
      marker.bindPopup(camp.detailsHtml);
      
      // Store references
      allMarkers.push({ marker, labelMarker, camp });
    });

    // Filter camps by date
    function filterByDate() {
      const dateInput = document.getElementById('dateInput').value;
      if (!dateInput) {
        alert('Proszę wybrać datę');
        return;
      }
      
      const selectedDate = new Date(dateInput);
      let visibleCount = 0;
      
      allMarkers.forEach(({ marker, labelMarker, camp }) => {
        if (isDateInCampRange(camp, selectedDate)) {
          marker.addTo(map);
          labelMarker.addTo(map);
          visibleCount++;
        } else {
          map.removeLayer(marker);
          map.removeLayer(labelMarker);
        }
      });
      
      document.getElementById('filterInfo').textContent = 
        \`Pokazano \${visibleCount} obozów aktywnych w dniu \${dateInput}\`;
    }

    // Show all camps
    function showAllCamps() {
      allMarkers.forEach(({ marker, labelMarker }) => {
        marker.addTo(map);
        labelMarker.addTo(map);
      });
      document.getElementById('filterInfo').textContent = 
        \`Pokazano wszystkie obozy (\${camps.length})\`;
      document.getElementById('dateInput').value = '';
    }
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Generated ${outputPath} with ${camps.length} camps.`);

// Print warnings
if (warnings.length > 0) {
  console.log('\nWarnings:');
  warnings.forEach(warning => console.log(`  - ${warning}`));
} 