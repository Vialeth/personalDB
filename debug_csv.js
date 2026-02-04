const csv = require('csv-parser');
const fs = require('fs');
// const stripBom = require('strip-bom-stream'); // Not available

const results = [];
const filePath = '/home/omerfaruk/personalDb/ornekCSV/İzlenen Filmler 2025 16efafa3b4a9801a8617c9bf2a2e521c.csv';

console.log('Reading file:', filePath);

fs.createReadStream(filePath)
    .pipe(csv({
        mapHeaders: ({ header, index }) => {
            const cleaned = header.trim().replace(/^\ufeff/, '');
            console.log(`Header [${index}]: '${header}' -> Cleaned: '${cleaned}' (Code: ${header.charCodeAt(0)})`);
            return cleaned;
        }
    }))
    .on('data', (data) => {
        if (results.length < 1) {
            console.log('First Row Data:', data);
            console.log('Keys:', Object.keys(data));
        }
        results.push(data);
    })
    .on('end', () => {
        console.log('Done.');
    });
