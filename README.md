# Scout Camps Map

This project visualizes scout camps on an interactive map using Leaflet.js. Camp data is sourced from a TSV file and converted to JSON for the map.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Place your TSV file:**
   - Put your TSV file in the `data/` directory. The default file is:
     - `data/HAL 2025 - lista wyjazdów - Kopia arkusza Dane aktualne.tsv`

3. **Generate the JSON:**
   ```bash
   npm run generate
   ```
   This will create `public/camps.json`.

4. **View the map:**
   - Open `public/index.html` in your browser.
   - (Optional) Use a local server for best results, e.g.:
     ```bash
     npx serve public
     ```

## Customization
- The script dynamically maps columns by header name, so you can update the TSV file without changing the code.
- To change which fields are shown, edit `scripts/generate-camps-json.js` and `public/index.html` as needed.

## Dependencies
- [Leaflet.js](https://leafletjs.com/) (CDN in HTML)
- [PapaParse](https://www.papaparse.com/) (for TSV parsing) 